import assert from 'node:assert/strict';
import { writeFileSync } from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import { Workbook } from 'exceljs';
import { parseCsvWithRows } from '../src/lib/csv';
import { PASSWORD, startServer, TestServer } from './helpers';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let server: TestServer;
let admin: string;
let limited: string;
let fileCount = 0;

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.createUser(admin, 'limited');
  limited = await server.login('limited');
  await server.call('PUT', '/lookups/settings/studentCsvMapping', admin, {
    value: JSON.stringify({ firstName: 'First', surname: 'Last', status: 'Status', birthdate: 'DOB' })
  });
});
after(() => server.stop());

const workbook = async (rows: unknown[][]) => {
  const book = new Workbook();
  const sheet = book.addWorksheet('Sheet');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
};

const useStudentFile = async (name: string, content: string | Buffer) => {
  const file = path.join(server.dir, `cleanup-${fileCount++}-${name}`);
  writeFileSync(file, content);
  await server.call('PUT', '/lookups/settings/studentImportFile', admin, { value: file });
};

const importStudents = async (csv: string) => {
  await useStudentFile('students.csv', csv);
  return (await server.call('POST', '/students/import/run', admin)).json();
};

// Row numbers and CSV structure

test('a newline in a quoted header does not shift row numbers', () => {
  assert.deepEqual(parseCsvWithRows('"a\nA",b\n1,2\n3,4\n').map((r) => r.rowNumber), [2, 3]);
});

test('a newline in a cell replaced by a duplicate header does not shift row numbers', () => {
  const rows = parseCsvWithRows('a,a,b\n"x\ny",1,2\n3,4,5\n');
  assert.deepEqual(rows.map((r) => r.rowNumber), [2, 3]);
  assert.equal(rows[0].record.a, '1');
});

test('a header only or empty file has no rows', () => {
  assert.deepEqual(parseCsvWithRows('a,b\n'), []);
  assert.deepEqual(parseCsvWithRows(''), []);
});

test('a row with the wrong number of columns is reported by its spreadsheet row', () => {
  assert.throws(() => parseCsvWithRows('a,b\n"x\ny",2\n1,2,3\n'), /Row 3 has 3 columns, expected 2/);
});

// Imports

test('Excel asset rows with no item number are reported', async () => {
  const file = await workbook([['Item Number', 'Hostname'], ['E1', 'one'], [null, 'orphan']]);
  const result = (await server.upload('/import/assets', admin, 'a.xlsx', file, XLSX)).json();
  assert.equal(result.created, 1);
  assert.deepEqual(result.errors, [{ row: 3, message: 'Item Number is required' }]);
});

test('Excel software rows with no item number are reported', async () => {
  const file = await workbook([['Item Number', 'Name'], ['ES1', 'One'], [null, 'Orphan']]);
  const result = (await server.upload('/software/import', admin, 's.xlsx', file, XLSX)).json();
  assert.equal(result.created, 1);
  assert.deepEqual(result.errors, [{ row: 3, message: 'Item Number is required' }]);
});

test('re-importing an export keeps an asset linked to its student', async () => {
  const student = (await server.call('POST', '/students', admin, { firstName: 'Linked', surname: 'Pupil' })).json();
  await server.call('POST', '/assets', admin, { itemNumber: 'L1', studentId: student.id });

  await server.upload('/import/assets?updateExisting=true', admin, 'a.csv', 'Item Number,Assigned To\nL1,Linked Pupil\n', 'text/csv');

  const asset = await server.prisma.asset.findUniqueOrThrow({ where: { itemNumber: 'L1' } });
  assert.equal(asset.studentId, student.id);
  assert.equal(asset.assignedTo, null);
  await server.prisma.asset.delete({ where: { id: asset.id } });
  await server.prisma.student.delete({ where: { id: student.id } });
});

test('a departed student is removed even if another student shares their name', async () => {
  await server.prisma.student.deleteMany();
  await server.prisma.student.create({ data: { firstName: 'John', surname: 'Smith', birthdate: new Date('2010-01-15') } });
  await server.prisma.student.create({ data: { firstName: 'John', surname: 'Smith', birthdate: new Date('2011-06-20') } });

  await importStudents('First,Last,Status,DOB\nJohn,Smith,Active,2010-01-15\n');

  const remaining = await server.prisma.student.findMany();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].birthdate?.toISOString().split('T')[0], '2010-01-15');
});

test('a row marked Left does not protect itself because of a same named student', async () => {
  await server.prisma.student.deleteMany();
  await server.prisma.student.create({ data: { firstName: 'Jane', surname: 'Doe', birthdate: new Date('2010-01-15') } });
  await server.prisma.student.create({ data: { firstName: 'Jane', surname: 'Doe', birthdate: new Date('2011-06-20') } });

  await importStudents('First,Last,Status,DOB\nJane,Doe,Left,2011-06-20\nJane,Doe,Active,2010-01-15\n');

  const remaining = await server.prisma.student.findMany();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].birthdate?.toISOString().split('T')[0], '2010-01-15');
});

test('a row with no birthdate keeps students of that name, since it cannot tell them apart', async () => {
  await server.prisma.student.deleteMany();
  await server.prisma.student.create({ data: { firstName: 'Sam', surname: 'Ali', birthdate: new Date('2010-01-15') } });

  await importStudents('First,Last,Status,DOB\nSam,Ali,Active,\n');

  const dated = await server.prisma.student.findFirst({ where: { firstName: 'Sam', birthdate: { not: null } } });
  assert.ok(dated);
});

