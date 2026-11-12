import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { after, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { migrateDataClassifications } from '../src/services/dataClassificationMigration';

const dir = mkdtempSync(path.join(tmpdir(), 'itms-classification-'));
const url = `file:${path.join(dir, 'test.db')}`;
execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'ignore'
});
const prisma = new PrismaClient({ datasources: { db: { url } } });

after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const classifications = async () => {
  const assets = await prisma.asset.findMany({ orderBy: { itemNumber: 'asc' } });
  const software = await prisma.software.findMany({ orderBy: { itemNumber: 'asc' } });
  return [...assets, ...software].map((item) => item.dataClassification);
};

test('old data classifications move to the MACS levels once', async () => {
  const old = ['PUBLIC', 'INTERNAL', 'SENSITIVE', 'RESTRICTED', null];
  for (const [i, dataClassification] of old.entries()) {
    await prisma.asset.create({ data: { itemNumber: `A${i}`, dataClassification } });
    await prisma.software.create({ data: { itemNumber: `S${i}`, name: `App ${i}`, dataClassification } });
  }

  await migrateDataClassifications(prisma);
  const moved = ['PUBLIC', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', null];
  assert.deepEqual(await classifications(), [...moved, ...moved]);

  // A Restricted value chosen after the move must survive later restarts
  await prisma.software.update({ where: { itemNumber: 'S0' }, data: { dataClassification: 'RESTRICTED' } });
  await migrateDataClassifications(prisma);
  assert.equal((await prisma.software.findUnique({ where: { itemNumber: 'S0' } }))?.dataClassification, 'RESTRICTED');
});
