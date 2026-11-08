import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PASSWORD, startServer, TestServer } from './helpers';

const SECRET = 'DEVICE-SECRET';

let server: TestServer;
let admin: string;
let viewer: string;
let limited: string;
let assetId: string;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.createUser(admin, 'viewer', { canViewDevicePasswords: true });
  await server.createUser(admin, 'limited');
  viewer = await server.login('viewer');
  limited = await server.login('limited');
  assetId = (await server.call('POST', '/assets', admin, { itemNumber: 'A1', devicePassword: SECRET })).json().id;
});
after(() => server.stop());

const reveal = (cookie: string, password: unknown, id = assetId) =>
  server.call('POST', `/assets/${id}/reveal-password`, cookie, { password });

test('asset responses never include the password, even for admins', async () => {
  const created = await server.call('POST', '/assets', admin, { itemNumber: 'A2', devicePassword: SECRET });
  const responses = [
    created,
    await server.call('GET', '/assets', admin),
    await server.call('GET', `/assets/${assetId}`, admin),
    await server.call('GET', `/assets/${assetId}`, viewer),
    await server.call('PUT', `/assets/${assetId}`, admin, { itemNumber: 'A1', status: 'In Use', condition: 'GOOD' })
  ];
  for (const response of responses) {
    assert.ok(response.status < 300, response.text);
    assert.ok(!response.text.includes(SECRET), response.text);
  }
});

test('responses say whether a password is set', async () => {
  const empty = (await server.call('POST', '/assets', admin, { itemNumber: 'A3' })).json();
  assert.equal(empty.hasDevicePassword, false);
  assert.equal((await server.call('GET', `/assets/${assetId}`, viewer)).json().hasDevicePassword, true);
});

test('editing without sending a password keeps it', async () => {
  const response = await reveal(viewer, PASSWORD);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.json().devicePassword, SECRET);
});

test('the correct account password reveals the device password', async () => {
  const response = await reveal(admin, PASSWORD);
  assert.equal(response.json().devicePassword, SECRET);
});

test('a user without permission cannot reveal it, even with the correct password', async () => {
  const response = await reveal(limited, PASSWORD);
  assert.equal(response.status, 403);
  assert.ok(!response.text.includes(SECRET));
});

test('a wrong password reveals nothing and keeps the user signed in', async () => {
  const response = await reveal(viewer, 'wrong-password');
  assert.equal(response.status, 403);
  assert.equal(response.json().error, 'Incorrect password');
  assert.ok(!response.text.includes(SECRET));
  assert.equal((await server.call('GET', '/auth/status', viewer)).json().authenticated, true);
});

test('invalid requests are rejected', async () => {
  assert.equal((await reveal(viewer, 123)).status, 400);
  assert.equal((await reveal(viewer, '')).status, 400);
  assert.equal((await reveal(viewer, PASSWORD, 'missing')).status, 404);
});

test('the old verify endpoint is gone', async () => {
  assert.equal((await server.call('POST', '/auth/verify-password', viewer, { password: PASSWORD })).status, 404);
});

test('successful reveals are not rate limited', async () => {
  for (let i = 0; i < 12; i++) {
    assert.equal((await reveal(viewer, PASSWORD)).status, 200);
  }
});

// Keep last: this uses up the attempts for the rest of the file
test('repeated wrong passwords are rate limited', async () => {
  let status = 0;
  for (let i = 0; i < 12 && status !== 429; i++) {
    status = (await reveal(viewer, 'wrong-password')).status;
  }
  assert.equal(status, 429);
  assert.equal((await reveal(viewer, PASSWORD)).status, 429);
});
