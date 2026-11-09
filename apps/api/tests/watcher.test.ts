import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { closeStudentImportWatcher, startStudentImportWatcher } from '../src/services/studentImportWatcher';
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