test('an .xls import file gets a clear error', async () => {
  await useStudentFile('students.xls', 'not really excel');
  const result = (await server.call('POST', '/students/import/run', admin)).json();
  assert.match(result.errors[0].message, /Unsupported file format: \.xls/);
});

test('import headers are read from CSV and Excel files', async () => {
  await useStudentFile('headers.csv', '﻿"Last, First",DOB\nx,y\n');
  assert.deepEqual((await server.call('GET', '/students/import/headers', admin)).json(), ['Last, First', 'DOB']);

  await useStudentFile('headers.xlsx', await workbook([['First', 'Last'], ['a', 'b']]));
  assert.deepEqual((await server.call('GET', '/students/import/headers', admin)).json(), ['First', 'Last']);
});

// Permissions

test('student sync routes are admin only', async () => {
  for (const [method, url] of [['POST', '/students/import/run'], ['POST', '/students/reconcile-assets'], ['GET', '/students/import/headers']]) {
    assert.equal((await server.call(method, url, limited)).status, 403, url);
  }
});

test('non admins can only read the settings the app needs', async () => {
  for (const key of ['organization', 'schoolType']) {
    assert.equal((await server.call('GET', `/lookups/settings/${key}`, limited)).status, 200, key);
  }
  assert.equal((await server.call('GET', '/lookups/settings/studentImportFile', limited)).status, 403);
  assert.equal((await server.call('GET', '/lookups/settings/studentImportFile', admin)).status, 200);
});

test('new users have no permissions unless they are granted', async () => {
  const response = await server.call('POST', '/auth/users', admin, { username: 'noflags', password: PASSWORD, fullName: 'No Flags' });
  const user = response.json();
  for (const flag of ['canAccessAssets', 'canAccessStudents', 'canAccessStocktake', 'canAccessReports', 'canViewDevicePasswords', 'canViewStudentPasswords']) {
    assert.equal(user[flag], false, flag);
  }
});

test('login issues a new session id', async () => {
  const first = await server.login('limited');
  const response = await server.call('POST', '/auth/login', first, { username: 'limited', password: PASSWORD });
  assert.notEqual(response.headers.get('set-cookie')!.split(';')[0], first);
});

test('a disabled account is only disclosed to someone with its password', async () => {
  const user = await server.createUser(admin, 'inactive');
  await server.call('PUT', `/auth/users/${user.id}`, admin, { isActive: false });

  const wrong = await server.call('POST', '/auth/login', undefined, { username: 'inactive', password: 'wrong-password' });
  assert.equal(wrong.json().error, 'Invalid username or password');
  const right = await server.call('POST', '/auth/login', undefined, { username: 'inactive', password: PASSWORD });
  assert.equal(right.json().error, 'Account is disabled');
});

// Input checks

test('attachments can only be reached through their own software item', async () => {
  const create = async (itemNumber: string) => (await server.call('POST', '/software', admin, { itemNumber, name: itemNumber })).json();
  const owner = await create('OWN1');
  const other = await create('OWN2');
  const attachment = (await server.upload(`/software/${owner.id}/attachments`, admin, 'l.pdf', 'body', 'application/pdf')).json();

  assert.equal((await server.call('GET', `/software/${other.id}/attachments/${attachment.id}`, admin)).status, 404);
  assert.equal((await server.call('DELETE', `/software/${other.id}/attachments/${attachment.id}`, admin)).status, 404);
  assert.equal((await server.call('GET', `/software/${owner.id}/attachments/${attachment.id}`, admin)).text, 'body');
});

test('invalid paging values fall back and large page sizes are capped', async () => {
  for (const url of ['/assets', '/software', '/students']) {
    assert.equal((await server.call('GET', `${url}?page=abc&limit=xyz`, admin)).json().pagination.limit, 50, url);
    assert.equal((await server.call('GET', `${url}?page=-1&limit=0`, admin)).status, 200, url);
    assert.equal((await server.call('GET', `${url}?limit=100000`, admin)).json().pagination.limit, 500, url);
  }
  for (const report of ['warranty', 'condition', 'value', 'lifecycle', 'stocktake-review']) {
    const response = await server.call('GET', `/reports/${report}?skip=abc&limit=100000`, admin);
    assert.equal(response.status, 200, report);
    assert.equal(response.json().pagination.limit, 500, report);
  }
});

test('invalid print quantities are rejected', async () => {
  for (const copies of [0, -1, 51, 1.5, 'many']) {
    assert.equal((await server.call('POST', '/labels/print/any', admin, { copies })).status, 400, String(copies));
    assert.equal((await server.call('POST', '/labels/print-batch', admin, { assetIds: ['any'], copies })).status, 400, String(copies));
  }
});

test('a /31 subnet lists its two addresses', async () => {
  const subnet = (await server.call('POST', '/network/subnets', admin, { name: 'link', cidr: '10.1.1.0/31' })).json();
  const response = (await server.call('GET', `/network/subnets/${subnet.id}/ips`, admin)).json();
  assert.deepEqual(response.ips.map((entry: any) => entry.ip), ['10.1.1.0', '10.1.1.1']);
});
