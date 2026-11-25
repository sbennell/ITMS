import { execFileSync } from 'child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

// Device and student passwords must be readable again (reveal, login cards, AD sync),
// so they are encrypted with AES-256-GCM rather than hashed.
export const ENCRYPTED_PREFIX = 'enc:v1:';

// The key sits next to the database, as ITMS.key. The backup script copies only the
// database, so a backup on its own does not give up the passwords.
export function keyFilePath(databaseUrl = process.env.DATABASE_URL ?? '') {
  const dbFile = databaseUrl.replace(/^file:/, '').split('?')[0];
  // Prisma reads a relative SQLite path from the prisma folder
  const fullPath = path.isAbsolute(dbFile) ? dbFile : path.join(__dirname, '..', '..', 'prisma', dbFile);
  return path.join(path.dirname(fullPath), 'ITMS.key');
}

export function loadKey(file = keyFilePath()): Buffer {
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (key.length !== 32) throw new Error(`${file} is not a valid ITMS encryption key`);
    return key;
  }

  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64'), { flag: 'wx', mode: 0o600 });
  if (process.platform === 'win32') {
    // Only the account ITMS runs as and Administrators can read it
    try {
      const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' }).trim().split(',').pop()!.replace(/"/g, '');
      execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `*${sid}:F`, '*S-1-5-32-544:F'], { stdio: 'ignore' });
    } catch (err) {
      console.error(`Could not limit access to ${file}, it keeps the data folder's permissions:`, err);
    }
  }
  console.log(`Created the encryption key ${file}. Back it up: without it the stored passwords cannot be read.`);
  return key;
}

export function encrypt(key: Buffer, value: string): string {
  if (!value || value.startsWith(ENCRYPTED_PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ENCRYPTED_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

// Values saved before encryption was added are returned as they are
export function decrypt(key: Buffer, value: string | null): string | null {
  if (!value?.startsWith(ENCRYPTED_PREFIX)) return value;
  const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
