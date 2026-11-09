import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { closeStudentImportWatcher, importIfChangedWhileStopped, startStudentImportWatcher } from '../src/services/studentImportWatcher';
import { waitFor } from './helpers';

test('service start does not import an existing file, but a later change does', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'itms-watcher-'));
  const file = path.join(dir, 'students.csv');
  writeFileSync(file, 'First,Last\nAnna,Lee\n');

  // The import reads the column mapping first, so that read shows an import has started
  let imports = 0;
  const prisma = {
    settings: {
      findUnique: async ({ where }: { where: { key: string } }) => {
        if (where.key === 'studentCsvMapping') imports++;
        return where.key === 'studentImportFile' ? { value: file } : null;
      }
    }
  } as unknown as PrismaClient;

  try {
    await startStudentImportWatcher(prisma);
    await new Promise((resolve) => setTimeout(resolve, 6000));
    assert.equal(imports, 0);

    appendFileSync(file, 'Bob,Ng\n');
    assert.equal(await waitFor(async () => imports === 1, 15000), true);
  } finally {
    await closeStudentImportWatcher();
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const [name, fileAgeMinutes, lastImportAgeMinutes, expected] of [
  ['a file changed while the service was stopped is imported at start', 5, 60, 1],
  ['a file unchanged since the last import is left alone at start', 60, 5, 0],
  ['a file that has never been imported is left alone at start', 5, null, 0]
] as const) {
  test(name, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'itms-watcher-'));
    const file = path.join(dir, 'students.csv');
    writeFileSync(file, 'First,Last\nAnna,Lee\n');
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60000);
    utimesSync(file, ago(fileAgeMinutes), ago(fileAgeMinutes));

    let imports = 0;
    const prisma = {
      settings: {
        findUnique: async ({ where }: { where: { key: string } }) => {
          if (where.key === 'studentCsvMapping') imports++;
          if (where.key === 'studentImportFile') return { value: file };
          if (where.key === 'studentLastImport' && lastImportAgeMinutes !== null) return { value: ago(lastImportAgeMinutes).toISOString() };
          return null;
        }
      }
    } as unknown as PrismaClient;

    try {
      await importIfChangedWhileStopped(prisma);
      assert.equal(imports, expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
