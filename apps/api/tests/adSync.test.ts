import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { after, before, beforeEach, test } from 'node:test';
import { startServer, TestServer } from './helpers';
import { AdSyncRunner, checkStudentAd, fixHomeFolder, runAdSync } from '../src/services/adSync';

let server: TestServer;
let admin: string;
let fileCount = 0;

const CONFIG = {
  enabled: true,
  studentsOU: 'OU=Students,DC=test,DC=local',
  inactiveOU: 'OU=Inactive,DC=test,DC=local',
  yearGroupsOU: 'OU=Groups,DC=test,DC=local',
  studentsGroupDN: 'CN=Students,OU=Groups,DC=test,DC=local',
  staffGroupDN: '',
  logonScript: 'default.bat',
  driveRootPath: '',
  driveInactiveFolder: '',
  organizeBy: 'Form',
  folderNameFormat: 'FirstnameLastname'
};

const HEADER = 'Given Name,Surname,Form,Year Level,Account Status,Username,Password,Student ID,Gender\n';

before(async () => {
  server = await startServer();
  admin = await server.login('admin');
  await server.call('PUT', '/lookups/settings/studentCsvMapping', admin, {
    value: JSON.stringify({
      firstName: 'Given Name',
      surname: 'Surname',
      homeGroup: 'Form',
      schoolYear: 'Year Level',
      status: 'Account Status',
      username: 'Username',
      password: 'Password',
      studentNumber: 'Student ID',
      gender: 'Gender'
    })
  });
});
after(() => server.stop());

beforeEach(async () => {
  await server.prisma.student.deleteMany();
  await server.prisma.adLeaver.deleteMany();
  await setConfig(CONFIG);
  await server.prisma.student.create({ data: { firstName: 'Cara', surname: 'Tan', homeGroup: '9C', username: 'ctan' } });
});

const setConfig = (config: object) =>
  server.call('PUT', '/lookups/settings/adSyncConfig', admin, { value: JSON.stringify(config) });

async function runStudentImport(csv: string) {
  const file = path.join(server.dir, `ad-students-${fileCount++}.csv`);
  writeFileSync(file, HEADER + csv);
  await server.call('PUT', '/lookups/settings/studentImportFile', admin, { value: file });
  return (await server.call('POST', '/students/import/run', admin)).json();
}

const leavers = async () => (await server.prisma.adLeaver.findMany({ orderBy: { username: 'asc' } })).map((l) => l.username);

test('the import saves the AD fields and queues leavers with usernames', async () => {
  await runStudentImport('Anna,Lee,7A,Year 7,Active,alee,Tiger.1234,S100,F\nBob,Ng,8B,Year 8,Left,bng,,,\n');

  const anna = await server.prisma.student.findFirstOrThrow({ where: { firstName: 'Anna' } });
  assert.equal(anna.studentNumber, 'S100');
  assert.equal(anna.gender, 'F');

  // Bob is marked Left in the file, and Cara is no longer in it
  assert.deepEqual(await leavers(), ['bng', 'ctan']);
  const cara = await server.prisma.adLeaver.findUniqueOrThrow({ where: { username: 'ctan' } });
  assert.equal(cara.homeGroup, '9C');
  assert.equal(await server.prisma.student.count({ where: { firstName: 'Cara' } }), 0);
});

test('a returning student is taken off the leaver queue', async () => {
  await runStudentImport('Anna,Lee,7A,Year 7,Active,alee,Tiger.1234,S100,F\nBob,Ng,8B,Year 8,Left,bng,,,\n');
  await runStudentImport('Anna,Lee,7A,Year 7,Active,alee,Tiger.1234,S100,F\nBob,Ng,8B,Year 8,Active,bng,Lion.5678,S101,M\nCara,Tan,9C,Year 9,Active,ctan,Bear.1111,S102,F\n');
  assert.deepEqual(await leavers(), []);
});

test('nothing is queued while AD sync is off', async () => {
  await setConfig({ ...CONFIG, enabled: false });
  await runStudentImport('Anna,Lee,7A,Year 7,Active,alee,Tiger.1234,S100,F\nBob,Ng,8B,Year 8,Left,bng,,,\n');
  assert.deepEqual(await leavers(), []);
});

test('the AD sync routes are admin only and need complete settings', async () => {
  await server.createUser(admin, 'staff');
  const staff = await server.login('staff');
  assert.equal((await server.call('POST', '/students/ad-sync/preview', staff)).status, 403);

  await setConfig({ ...CONFIG, enabled: false });
  const disabled = await server.call('POST', '/students/ad-sync/preview', admin);
  assert.equal(disabled.status, 400);
  assert.match(disabled.json().error, /not enabled/);

  await setConfig({ ...CONFIG, driveRootPath: 'D:\\Students' });
  const missing = await server.call('POST', '/students/ad-sync/apply', admin);
  assert.equal(missing.status, 400);
  assert.match(missing.json().error, /driveInactiveFolder, staffGroupDN/);
});

