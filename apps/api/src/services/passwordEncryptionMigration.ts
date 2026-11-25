import { PrismaClient } from '@prisma/client';
import { ENCRYPTED_PREFIX, keyFilePath } from '../lib/secretBox.js';

// Passwords saved before 1.38.0 are plain text. They are encrypted at startup, once the
// key is known to read the passwords that are already encrypted.
// Takes the client from createPrismaClient, which does the encrypting.
export async function encryptExistingPasswords(prisma: PrismaClient) {
  // Decrypting happens when the field is read, not when the row is fetched
  try {
    (await prisma.asset.findFirst({ where: { devicePassword: { startsWith: ENCRYPTED_PREFIX } } }))?.devicePassword;
    (await prisma.student.findFirst({ where: { password: { startsWith: ENCRYPTED_PREFIX } } }))?.password;
  } catch (err) {
    throw new Error(
      `${keyFilePath()} cannot read the stored passwords. Replace it with the ITMS.key that was backed up with this database. (${(err as Error).message})`
    );
  }

  const assets = await prisma.asset.findMany({
    where: { AND: [{ devicePassword: { not: null } }, { devicePassword: { not: '' } }, { NOT: { devicePassword: { startsWith: ENCRYPTED_PREFIX } } }] },
    select: { id: true, devicePassword: true, updatedAt: true }
  });
  const students = await prisma.student.findMany({
    where: { AND: [{ password: { not: null } }, { password: { not: '' } }, { NOT: { password: { startsWith: ENCRYPTED_PREFIX } } }] },
    select: { id: true, password: true, updatedAt: true }
  });
  if (!assets.length && !students.length) return;

  // updatedAt is kept, as encrypting is not an edit
  for (const a of assets) {
    await prisma.asset.update({ where: { id: a.id }, data: { devicePassword: a.devicePassword, updatedAt: a.updatedAt } });
  }
  for (const s of students) {
    await prisma.student.update({ where: { id: s.id }, data: { password: s.password, updatedAt: s.updatedAt } });
  }
  // Rewrites the file so the plain text is not left in free pages, then empties the
  // write-ahead log, which still holds the old pages
  await prisma.$executeRawUnsafe('VACUUM;');
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log(`Encrypted ${assets.length} device passwords and ${students.length} student passwords`);
}
