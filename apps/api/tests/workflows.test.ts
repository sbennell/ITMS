import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, TestServer } from './helpers';

let server: TestServer;
let admin: string;
let itemCount = 0;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
});
after(() => server.stop());

const createAsset = async (extra: object = {}) => {
  const itemNumber = `W${++itemCount}`;
  return (await server.call('POST', '/assets', admin, { itemNumber, ...extra })).json();
};
const createStocktake = async (name: string) => (await server.call('POST', '/stocktakes', admin, { name })).json();
const complete = (id: string) => server.call('PUT', `/stocktakes/${id}`, admin, { status: 'COMPLETED' });
const assetRow = (id: string) => server.prisma.asset.findUniqueOrThrow({ where: { id } });

test('bulk update history shows the previous and new category', async () => {
  const lookup = async (name: string) => (await server.call('POST', '/lookups/categories', admin, { name })).json();
  const laptops = await lookup('Laptops');
  const desktops = await lookup('Desktops');
  const asset = await createAsset({ categoryId: laptops.id });

  await server.call('PUT', '/assets/bulk-update', admin, { ids: [asset.id], fields: { categoryId: desktops.id } });

  const logs = (await server.call('GET', `/assets/${asset.id}/history`, admin)).json();
  const changes = JSON.parse(logs.find((log: any) => log.action === 'BULK_UPDATE').changes);
  assert.equal(changes.before.categoryId, 'Laptops');
  assert.equal(changes.after.categoryId, 'Desktops');
});

test('completing a stocktake applies review dates and condition changes', async () => {
  const asset = await createAsset({ condition: 'GOOD' });
  const stocktake = await createStocktake('Applies');
  await server.call('POST', `/stocktakes/${stocktake.id}/verify/${asset.id}`, admin, { newCondition: 'POOR' });

  assert.equal((await complete(stocktake.id)).status, 200);

  const row = await assetRow(asset.id);
  assert.equal(row.condition, 'POOR');
  assert.ok(row.lastReviewDate);
});

test('a stocktake cannot be completed twice', async () => {
  const asset = await createAsset();
  const stocktake = await createStocktake('Twice');
  await server.call('POST', `/stocktakes/${stocktake.id}/verify/${asset.id}`, admin, {});
  await complete(stocktake.id);
  const stamped = (await assetRow(asset.id)).lastReviewDate;

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await complete(stocktake.id)).status, 400);
  assert.deepEqual((await assetRow(asset.id)).lastReviewDate, stamped);
});

test('assets cannot be verified or unverified once a stocktake has finished', async () => {
  const verified = await createAsset();
  const unverified = await createAsset();
  const stocktake = await createStocktake('Closed');
  await server.call('POST', `/stocktakes/${stocktake.id}/verify/${verified.id}`, admin, {});
  await complete(stocktake.id);

  const responses = [
    await server.call('POST', `/stocktakes/${stocktake.id}/verify/${unverified.id}`, admin, {}),
    await server.call('POST', `/stocktakes/${stocktake.id}/unverify/${verified.id}`, admin, {}),
    await server.call('POST', `/stocktakes/${stocktake.id}/quick-verify`, admin, { itemNumber: unverified.itemNumber })
  ];
  for (const response of responses) {
    assert.equal(response.status, 400, response.text);
    assert.match(response.json().error, /not in progress/);
  }

  const records = await server.prisma.stocktakeRecord.findMany({ where: { stocktakeId: stocktake.id } });
  assert.equal(records.find((r) => r.assetId === verified.id)?.verified, true);
  assert.equal(records.find((r) => r.assetId === unverified.id)?.verified, false);
});

test('an invalid condition is rejected and nothing is verified', async () => {
  const asset = await createAsset();
  const stocktake = await createStocktake('Conditions');

  const responses = [
    await server.call('POST', `/stocktakes/${stocktake.id}/verify/${asset.id}`, admin, { newCondition: 'BROKEN' }),
    await server.call('POST', `/stocktakes/${stocktake.id}/quick-verify`, admin, { itemNumber: asset.itemNumber, newCondition: 'BROKEN' })
  ];
  for (const response of responses) {
    assert.equal(response.status, 400, response.text);
    assert.match(response.json().error, /Invalid condition/);
  }

  const record = await server.prisma.stocktakeRecord.findFirstOrThrow({ where: { stocktakeId: stocktake.id, assetId: asset.id } });
  assert.equal(record.verified, false);
});

test('every valid condition is accepted', async () => {
  for (const newCondition of ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'NON_FUNCTIONAL']) {
    const asset = await createAsset();
    const stocktake = await createStocktake(`Valid ${newCondition}`);
    const response = await server.call('POST', `/stocktakes/${stocktake.id}/verify/${asset.id}`, admin, { newCondition });
    assert.equal(response.status, 200, response.text);
  }
});

test('stocktake status changes are validated', async () => {
  await createAsset();
  const stocktake = await createStocktake('Status');

  assert.equal((await server.call('PUT', `/stocktakes/${stocktake.id}`, admin, { status: 'NONSENSE' })).status, 400);
  assert.equal((await server.call('PUT', '/stocktakes/missing', admin, { status: 'COMPLETED' })).status, 404);
  assert.equal((await server.call('PUT', `/stocktakes/${stocktake.id}`, admin, { status: 'CANCELLED' })).status, 200);
  assert.equal((await server.call('PUT', `/stocktakes/${stocktake.id}`, admin, { status: 'IN_PROGRESS' })).status, 400);
});

test('a finished stocktake can still be renamed', async () => {
  await createAsset();
  const stocktake = await createStocktake('Rename');
  await complete(stocktake.id);

  const response = await server.call('PUT', `/stocktakes/${stocktake.id}`, admin, { name: 'Renamed', notes: 'Done' });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.json().name, 'Renamed');
});
