import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, TestServer } from './helpers';

let server: TestServer;
let admin: string;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  for (const itemNumber of ['10', '2', 'AST-1', '1', '20', 'AST-3', 'NONUM']) {
    await server.call('POST', '/assets', admin, { itemNumber, model: itemNumber === '2' ? 'Findable' : 'Other' });
    await server.call('POST', '/software', admin, { itemNumber, name: `App ${itemNumber}` });
  }
});
after(() => server.stop());

const items = async (url: string) => {
  const body = (await server.call('GET', url, admin)).json();
  return { numbers: body.data.map((row: any) => row.itemNumber), pagination: body.pagination, first: body.data[0] };
};

for (const resource of ['assets', 'software']) {
  test(`${resource}: item numbers sort numerically`, async () => {
    const { numbers } = await items(`/${resource}?limit=50`);
    assert.deepEqual(numbers, ['NONUM', '1', 'AST-1', '2', 'AST-3', '10', '20']);
  });

  test(`${resource}: descending order`, async () => {
    const { numbers } = await items(`/${resource}?limit=50&sortOrder=desc`);
    assert.deepEqual(numbers, ['20', '10', 'AST-3', '2', 'AST-1', '1', 'NONUM']);
  });

  test(`${resource}: pages continue in numeric order`, async () => {
    const first = await items(`/${resource}?limit=3&page=1`);
    const second = await items(`/${resource}?limit=3&page=2`);
    const third = await items(`/${resource}?limit=3&page=3`);
    assert.deepEqual(first.numbers, ['NONUM', '1', 'AST-1']);
    assert.deepEqual(second.numbers, ['2', 'AST-3', '10']);
    assert.deepEqual(third.numbers, ['20']);
    assert.equal(first.pagination.total, 7);
    assert.equal(first.pagination.totalPages, 3);
  });

  test(`${resource}: a page past the end is empty`, async () => {
    assert.deepEqual((await items(`/${resource}?limit=3&page=9`)).numbers, []);
  });
}

test('search applies to numerically sorted results and related data is still loaded', async () => {
  const category = (await server.call('POST', '/lookups/categories', admin, { name: 'Laptops' })).json();
  await server.call('POST', '/assets', admin, { itemNumber: '30', model: 'Findable', categoryId: category.id });

  const { numbers, first, pagination } = await items('/assets?search=Findable&sortOrder=desc');
  assert.deepEqual(numbers, ['30', '2']);
  assert.equal(pagination.total, 2);
  assert.equal(first.category.name, 'Laptops');
});

test('other sort orders still work', async () => {
  const { numbers } = await items('/assets?sortBy=model&limit=1&sortOrder=desc');
  assert.equal(numbers.length, 1);
});

test('value report averages only count assets with a price', async () => {
  const lookup = async (path: string, name: string) => (await server.call('POST', path, admin, { name })).json();
  const category = await lookup('/lookups/categories', 'Priced');
  const manufacturer = await lookup('/lookups/manufacturers', 'Acme');
  const asset = (itemNumber: string, purchasePrice?: number) =>
    server.call('POST', '/assets', admin, { itemNumber, categoryId: category.id, manufacturerId: manufacturer.id, purchasePrice });

  await asset('P1', 100);
  await asset('P2', 300);
  await asset('P3');
  await asset('P4');

  const report = (await server.call('GET', `/reports/value?category=${category.id}`, admin)).json();
  assert.equal(report.summary.avgValue, 200);

  const byCategory = report.byCategory.find((row: any) => row.category === 'Priced');
  assert.equal(byCategory.avgValue, 200);
  assert.equal(byCategory.count, 4);
  assert.equal(report.byManufacturer.find((row: any) => row.manufacturer === 'Acme').avgValue, 200);
});

test('a category with no prices averages zero', async () => {
  const category = (await server.call('POST', '/lookups/categories', admin, { name: 'Unpriced' })).json();
  await server.call('POST', '/assets', admin, { itemNumber: 'N1', categoryId: category.id });

  const report = (await server.call('GET', `/reports/value?category=${category.id}`, admin)).json();
  assert.equal(report.byCategory[0].avgValue, 0);
});
