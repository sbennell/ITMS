import assert from 'node:assert/strict';
import { writeFileSync } from 'fs';
import path from 'path';
import { after, before, beforeEach, test } from 'node:test';
import { startServer, TestServer, waitFor } from './helpers';

let server: TestServer;
let admin: string;
let fileCount = 0;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.call('PUT', '/lookups/settings/studentCsvMapping', admin, {
    value: JSON.stringify({ firstName: 'First', surname: 'Last', birthdate: 'DOB' })
  });
});
after(() => server.stop());

beforeEach(async () => {
  await server.prisma.asset.deleteMany();
  await server.prisma.student.deleteMany();
});

const useFile = async (csv: string) => {
  const file = path.join(server.dir, `limits-${fileCount++}.csv`);
  writeFileSync(file, csv);
  await server.call('PUT', '/lookups/settings/studentImportFile', admin, { value: file });
  return file;
};
const runImport = async (csv: string) => {
  await useFile(csv);
  return (await server.call('POST', '/students/import/run', admin)).json();
};
const addStudents = (count: number) =>
  server.prisma.student.createMany({ data: Array.from({ length: count }, (_, i) => ({ firstName: `S${i}`, surname: 'Test' })) });
const roster = (count: number) =>
  `First,Last,DOB\n${Array.from({ length: count }, (_, i) => `S${i},Test,`).join('\n')}\n`;
const lastImport = () => server.prisma.settings.findUnique({ where: { key: 'studentLastImport' } }).then((s) => s?.value);
const countStudents = () => server.prisma.student.count();

async function changeFileAndWaitForImport(file: string, csv: string) {
  const before = await lastImport();
  writeFileSync(file, csv);
  assert.equal(await waitFor(async () => (await lastImport()) !== before, 20000), true, 'import did not run');
}

test('an automatic sync will not remove a large share of students', async () => {
  await addStudents(20);
  const file = await useFile(roster(20));

  await changeFileAndWaitForImport(file, roster(5));
  assert.equal(await countStudents(), 20);
});

test('running the import manually applies a large removal', async () => {
  await addStudents(20);
  await runImport(roster(5));
  assert.equal(await countStudents(), 5);
});

test('an automatic sync still removes a normal number of students', async () => {
  await addStudents(20);
  const file = await useFile(roster(20));

  await changeFileAndWaitForImport(file, roster(18));
  assert.equal(await countStudents(), 18);
});

test('a row with the wrong column count is reported and other rows still import', async () => {
  await addStudents(1);
  const result = await runImport('First,Last,DOB\nS0,Test,\nBad,Row\nNew,Student,\n');

  assert.deepEqual(result.errors.find((error: any) => error.row === 3)?.message, 'Row has 2 columns, expected 3');
  assert.ok(await server.prisma.student.findFirst({ where: { firstName: 'New' } }));
});

test('removals are skipped when a row could not be read', async () => {
  await addStudents(3);
  const result = await runImport('First,Last,DOB\nS0,Test,\nBad,Row\n');

  assert.equal(await countStudents(), 3);
  assert.ok(result.errors.some((error: any) => error.row === 0 && /could not be read/.test(error.message)));
});

test('asset and software imports report bad rows and keep going', async () => {
  const csv = 'Item Number,Name\nBAD1,One\nBAD2\nBAD3,Three\n';
  for (const [url, created] of [['/software/import', 2], ['/import/assets', 2]] as const) {
    const result = (await server.upload(url, admin, 'a.csv', csv, 'text/csv')).json();
    assert.equal(result.created, created, url);
    assert.deepEqual(result.errors, [{ row: 3, message: 'Row has 1 columns, expected 2' }], url);
  }
});

test('a row with no birthdate updates the one student with that name', async () => {
  await server.prisma.student.create({ data: { firstName: 'Mia', surname: 'Ross', birthdate: new Date('2010-01-15') } });
  await runImport('First,Last,DOB\nMia,Ross,\n');

  const all = await server.prisma.student.findMany();
  assert.equal(all.length, 1);
  assert.equal(all[0].birthdate?.toISOString().split('T')[0], '2010-01-15');
});

test('a row with no birthdate does not guess between same named students', async () => {
  const birthdates = ['2010-01-15', '2011-06-20'];
  for (const date of birthdates) {
    await server.prisma.student.create({ data: { firstName: 'Lee', surname: 'Wong', birthdate: new Date(date) } });
  }
  await runImport('First,Last,DOB\nLee,Wong,\n');
  assert.equal(await server.prisma.student.count({ where: { firstName: 'Lee', birthdate: { not: null } } }), 2);
});

test('an existing duplicate without a birthdate is merged and keeps its assets', async () => {
  const dated = await server.prisma.student.create({ data: { firstName: 'Ana', surname: 'Diaz', birthdate: new Date('2010-01-15') } });
  const undated = await server.prisma.student.create({ data: { firstName: 'Ana', surname: 'Diaz' } });
  const asset = await server.prisma.asset.create({ data: { itemNumber: 'DUP1', studentId: undated.id } });

  await runImport('First,Last,DOB\nAna,Diaz,2010-01-15\n');

  const all = await server.prisma.student.findMany();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, dated.id);
  assert.equal((await server.prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).studentId, dated.id);
});

test('deleting an asset keeps its history and records who deleted it', async () => {
  const asset = (await server.call('POST', '/assets', admin, { itemNumber: 'GONE1', model: 'Old', devicePassword: 'SECRET-VALUE' })).json();
  await server.call('DELETE', `/assets/${asset.id}`, admin);

  const logs = await server.prisma.auditLog.findMany({ where: { changes: { contains: 'GONE1' } }, include: { user: true } });
  assert.deepEqual(logs.map((log) => log.action).sort(), ['CREATE', 'DELETE']);
  const deletion = logs.find((log) => log.action === 'DELETE')!;
  assert.equal(deletion.user?.username, 'admin');
  assert.ok(!logs.some((log) => log.changes?.includes('SECRET-VALUE')));
});

test('a device password can be removed', async () => {
  const asset = (await server.call('POST', '/assets', admin, { itemNumber: 'PW1', devicePassword: 'value' })).json();
  const updated = await server.call('PUT', `/assets/${asset.id}`, admin, { itemNumber: 'PW1', status: 'In Use', condition: 'GOOD', devicePassword: null });
  assert.equal(updated.json().hasDevicePassword, false);
});
