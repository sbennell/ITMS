import { PrismaClient } from '@prisma/client';

// MACS replaced the data classification levels in Prioritised Security Actions Set #8.
// Old values are moved once: the new Restricted level is much narrower than the old one,
// so a Restricted value set after this runs must not be moved again.
const MIGRATED_KEY = 'dataClassificationLevels2026';
const MOVES: Array<[from: string, to: string]> = [
  ['INTERNAL', 'CONFIDENTIAL'],
  ['SENSITIVE', 'HIGHLY_CONFIDENTIAL'],
  ['RESTRICTED', 'HIGHLY_CONFIDENTIAL']
];

export async function migrateDataClassifications(prisma: PrismaClient) {
  if (await prisma.settings.findUnique({ where: { key: MIGRATED_KEY } })) return;

  await prisma.$transaction([
    ...MOVES.flatMap(([from, to]) => [
      prisma.asset.updateMany({ where: { dataClassification: from }, data: { dataClassification: to } }),
      prisma.software.updateMany({ where: { dataClassification: from }, data: { dataClassification: to } })
    ]),
    prisma.settings.create({ data: { key: MIGRATED_KEY, value: new Date().toISOString() } })
  ]);
}
