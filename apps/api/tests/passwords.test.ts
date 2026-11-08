import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, TestServer } from './helpers';

const SECRET = 'PLAINTEXT-SECRET';

let server: TestServer;
let admin: string;
let limited: string;
let assetId: string;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.createUser(admin, 'limited');
  limited = await server.login('limited');

  const created = await server.call('POST', '/assets', admin, { itemNumber: 'A1', devicePassword: `${SECRET}-1` });
  assetId = created.json().id;
  await server.call('PUT', `/assets/${assetId}`, admin, {
    itemNumber: 'A1',
    status: 'In Use',
    condition: 'GOOD',
    devicePassword: `${SECRET}-2`
  });
  await server.call('POST', '/assets/bulk', admin, {
    sharedFields: { devicePassword: `${SECRET}-3` },
    serialNumbers: ['SERIAL1']
  });
  await server.call('PUT', '/assets/bulk-update', admin, { ids: [assetId], fields: { status: 'Stored' } });
});
after(() => server.stop());

test('audit log never stores device passwords in plain text', async () => {
  const entries = await server.prisma.auditLog.findMany();
  assert.ok(entries.length >= 4);
  for (const entry of entries) {
    assert.ok(!entry.changes?.includes(SECRET), `${entry.action}: ${entry.changes}`);
  }
});

test('asset history hides passwords but still shows that one changed', async () => {
  const response = await server.call('GET', `/assets/${assetId}/history`, limited);
  assert.equal(response.status, 200);
  assert.ok(!response.text.includes(SECRET));

  const logs = response.json().map((log: any) => ({ ...log, changes: JSON.parse(log.changes) }));
  const update = logs.find((log: any) => log.action === 'UPDATE');
  assert.notEqual(update.changes.before.devicePassword, update.changes.after.devicePassword);

  const bulk = logs.find((log: any) => log.action === 'BULK_UPDATE');
  assert.equal(bulk.changes.before.devicePassword, bulk.changes.after.devicePassword);
});

test('stocktake responses never include device passwords', async () => {
  const asset = (await server.call('POST', '/assets', admin, { itemNumber: 'ST1', devicePassword: `${SECRET}-4` })).json();
  const { id } = (await server.call('POST', '/stocktakes', admin, { name: 'Check' })).json();

  const responses = [
    [200, await server.call('GET', `/stocktakes/${id}`, limited)],
    [200, await server.call('POST', `/stocktakes/${id}/verify/${asset.id}`, limited, {})],
    [400, await server.call('POST', `/stocktakes/${id}/quick-verify`, limited, { itemNumber: 'ST1' })],
    [200, await server.call('POST', `/stocktakes/${id}/unverify/${asset.id}`, limited, {})],
    [200, await server.call('POST', `/stocktakes/${id}/quick-verify`, limited, { itemNumber: 'ST1' })]
  ] as const;
  for (const [status, response] of responses) {
    assert.equal(response.status, status, response.text);
    assert.ok(response.text.includes('ST1'), response.text);
    assert.ok(!response.text.includes(SECRET), response.text);
  }
});

test('deleting a student does not reveal their password', async () => {
  const student = (
    await server.call('POST', '/students', admin, { firstName: 'Ana', surname: 'Lee', password: 'STUDENT-SECRET' })
  ).json();

  const response = await server.call('DELETE', `/students/${student.id}`, limited);
  assert.equal(response.status, 200);
  assert.ok(!response.text.includes('STUDENT-SECRET'));
});

test('passwords cannot be used as a sort key', async () => {
  for (const url of [
    '/assets?sortBy=devicePassword',
    '/assets?sortBy[]=devicePassword',
    '/students?sortBy=password',
    '/students?sortBy[]=password',
    '/students/export?sortBy=password'
  ]) {
    assert.equal((await server.call('GET', url, limited)).status, 400, url);
  }
  for (const url of ['/assets', '/assets?sortBy=model', '/students?sortBy=surname']) {
    assert.equal((await server.call('GET', url, limited)).status, 200, url);
  }
});

test('asset search finds linked students by name', async () => {
  const student = (await server.call('POST', '/students', admin, { firstName: 'Piet', surname: 'Van Der Berg' })).json();
  await server.call('POST', '/assets', admin, { itemNumber: 'LINKED', studentId: student.id });

  const search = async (term: string) =>
    (await server.call('GET', `/assets?search=${encodeURIComponent(term)}`, limited)).json().data.map((a: any) => a.itemNumber);

  for (const term of ['Piet', 'Van Der', 'Piet Van Der Berg']) {
    assert.deepEqual(await search(term), ['LINKED'], term);
  }
  assert.deepEqual(await search('nobody'), []);
});
