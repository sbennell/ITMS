// One-off: removes plain text device passwords from existing audit log entries.
// This rewrites audit history and cannot be undone, so stop the ITMS service and
// back up the database first. Run from apps/api after building:
//   node dist/scripts/scrub-audit-passwords.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { maskAuditPasswords } from '../lib/redact.js';

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { changes: { contains: 'devicePassword' } },
    select: { id: true, changes: true }
  });

  let scrubbed = 0;
  for (const log of logs) {
    const masked = JSON.stringify(maskAuditPasswords(JSON.parse(log.changes!)));
    if (masked !== log.changes) {
      await prisma.auditLog.update({ where: { id: log.id }, data: { changes: masked } });
      scrubbed++;
    }
  }

  // Deleted text stays readable in free database pages and the WAL until these run
  await prisma.$executeRawUnsafe('VACUUM;');
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');

  console.log(`Checked ${logs.length} audit entries, scrubbed ${scrubbed}`);
}

main()
  .catch((e) => {
    console.error('Scrub failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
