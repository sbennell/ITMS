import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'fs';
import path from 'path';
import { after, before, beforeEach, test } from 'node:test';
import { startServer, TestServer, waitFor } from './helpers';

const CSV = 'text/csv';

let server: TestServer;
let admin: string;
let fileCount = 0;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.call('PUT', '/lookups/settings/studentCsvMapping', admin, {
    value: JSON.stringify({ firstName: 'First', surname: 'Last', homeGroup: 'Group', status: 'Status' })
  });
});
after(() => server.stop());

beforeEach(async () => {
  await server.prisma.student.deleteMany();
  await server.prisma.student.create({ data: { firstName: 'Anna', surname: 'Lee', homeGroup: '7A' } });
  await server.prisma.student.create({ data: { firstName: 'Bob', surname: 'Ng', homeGroup: '8B' } });
});

// A new file each time, so the import watcher never sees a change to one it is watching
async function configureStudentFile(csv: string) {
  const file = path.join(server.dir, `students-${fileCount++}.csv`);
  writeFileSync(file, csv);
  await server.call('PUT', '/lookups/settings/studentImportFile', admin, { value: file });
  return file;
}

async function runStudentImport(csv: string) {
  await configureStudentFile(csv);
  return (await server.call('POST', '/students/import/run', admin)).json();
}

const students = () => server.prisma.student.findMany({ orderBy: { firstName: 'asc' } });

test('a header only file changes nothing', async () => {
  const result = await runStudentImport('First,Last,Group,Status\n');
  assert.equal((await students()).length, 2);
  assert.match(result.errors[0].message, /existing students were not changed/);
});

test('renamed name columns neither delete nor overwrite students', async () => {
  await runStudentImport('Given,Family,Group,Status\nZed,Zee,9Z,Active\n');
  const remaining = await students();
  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].homeGroup, '7A');
});

test('a file with only departed students changes nothing', async () => {
  await runStudentImport('First,Last,Group,Status\nAnna,Lee,7A,Left\n');
  assert.equal((await students()).length, 2);
});

test('a row missing a name reports its row and valid rows still apply', async () => {
  const result = await runStudentImport('First,Last,Group,Status\n,,9Z,Active\nAnna,Lee,9Y,Active\nBob,Ng,8B,Active\n');
  assert.equal(result.errors[0].row, 2);
  assert.match(result.errors[0].message, /required/);
  assert.equal((await students())[0].homeGroup, '9Y');
});

test('a normal sync updates students and removes those no longer in the file', async () => {
  await runStudentImport('First,Last,Group,Status\nAnna,Lee,9Z,Active\n');
  const remaining = await students();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].homeGroup, '9Z');
});

test('a new import path takes effect without a restart, but does not import until the file changes', async () => {
  const lastImport = () => server.prisma.settings.findUnique({ where: { key: 'studentLastImport' } }).then((s) => s?.value);
  const before = await lastImport();

  const file = await configureStudentFile('First,Last\nAnna,Lee\nBob,Ng\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  assert.equal(await lastImport(), before);
  assert.equal((await students()).length, 2);

  appendFileSync(file, 'Zed,Zee\n');
  assert.equal(await waitFor(async () => (await students()).length === 3, 15000), true);
});

test('updating assets leaves columns missing from the file alone', async () => {
  await server.call('POST', '/assets', admin, { itemNumber: 'U1', serialNumber: 'KEEP-ME', model: 'Old' });

  const response = await server.upload('/import/assets?updateExisting=true', admin, 'a.csv', 'Item Number,Model\nU1,New\n', CSV);
  assert.equal(response.json().updated, 1, response.text);

  const asset = await server.prisma.asset.findUnique({ where: { itemNumber: 'U1' } });
  assert.equal(asset?.model, 'New');
  assert.equal(asset?.serialNumber, 'KEEP-ME');
});

test('a blank cell in a column that is in the file still clears the field', async () => {
  await server.call('POST', '/assets', admin, { itemNumber: 'U2', serialNumber: 'CLEAR-ME' });

  await server.upload('/import/assets?updateExisting=true', admin, 'a.csv', 'Item Number,Serial Number\nU2,\n', CSV);
  assert.equal((await server.prisma.asset.findUnique({ where: { itemNumber: 'U2' } }))?.serialNumber, null);
});

test('a software export saved by Excel as CSV UTF-8 can be imported', async () => {
  const response = await server.upload('/software/import', admin, 's.csv', '﻿Item Number,Name,Criticality\r\nSW1,Editor,High\r\n', CSV);
  assert.equal(response.json().created, 1, response.text);

  const software = await server.prisma.software.findUnique({ where: { itemNumber: 'SW1' } });
  assert.equal(software?.name, 'Editor');
  assert.equal(software?.criticalityTier, 'HIGH');
});

test('import errors report the real spreadsheet row', async () => {
  const csv = 'Item Number,Name,Status\nSW2,Good,\n\n"SW3","Multi\nline",Nope\n';
  const response = await server.upload('/software/import', admin, 's.csv', csv, CSV);
  assert.equal(response.json().errors[0].row, 4, response.text);
});

test('imports accept every condition the app uses', async () => {
  const conditions = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'NON_FUNCTIONAL'];
  const rows = conditions.map((condition, i) => `C${i},${condition.toLowerCase()}`).join('\n');

  const response = await server.upload('/import/assets', admin, 'a.csv', `Item Number,Condition\n${rows}\n`, CSV);
  assert.equal(response.json().created, conditions.length, response.text);
  assert.deepEqual(response.json().errors, []);

  const saved = await server.prisma.asset.findMany({ where: { itemNumber: { startsWith: 'C' } }, orderBy: { itemNumber: 'asc' } });
  assert.deepEqual(saved.map((asset) => asset.condition), conditions);
});

test('imports reject a condition the app does not use', async () => {
  const response = await server.upload('/import/assets', admin, 'a.csv', 'Item Number,Condition\nD1,DAMAGED\n', CSV);
  assert.equal(response.json().created, 0, response.text);
  assert.match(response.json().errors[0].message, /Invalid condition/);
});