test('apply sends students and leavers to the script, then clears only the leavers it disabled', async () => {
  await runStudentImport('Anna,Lee,7A,Year 7,Active,alee,Tiger.1234,S100,F\nBob,Ng,8B,Year 8,Left,bng,,,\nDan,Wu,7A,Year 7,Archived,dwu,Fox.2222,S103,M\n');

  let inputFile = '';
  let sent: any;
  const runner: AdSyncRunner = async (_mode, input, output) => {
    inputFile = input;
    sent = JSON.parse(readFileSync(input, 'utf8'));
    const results = [
      { username: 'alee', name: 'Anna Lee', action: 'create', ok: true, error: null, steps: ['Create account'] },
      { username: 'bng', name: 'Bob Ng', action: 'disable', ok: true, error: null, steps: 'Disable account' },
      { username: 'ctan', name: 'Cara Tan', action: 'disable', ok: false, error: 'Access denied', steps: [] }
    ];
    writeFileSync(output, JSON.stringify({ ok: true, error: null, results }));
    return '';
  };

  const preview = await runAdSync(server.prisma, 'Preview', runner);
  assert.equal(preview.results.length, 3);
  assert.deepEqual(await leavers(), ['bng', 'ctan']);

  // Archived students are left alone, as in the original script
  assert.deepEqual(sent.students.map((s: any) => `${s.action}:${s.username}`), ['upsert:alee', 'disable:bng', 'disable:ctan']);
  assert.equal(sent.students[0].password, 'Tiger.1234');
  assert.equal(sent.students[0].form, '7A');
  assert.equal(sent.config.studentsOU, CONFIG.studentsOU);
  assert.equal(existsSync(inputFile), false);

  const applied = await runAdSync(server.prisma, 'Apply', runner);
  assert.deepEqual(applied.results[1].steps, ['Disable account']);
  assert.deepEqual(await leavers(), ['ctan']);
  assert.ok(await server.prisma.settings.findUnique({ where: { key: 'adSyncLastRun' } }));
});

test('a script failure is reported and removes the input file', async () => {
  let inputFile = '';
  const runner: AdSyncRunner = async (_mode, input, output) => {
    inputFile = input;
    writeFileSync(output, JSON.stringify({ ok: false, error: 'The ActiveDirectory PowerShell module is not installed', results: [] }));
    return '';
  };

  await assert.rejects(runAdSync(server.prisma, 'Apply', runner), /ActiveDirectory PowerShell module/);
  assert.equal(existsSync(inputFile), false);
  assert.deepEqual(await leavers(), []);
});

test('the AD status is hidden while AD sync is off', async () => {
  await setConfig({ ...CONFIG, enabled: false });
  const cara = await server.prisma.student.findFirstOrThrow({ where: { firstName: 'Cara' } });
  const response = await server.call('GET', `/students/${cara.id}/ad-status`, admin);
  assert.equal(response.status, 200);
  assert.deepEqual(response.json(), { enabled: false });
});

test('the AD check sends one student without a password and returns their groups and folder', async () => {
  await setConfig({ ...CONFIG, driveRootPath: 'D:\\Students', driveInactiveFolder: 'D:\\Students\\Inactive', staffGroupDN: 'CN=Staff,DC=test,DC=local' });
  const cara = await server.prisma.student.findFirstOrThrow({ where: { firstName: 'Cara' } });
  await server.prisma.student.update({ where: { id: cara.id }, data: { password: 'Bear.1111' } });

  let sentMode = '';
  let sent: any;
  const runner: AdSyncRunner = async (mode, input, output) => {
    sentMode = mode;
    sent = JSON.parse(readFileSync(input, 'utf8'));
    const folder = {
      expectedPath: 'D:\\Students\\9C\\Cara Tan',
      path: 'D:\\Students\\9C\\Cara Tan',
      exists: true,
      inRightPlace: true,
      permissionsOk: false,
      problems: 'Missing ctan Modify for this folder and everything in it'
    };
    const account = { exists: true, enabled: true, ou: 'OU=9C,OU=Students,DC=test,DC=local', groups: 'Students', missingGroups: ['9C'] };
    writeFileSync(output, JSON.stringify({ ok: true, error: null, results: { username: 'ctan', name: 'Cara Tan', ok: true, error: null, account, folder } }));
    return '';
  };

  const status = await checkStudentAd(server.prisma, cara.id, runner);
  assert.equal(sentMode, 'Check');
  assert.equal(sent.students.length, 1);
  assert.equal(sent.students[0].username, 'ctan');
  assert.equal(sent.students[0].password, null);
  assert.equal(status.enabled, true);
  assert.deepEqual(status.account?.groups, ['Students']);
  assert.deepEqual(status.account?.missingGroups, ['9C']);
  assert.equal(status.folder?.permissionsOk, false);
  assert.deepEqual(status.folder?.problems, ['Missing ctan Modify for this folder and everything in it']);

  const noUsername = await server.prisma.student.create({ data: { firstName: 'Eve', surname: 'Ko' } });
  await assert.rejects(checkStudentAd(server.prisma, noUsername.id, runner), /no username/);
});

