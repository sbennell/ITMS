import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLabelPDF } from '../src/services/labelService';
import { generateStudentLoginCards } from '../src/services/studentLoginCardService';

const LABEL = { itemNumber: '1008', model: 'Latitude', serialNumber: 'ABC123' };
const student = (firstName: string, surname: string) => ({
  firstName,
  surname,
  homeGroup: '7A',
  schoolYear: '7',
  username: 'user',
  email: 'user@example.com',
  password: 'pw'
});

// Noto Sans is embedded whole, because pdf-lib's subsetting produced text that could be
// extracted but did not render. File size shows which font a document used.
const USES_NOTO_BYTES = 100_000;

for (const [firstName, surname] of [['Thị', 'Nguyễn'], ['Đức', 'Trần'], ['Łukasz', 'Kowalski'], ['محمد', 'علي'], ['伟', '王']]) {
  test(`${firstName} ${surname} can be printed`, async () => {
    const label = await createLabelPDF({ ...LABEL, assignedTo: `${firstName} ${surname}` }, { showAssignedTo: true });
    assert.ok(label.length > USES_NOTO_BYTES);

    const cards = await generateStudentLoginCards([student(firstName, surname), student('Anna', 'Lee')]);
    assert.ok(cards.length > USES_NOTO_BYTES);
  });
}

test('text Helvetica can print does not embed the fallback font', async () => {
  const label = await createLabelPDF({ ...LABEL, assignedTo: 'José Muñoz' }, { showAssignedTo: true });
  assert.ok(label.length < USES_NOTO_BYTES);

  const cards = await generateStudentLoginCards([student('José', 'Muñoz')]);
  assert.ok(cards.length < USES_NOTO_BYTES);
});

test('a non Latin organization name can be printed', async () => {
  const label = await createLabelPDF({ ...LABEL, organizationName: 'Trường Học' });
  assert.ok(label.length > USES_NOTO_BYTES);
});
