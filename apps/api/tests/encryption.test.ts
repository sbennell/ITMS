import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/lib/prisma';
import { ENCRYPTED_PREFIX, loadKey } from '../src/lib/secretBox';
import { encryptExistingPasswords } from '../src/services/passwordEncryptionMigration';
import { PASSWORD, startServer, TestServer } from './helpers';

const dir = mkdtempSync(path.join(tmpdir(), 'itms-encryption-'));
const url = `file:${path.join(dir, 'test.db')}`;
execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'ignore'
});
const key = loadKey(path.join(dir, 'ITMS.key'));
const raw = new PrismaClient({ datasources: { db: { url } } });
const prisma = createPrismaClient(key, { datasources: { db: { url } } });

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
  await raw.$disconnect();
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const rawAsset = (id: string) => raw.asset.findUniqueOrThrow({ where: { id } });
const rawStudent = (id: string) => raw.student.findUniqueOrThrow({ where: { id } });

test('passwords are stored encrypted and read back as written', async () => {
  const student = await prisma.student.create({ data: { firstName: 'Ann', surname: 'Lee', password: 'student-pw' } });
  const asset = await prisma.asset.create({ data: { itemNumber: 'E1', devicePassword: 'device-pw', studentId: student.id } });

  assert.ok((await rawAsset(asset.id)).devicePassword!.startsWith(ENCRYPTED_PREFIX));
  assert.ok((await rawStudent(student.id)).password!.startsWith(ENCRYPTED_PREFIX));
  assert.ok(!(await rawAsset(asset.id)).devicePassword!.includes('device-pw'));

  const read = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, include: { student: true } });
  assert.equal(read.devicePassword, 'device-pw');
  assert.equal(read.student!.password, 'student-pw');
  const selected = await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { password: true } });
  assert.equal(selected.password, 'student-pw');
});

test('every kind of write encrypts', async () => {
  const asset = await prisma.asset.create({ data: { itemNumber: 'E2' } });
  await prisma.asset.update({ where: { id: asset.id }, data: { devicePassword: 'updated' } });
  assert.ok((await rawAsset(asset.id)).devicePassword!.startsWith(ENCRYPTED_PREFIX));

  await prisma.asset.updateMany({ where: { id: asset.id }, data: { devicePassword: 'many' } });
  assert.ok((await rawAsset(asset.id)).devicePassword!.startsWith(ENCRYPTED_PREFIX));

  const upserted = await prisma.asset.upsert({ where: { itemNumber: 'E3' }, create: { itemNumber: 'E3', devicePassword: 'upsert' }, update: {} });
  assert.ok((await rawAsset(upserted.id)).devicePassword!.startsWith(ENCRYPTED_PREFIX));

  await prisma.student.createMany({ data: [{ firstName: 'Bo', surname: 'Ng', password: 'bulk' }] });
  const bulk = await raw.student.findFirstOrThrow({ where: { firstName: 'Bo' } });
  assert.ok(bulk.password!.startsWith(ENCRYPTED_PREFIX));
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: bulk.id } })).password, 'bulk');
});

test('empty and missing passwords are left as they are', async () => {
  const asset = await prisma.asset.create({ data: { itemNumber: 'E4', devicePassword: '' } });
  assert.equal((await rawAsset(asset.id)).devicePassword, '');
  const none = await prisma.asset.create({ data: { itemNumber: 'E5' } });
  assert.equal((await rawAsset(none.id)).devicePassword, null);
});

test('startup encrypts plain text passwords from before 1.38.0 without changing updatedAt', async () => {
  const oldAsset = await raw.asset.create({ data: { itemNumber: 'OLD1', devicePassword: 'legacy-device' } });
  const oldStudent = await raw.student.create({ data: { firstName: 'Cy', surname: 'Old', password: 'legacy-student' } });
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: oldAsset.id } })).devicePassword, 'legacy-device');

  await encryptExistingPasswords(prisma);
  const asset = await rawAsset(oldAsset.id);
  assert.ok(asset.devicePassword!.startsWith(ENCRYPTED_PREFIX));
  assert.equal(asset.updatedAt.getTime(), oldAsset.updatedAt.getTime());
  assert.ok((await rawStudent(oldStudent.id)).password!.startsWith(ENCRYPTED_PREFIX));
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: oldAsset.id } })).devicePassword, 'legacy-device');
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: oldStudent.id } })).password, 'legacy-student');

  // Running again changes nothing
  await encryptExistingPasswords(prisma);
  assert.equal((await rawAsset(oldAsset.id)).devicePassword, asset.devicePassword);
});

test('a key that cannot read the stored passwords stops startup', async () => {
  const otherKey = loadKey(path.join(dir, 'other.key'));
  const wrong = createPrismaClient(otherKey, { datasources: { db: { url } } });
  await assert.rejects(encryptExistingPasswords(wrong), /cannot read the stored passwords/);
  await wrong.$disconnect();
});

test('the key file is reused, and a damaged one is refused', () => {
  assert.deepEqual(loadKey(path.join(dir, 'ITMS.key')), key);
  const bad = path.join(dir, 'bad.key');
  writeFileSync(bad, 'not a key');
  assert.throws(() => loadKey(bad), /not a valid ITMS encryption key/);
});

test('the server creates its key and stores passwords sent to the API encrypted', async () => {
  assert.ok(existsSync(path.join(server.dir, 'ITMS.key')));
  const admin = await server.login('admin');

  const serverRaw = new PrismaClient({ datasources: { db: { url: `file:${path.join(server.dir, 'test.db')}` } } });
  const asset = (await server.call('POST', '/assets', admin, { itemNumber: 'S1', devicePassword: 'api-device' })).json();
  const storedAsset = await serverRaw.asset.findUniqueOrThrow({ where: { id: asset.id } });
  assert.ok(storedAsset.devicePassword!.startsWith(ENCRYPTED_PREFIX));
  const revealed = await server.call('POST', `/assets/${asset.id}/reveal-password`, admin, { password: PASSWORD });
  assert.equal(revealed.json().devicePassword, 'api-device');

  const created = await server.call('POST', '/students', admin, { firstName: 'Di', surname: 'Api', password: 'api-student' });
  assert.equal(created.status, 201, created.text);
  const student = created.json();
  const storedStudent = await serverRaw.student.findUniqueOrThrow({ where: { id: student.id } });
  assert.ok(storedStudent.password!.startsWith(ENCRYPTED_PREFIX));
  assert.equal((await server.call('GET', `/students/${student.id}`, admin)).json().password, 'api-student');
  await serverRaw.$disconnect();
});
