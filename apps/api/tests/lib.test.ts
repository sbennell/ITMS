import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onlyImportedColumns, parseCsvWithRows } from '../src/lib/csv';
import { maskAuditPasswords } from '../src/lib/redact';

const ROW_CASES: [string, string, number[], { trim?: boolean }?][] = [
  ['no blank lines', 'a,b\n1,2\n3,4\n', [2, 3]],
  ['blank lines', 'a,b\n1,2\n\n3,4\n\n\n5,6\n', [2, 4, 7]],
  ['CRLF with a blank line', 'a,b\r\n1,2\r\n\r\n3,4\r\n', [2, 4]],
  ['LF file, LF in a cell', 'a,b\n"x\ny",2\n3,4\n', [2, 3]],
  ['CRLF file, LF in a cell', 'a,b\r\n"x\ny",2\r\n3,4\r\n', [2, 3]],
  ['CRLF file, CRLF in a cell', 'a,b\r\n"x\r\ny",2\r\n3,4\r\n', [2, 3]],
  ['LF file, CRLF in a cell', 'a,b\n"x\r\ny",2\n3,4\n', [2, 3]],
  ['multi line cell then a blank line', 'a,b\r\n"x\ny",2\r\n\r\n3,4\r\n', [2, 4]],
  ['two newlines in a cell', 'a,b\r\n"x\n\ny",2\r\n3,4\r\n', [2, 3]],
  ['blank lines before the header', '\n\na,b\n1,2\n', [4]],
  ['byte order mark', '﻿a,b\n1,2\n\n3,4\n', [2, 4]],
  ['no trailing newline', 'a,b\n1,2\n\n3,4', [2, 4]],
  ['newlines at the edge of a cell', 'a,b\n"\nx\n",2\n3,4\n', [2, 3]],
  ['newlines at the edge of a cell with trim', 'a,b\n"\nx\n",2\n3,4\n', [2, 3], { trim: true }],
  ['whitespace only line with trim', 'a,b\n1,2\n   \n3,4\n', [2, 4], { trim: true }],
  ['multi line cell with trim', 'a,b\n"x\ny",2\n\n3,4\n', [2, 4], { trim: true }]
];

for (const [name, csv, expected, options] of ROW_CASES) {
  test(`row numbers: ${name}`, () => {
    assert.deepEqual(parseCsvWithRows(csv, options).map((row) => row.rowNumber), expected);
  });
}

test('a byte order mark does not reach the first header', () => {
  assert.deepEqual(Object.keys(parseCsvWithRows('﻿Name,Ver\nx,1\n')[0].record), ['Name', 'Ver']);
});

test('onlyImportedColumns keeps fields whose column is in the row', () => {
  const data = { model: null, serialNumber: null, locationId: null };
  assert.deepEqual(onlyImportedColumns(data, { model: 'x' }), { model: null });
  assert.deepEqual(onlyImportedColumns(data, { location: 'Lab' }, { locationId: 'location' }), { locationId: null });
  assert.deepEqual(onlyImportedColumns(data, {}), {});
});

test('maskAuditPasswords masks top level passwords and leaves other fields', () => {
  assert.deepEqual(maskAuditPasswords({ itemNumber: 'A1', devicePassword: 'secret' }), {
    itemNumber: 'A1',
    devicePassword: '••••••••••'
  });
});

test('maskAuditPasswords keeps a change visible and is safe to repeat', () => {
  const once = maskAuditPasswords({ before: { devicePassword: 'a' }, after: { devicePassword: 'b' } });
  assert.notEqual(once.before.devicePassword, once.after.devicePassword);
  assert.ok(!JSON.stringify(once).match(/"[ab]"/));
  assert.deepEqual(maskAuditPasswords(once), once);
});

test('maskAuditPasswords makes an unchanged password match', () => {
  const masked = maskAuditPasswords({ before: { devicePassword: 'a' }, after: { devicePassword: 'a' } });
  assert.equal(masked.before.devicePassword, masked.after.devicePassword);
});

test('maskAuditPasswords leaves empty passwords alone', () => {
  assert.deepEqual(maskAuditPasswords({ before: { devicePassword: null }, after: { status: 'x' } }), {
    before: { devicePassword: null },
    after: { status: 'x' }
  });
});
