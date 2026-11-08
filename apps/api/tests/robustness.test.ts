import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import { startServer, TestServer } from './helpers';

let server: TestServer;
let admin: string;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
});
after(() => server.stop());

test('malformed quick verify input is rejected without crashing the server', async () => {
  for (const itemNumber of [123, ['a'], { a: 1 }, true]) {
    const response = await server.call('POST', '/stocktakes/any/quick-verify', admin, { itemNumber });
    assert.equal(response.status, 400, JSON.stringify(itemNumber));
    assert.equal(await server.isAlive(), true);
  }
});

test('malformed subnets are rejected without crashing the server', async () => {
  for (const cidr of [123, ['10.0.0.0/24'], { a: 1 }]) {
    const response = await server.call('POST', '/network/subnets', admin, { name: `bad-${cidr}`, cidr });
    assert.equal(response.status, 400, JSON.stringify(cidr));
    assert.equal(await server.isAlive(), true);
  }
  assert.equal((await server.call('POST', '/network/subnets', admin, { name: 'good', cidr: '10.0.0.0/24' })).status, 201);
});

test('an attachment upload cannot create folders outside the upload directory', async () => {
  const response = await server.upload(
    '/software/..%2F..%2Fescaped/attachments',
    admin,
    'licence.pdf',
    'content',
    'application/pdf'
  );

  assert.equal(response.status, 404);
  assert.equal(existsSync(path.join(server.dir, 'escaped')), false);
});

test('an attachment for unknown software writes nothing', async () => {
  const response = await server.upload('/software/missing/attachments', admin, 'licence.pdf', 'content', 'application/pdf');

  assert.equal(response.status, 404);
  assert.equal(existsSync(path.join(server.uploadDir, 'software', 'missing')), false);
});

test('attachments can still be uploaded and downloaded', async () => {
  const software = (await server.call('POST', '/software', admin, { itemNumber: 'S1', name: 'Editor' })).json();

  const uploaded = await server.upload(`/software/${software.id}/attachments`, admin, 'licence.pdf', 'file body', 'application/pdf');
  assert.equal(uploaded.status, 201, uploaded.text);
  assert.equal(readdirSync(path.join(server.uploadDir, 'software', software.id)).length, 1);

  const downloaded = await server.call('GET', `/software/${software.id}/attachments/${uploaded.json().id}`, admin);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.text, 'file body');
});
