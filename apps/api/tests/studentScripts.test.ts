import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { after, before, beforeEach, test } from 'node:test';
import { startServer, TestServer } from './helpers';
import { runStudentScripts, ScriptRunner } from '../src/services/studentScripts';

let server: TestServer;
let admin: string;
let folder: string;

const MASTER_LIST = '"Given Name","Surname","Form","Account Status","Username"\n"Anna","Lee","7A","Active","alee"\n';

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.call('PUT', '/lookups/settings/studentCsvMapping', admin, {
    value: JSON.stringify({ firstName: 'Given Name', surname: 'Surname', homeGroup: 'Form', status: 'Account Status', username: 'Username' })
  });
});
after(() => server.stop());

let folderCount = 0;
beforeEach(async () => {
  folder = path.join(server.dir, `scripts-${folderCount++}`);
  mkdirSync(folder);
  for (const script of ['AD_Student_Export.ps1', 'Student_Account_Matcher.ps1']) writeFileSync(path.join(folder, script), '');
  await setSetting('studentScriptsFolder', folder);
  await setSetting('schoolType', 'STANDARD');
  await setSetting('studentImportFile', path.join(folder, 'data', 'Master_List.csv'));
  await server.prisma.student.deleteMany();
});

const setSetting = (key: string, value: string) => server.call('PUT', `/lookups/settings/${key}`, admin, { value });
const upload = (kind: string, name = 'export.csv') => server.upload(`/students/scripts/upload/${kind}`, admin, name, 'a,b\n1,2\n', 'text/csv');

// Records each script run, and writes the master list when a matcher runs
function fakeRunner(output: string, failOn?: string) {
  const calls: string[] = [];
  const runner: ScriptRunner = async (file, args, cwd) => {
    calls.push([path.basename(file), ...args.map((a) => (a.startsWith(folder) ? path.relative(folder, a) : a))].join(' '));
    assert.equal(cwd, folder);
    if (path.basename(file) === failOn) return { code: 1, output: 'ERROR: something went wrong' };
    if (path.basename(file) === 'Student_Account_Matcher.ps1') {
      mkdirSync(path.join(folder, 'data'), { recursive: true });
      writeFileSync(path.join(folder, 'data', output), MASTER_LIST);
    }
    return { code: 0, output: `${path.basename(file)} done` };
  };
  return { runner, calls };
}

test('Catholic exports are saved where the matcher looks for them', async () => {
  assert.equal((await upload('admin')).status, 200);
  assert.equal((await upload('google')).status, 200);
  assert.ok(existsSync(path.join(folder, 'source', 'admin', 'exp_ceovic_ven_stu.csv')));
  assert.match(readdirSync(path.join(folder, 'source', 'google'))[0], /^User_Download_\d+\.csv$/);

  assert.equal((await upload('cases21')).status, 400);
  assert.equal((await upload('admin', 'export.xlsx')).status, 400);

  const status = (await server.call('GET', '/students/scripts/status', admin)).json();
  assert.equal(status.importsOutput, true);
  assert.deepEqual(status.exports.map((e: any) => [e.kind, !!e.fileName]), [['admin', true], ['google', true]]);
});

test('a Catholic run exports AD, runs the matcher unattended, then imports the master list', async () => {
  const { runner, calls } = fakeRunner('Master_List.csv');
  const result = await runStudentScripts(server.prisma, runner);

  assert.deepEqual(calls, ['AD_Student_Export.ps1', 'Student_Account_Matcher.ps1 -Unattended']);
  assert.equal(result.ok, true);
  assert.equal(result.import?.created, 1);
  assert.equal((await server.prisma.student.findFirstOrThrow()).username, 'alee');
});

test('a run saves a login card PDF for each home group to the login cards folder', async () => {
  const cards = path.join(server.dir, `cards-${folderCount}`);
  const { runner } = fakeRunner('Master_List.csv');
  assert.equal((await runStudentScripts(server.prisma, runner)).loginCards, null);
  assert.equal(existsSync(cards), false);

  await setSetting('loginCardsFolder', cards);
  const status = (await server.call('GET', '/students/scripts/status', admin)).json();
  assert.equal(status.loginCardsFolder, cards);

  const result = await runStudentScripts(server.prisma, fakeRunner('Master_List.csv').runner);
  assert.deepEqual(result.loginCards, { folder: cards, files: ['login-cards-7A.pdf'] });
  assert.ok(readFileSync(path.join(cards, 'login-cards-7A.pdf')).subarray(0, 4).equals(Buffer.from('%PDF')));
  await setSetting('loginCardsFolder', '');
});

test('a failed script stops the run before the import', async () => {
  const { runner, calls } = fakeRunner('Master_List.csv', 'AD_Student_Export.ps1');
  const result = await runStudentScripts(server.prisma, runner);

  assert.deepEqual(calls, ['AD_Student_Export.ps1']);
  assert.equal(result.ok, false);
  assert.equal(result.import, null);
  assert.match(result.message!, /AD_Student_Export.ps1 failed with exit code 1/);
  assert.equal(result.steps[0].output, 'ERROR: something went wrong');
});

test('the import is skipped when it is set to another file', async () => {
  await setSetting('studentImportFile', path.join(server.dir, 'other.csv'));
  const { runner } = fakeRunner('Master_List.csv');
  const result = await runStudentScripts(server.prisma, runner);

  assert.equal(result.ok, true);
  assert.equal(result.import, null);
  assert.match(result.message!, /import was not run/);
});

test('a DE run runs the matcher, which gets Cases21 itself, and imports the DE master list', async () => {
  await setSetting('schoolType', 'DE');
  await setSetting('studentImportFile', path.join(folder, 'data', 'student_master_list.csv'));

  assert.equal((await upload('cases21')).status, 400);
  const status = (await server.call('GET', '/students/scripts/status', admin)).json();
  assert.deepEqual(status.exports, []);

  const { runner, calls } = fakeRunner('student_master_list.csv');
  const result = await runStudentScripts(server.prisma, runner);
  assert.deepEqual(calls, ['Student_Account_Matcher.ps1']);
  assert.equal(result.import?.created, 1);
});

test('a missing script or folder is reported before anything runs', async () => {
  await setSetting('studentScriptsFolder', path.join(server.dir, 'missing'));
  await assert.rejects(runStudentScripts(server.prisma, fakeRunner('Master_List.csv').runner), /was not found/);

  await setSetting('studentScriptsFolder', folder);
  rmSync(path.join(folder, 'Student_Account_Matcher.ps1'));
  await assert.rejects(runStudentScripts(server.prisma, fakeRunner('Master_List.csv').runner), /Not found in .*Student_Account_Matcher.ps1/);
});

test('only administrators can run the scripts or upload exports', async () => {
  await server.createUser(admin, 'staff');
  const staff = await server.login('staff');
  assert.equal((await server.call('POST', '/students/scripts/run', staff)).status, 403);
  assert.equal((await server.upload('/students/scripts/upload/admin', staff, 'export.csv', 'a\n', 'text/csv')).status, 403);
});
