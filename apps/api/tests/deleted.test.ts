import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, TestServer } from './helpers';

let server: TestServer;
let admin: string;
let limited: string;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.createUser(admin, 'limited');
  limited = await server.login('limited');
});
after(() => server.stop());

const deletedItems = async () => (await server.call('GET', '/import/deleted-items', admin)).json();

test('a deleted asset is listed with its full history', async () => {
  const asset = (await server.call('POST', '/assets', admin, { itemNumber: 'DEL1', model: 'Latitude', devicePassword: 'SECRET-VALUE' })).json();
  await server.call('PUT', `/assets/${asset.id}`, admin, { itemNumber: 'DEL1', model: 'Latitude 2', status: 'In Use', condition: 'GOOD', devicePassword: 'SECRET-OTHER' });
  await server.call('DELETE', `/assets/${asset.id}`, admin);

  const response = await server.call('GET', '/import/deleted-items', admin);
  assert.ok(!response.text.includes('SECRET'), response.text);

  const item = response.json().find((entry: any) => entry.itemNumber === 'DEL1');
  assert.equal(item.type, 'Asset');
  assert.equal(item.description, 'Latitude 2');
  assert.equal(item.deletedBy, 'admin');
  assert.deepEqual(item.history.map((entry: any) => entry.action).sort(), ['CREATE', 'DELETE', 'UPDATE']);
  assert.equal(item.history.find((entry: any) => entry.action === 'UPDATE').changes.after.model, 'Latitude 2');
});

test('a deleted software item is listed with its full history', async () => {
  const software = (await server.call('POST', '/software', admin, { itemNumber: 'DELS1', name: 'Editor' })).json();
  await server.call('PUT', `/software/${software.id}`, admin, { itemNumber: 'DELS1', name: 'Editor Pro' });
  await server.call('DELETE', `/software/${software.id}`, admin);

  const item = (await deletedItems()).find((entry: any) => entry.itemNumber === 'DELS1');
  assert.equal(item.type, 'Software');
  assert.equal(item.description, 'Editor Pro');
  assert.deepEqual(item.history.map((entry: any) => entry.action).sort(), ['CREATE', 'DELETE', 'UPDATE']);
});

test('reusing an item number keeps each deleted item separate', async () => {
  for (const model of ['First', 'Second']) {
    const asset = (await server.call('POST', '/assets', admin, { itemNumber: 'REUSED', model })).json();
    await server.call('DELETE', `/assets/${asset.id}`, admin);
  }

  const items = (await deletedItems()).filter((entry: any) => entry.itemNumber === 'REUSED');
  assert.deepEqual(items.map((entry: any) => entry.description).sort(), ['First', 'Second']);
  for (const item of items) assert.equal(item.history.length, 2);
});

test('items that still exist are not listed', async () => {
  await server.call('POST', '/assets', admin, { itemNumber: 'KEPT1' });
  assert.equal((await deletedItems()).some((entry: any) => entry.itemNumber === 'KEPT1'), false);
});

test('the list is admin only', async () => {
  assert.equal((await server.call('GET', '/import/deleted-items', limited)).status, 403);
});