test('fixing a home folder is admin only and needs home folders set up', async () => {
  const cara = await server.prisma.student.findFirstOrThrow({ where: { firstName: 'Cara' } });
  await server.createUser(admin, 'teacher');
  const teacher = await server.login('teacher');
  assert.equal((await server.call('POST', `/students/${cara.id}/home-folder/fix`, teacher)).status, 403);

  const response = await server.call('POST', `/students/${cara.id}/home-folder/fix`, admin);
  assert.equal(response.status, 400);
  assert.match(response.json().error, /Home folders are not set up/);
});

test('a fix returns what it changed and the folder as checked afterwards', async () => {
  await setConfig({ ...CONFIG, driveRootPath: 'D:\\Students', driveInactiveFolder: 'D:\\Students\\Inactive', staffGroupDN: 'CN=Staff,DC=test,DC=local' });
  const cara = await server.prisma.student.findFirstOrThrow({ where: { firstName: 'Cara' } });

  let sentMode = '';
  const runner: AdSyncRunner = async (mode, _input, output) => {
    sentMode = mode;
    const folder = { expectedPath: 'D:\\Students\\9C\\Cara Tan', path: 'D:\\Students\\9C\\Cara Tan', exists: true, inRightPlace: true, permissionsOk: true, problems: [] };
    const account = { exists: true, enabled: true, ou: null, groups: [], missingGroups: [] };
    const result = { username: 'ctan', name: 'Cara Tan', ok: true, error: null, account, folder, steps: 'Reset permissions' };
    writeFileSync(output, JSON.stringify({ ok: true, error: null, results: [result] }));
    return '';
  };

  const status = await fixHomeFolder(server.prisma, cara.id, runner);
  assert.equal(sentMode, 'Fix');
  assert.equal(status.folder?.permissionsOk, true);
  assert.deepEqual(status.folder?.problems, []);
  assert.deepEqual(status.steps, ['Reset permissions']);

  const failing: AdSyncRunner = async (_mode, _input, output) => {
    const result = { username: 'ctan', name: 'Cara Tan', ok: false, error: 'No AD account named ctan. Run Apply in Settings, AD Sync first.', folder: null, steps: [] };
    writeFileSync(output, JSON.stringify({ ok: true, error: null, results: [result] }));
    return '';
  };
  await assert.rejects(fixHomeFolder(server.prisma, cara.id, failing), /No AD account named ctan/);
});

test('secondary folders need the Staff group and come back with the check', async () => {
  await setConfig({ ...CONFIG, secondaryRootPath: 'D:\\Submit' });
  const missing = await server.call('POST', '/students/ad-sync/preview', admin);
  assert.equal(missing.status, 400);
  assert.match(missing.json().error, /staffGroupDN/);

  await setConfig({ ...CONFIG, secondaryRootPath: 'D:\\Submit', staffGroupDN: 'CN=Staff,DC=test,DC=local' });
  const cara = await server.prisma.student.findFirstOrThrow({ where: { firstName: 'Cara' } });

  let sent: any;
  const runner: AdSyncRunner = async (_mode, input, output) => {
    sent = JSON.parse(readFileSync(input, 'utf8'));
    const secondaryFolder = {
      expectedPath: 'D:\\Submit\\2026\\Year 9\\9C\\Cara Tan',
      path: null,
      exists: false,
      inRightPlace: true,
      permissionsOk: false,
      problems: "This year's secondary folder does not exist"
    };
    const result = { username: 'ctan', name: 'Cara Tan', ok: true, error: null, account: null, folder: null, secondaryFolder, steps: [] };
    writeFileSync(output, JSON.stringify({ ok: true, error: null, results: [result] }));
    return '';
  };

  const status = await checkStudentAd(server.prisma, cara.id, runner);
  assert.equal(sent.config.secondaryRootPath, 'D:\\Submit');
  assert.equal(status.folder, null);
  assert.equal(status.secondaryFolder?.exists, false);
  assert.deepEqual(status.secondaryFolder?.problems, ["This year's secondary folder does not exist"]);

  // Fix works with only secondary folders set up
  const fixed = await fixHomeFolder(server.prisma, cara.id, runner);
  assert.equal(fixed.enabled, true);
});

test('a home folder share needs the folder root and a drive letter', async () => {
  await setConfig({ ...CONFIG, homeShareRoot: '\\\\fileserver\\Students$', homeDrive: 'H:' });
  const response = await server.call('POST', '/students/ad-sync/preview', admin);
  assert.equal(response.status, 400);
  assert.match(response.json().error, /Student Folder Root and a Home Drive Letter/);
});
