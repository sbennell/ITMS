import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PASSWORD, startServer, TestServer } from './helpers';

let server: TestServer;
let admin: string;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
});
after(() => server.stop());

const authenticated = async (cookie: string) => (await server.call('GET', '/auth/status', cookie)).json().authenticated;

test('disabling a user ends their session', async () => {
  const user = await server.createUser(admin, 'disabled');
  const cookie = await server.login('disabled');
  assert.equal(await authenticated(cookie), true);

  await server.call('PUT', `/auth/users/${user.id}`, admin, { isActive: false });
  assert.equal(await authenticated(cookie), false);
  assert.equal((await server.call('GET', '/assets', cookie)).status, 401);
});

test('deleting a user ends their session', async () => {
  const user = await server.createUser(admin, 'deleted');
  const cookie = await server.login('deleted');

  await server.call('DELETE', `/auth/users/${user.id}`, admin);
  assert.equal(await authenticated(cookie), false);
});

test('demoting an admin takes effect immediately', async () => {
  const user = await server.createUser(admin, 'demoted', { role: 'ADMIN' });
  const cookie = await server.login('demoted');
  assert.equal((await server.call('GET', '/auth/users', cookie)).status, 200);

  await server.call('PUT', `/auth/users/${user.id}`, admin, { role: 'USER' });
  assert.equal((await server.call('GET', '/auth/users', cookie)).status, 403);
});

test('revoking a permission takes effect immediately', async () => {
  const user = await server.createUser(admin, 'revoked');
  const cookie = await server.login('revoked');
  assert.equal((await server.call('GET', '/stocktakes', cookie)).status, 200);

  await server.call('PUT', `/auth/users/${user.id}`, admin, { canAccessStocktake: false });
  assert.equal((await server.call('GET', '/stocktakes', cookie)).status, 403);
});

test('an admin password reset ends the session', async () => {
  const user = await server.createUser(admin, 'reset');
  const cookie = await server.login('reset');

  await server.call('POST', `/auth/users/${user.id}/reset-password`, admin, { newPassword: 'different1' });
  assert.equal(await authenticated(cookie), false);
});

test('changing your own password keeps this session and ends the others', async () => {
  await server.createUser(admin, 'changer');
  const current = await server.login('changer');
  const other = await server.login('changer');

  const response = await server.call('POST', '/auth/change-password', current, {
    currentPassword: PASSWORD,
    newPassword: 'different1'
  });
  assert.equal(response.status, 200);
  assert.equal(await authenticated(current), true);
  assert.equal(await authenticated(other), false);
});

test('the last active admin cannot be demoted or disabled', async () => {
  const { id } = (await server.call('GET', '/auth/status', admin)).json().user;

  for (const change of [{ role: 'USER' }, { isActive: false }]) {
    const response = await server.call('PUT', `/auth/users/${id}`, admin, change);
    assert.equal(response.status, 400, JSON.stringify(change));
    assert.match(response.json().error, /active administrator/);
  }
  assert.equal((await server.call('GET', '/auth/users', admin)).status, 200);
});

test('an admin can be demoted while another active admin remains', async () => {
  const other = await server.createUser(admin, 'second-admin', { role: 'ADMIN' });

  assert.equal((await server.call('PUT', `/auth/users/${other.id}`, admin, { role: 'USER' })).status, 200);
});
