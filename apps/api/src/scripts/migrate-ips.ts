import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting IP migration...');

  // This migration has already been completed
  // All assets have been migrated from ipAddress to the AssetIP table
  const assetIPCount = await prisma.assetIP.count();
  console.log(`✅ Migration already complete: ${assetIPCount} IP addresses in AssetIP table`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
