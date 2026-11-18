import { PrismaClient, Student } from '@prisma/client';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const SCRIPT = path.join(__dirname, '../../scripts/ad-sync.ps1');
const TIMEOUT_MS = 10 * 60 * 1000;

export type AdSyncMode = 'Preview' | 'Apply' | 'Check';

export interface AdSyncConfig {
  enabled: boolean;
  studentsOU: string;
  inactiveOU: string;
  yearGroupsOU: string;
  studentsGroupDN: string;
  staffGroupDN: string;
  logonScript: string;
  driveRootPath: string;
  driveInactiveFolder: string;
  organizeBy: 'Form' | 'YearLevel';
  folderNameFormat: 'FirstnameLastname' | 'LastnameFirstname';
}

export interface AdSyncStudent {
  action: 'upsert' | 'disable';
  username: string;
  firstName: string;
  surname: string;
  email: string | null;
  yearLevel: string | null;
  form: string | null;
  gender: string | null;
  studentNumber: string | null;
  governmentNumber: string | null;
  password: string | null;
}

export interface AdSyncResult {
  username: string;
  name: string;
  action: 'create' | 'update' | 'disable' | 'none' | 'setup';
  ok: boolean;
  error: string | null;
  steps: string[];
}

export interface AdSyncRun {
  mode: AdSyncMode;
  results: AdSyncResult[];
}

// Runs the script with these files and returns its stderr.
// Tests replace it, as PowerShell and AD are not available there.
export type AdSyncRunner = (mode: AdSyncMode, inputFile: string, outputFile: string) => Promise<string>;

export class AdSyncError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const REQUIRED_FIELDS: Array<keyof AdSyncConfig> = ['studentsOU', 'inactiveOU', 'yearGroupsOU', 'studentsGroupDN'];
const FOLDER_FIELDS: Array<keyof AdSyncConfig> = ['driveInactiveFolder', 'staffGroupDN'];

// Statuses the import gives students who should have an AD account (from Master_List.csv)
const SYNCED_STATUSES = ['active', 'new'];

export async function getAdSyncConfig(prisma: PrismaClient): Promise<AdSyncConfig | null> {
  const setting = await prisma.settings.findUnique({ where: { key: 'adSyncConfig' } });
  if (!setting?.value) return null;
  try {
    return JSON.parse(setting.value) as AdSyncConfig;
  } catch {
    return null;
  }
}

export async function isAdSyncEnabled(prisma: PrismaClient): Promise<boolean> {
  return (await getAdSyncConfig(prisma))?.enabled === true;
}

function toAdSyncStudent(s: Student): AdSyncStudent {
  return {
    action: 'upsert',
    username: s.username!,
    firstName: s.firstName,
    surname: s.surname,
    email: s.email,
    yearLevel: s.schoolYear,
    form: s.homeGroup,
    gender: s.gender,
    studentNumber: s.studentNumber,
    governmentNumber: s.governmentNumber,
    password: s.password
  };
}

export async function buildAdSyncStudents(prisma: PrismaClient): Promise<AdSyncStudent[]> {
  const students = await prisma.student.findMany({
    where: { username: { not: null } },
    orderBy: [{ surname: 'asc' }, { firstName: 'asc' }]
  });
  const leavers = await prisma.adLeaver.findMany({ orderBy: [{ surname: 'asc' }, { firstName: 'asc' }] });

  const upserts = students
    .filter((s) => s.username && SYNCED_STATUSES.includes(s.status.toLowerCase()))
    .map(toAdSyncStudent);

  const disables: AdSyncStudent[] = leavers.map((l) => ({
    action: 'disable',
    username: l.username,
    firstName: l.firstName,
    surname: l.surname,
    email: null,
    yearLevel: l.schoolYear,
    form: l.homeGroup,
    gender: null,
    studentNumber: null,
    governmentNumber: null,
    password: null
  }));

  return [...upserts, ...disables];
}

const runPowerShell: AdSyncRunner = (mode, inputFile, outputFile) =>
  new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
        '-Mode', mode, '-InputFile', inputFile, '-OutputFile', outputFile],
      { windowsHide: true, timeout: TIMEOUT_MS },
      (error, _stdout, stderr) => {
        if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
          reject(new AdSyncError('PowerShell was not found on this server', 500));
        } else {
          // A non-zero exit still writes its error to the output file, which is read next
          resolve(stderr);
        }
      }
    );
  });

let running = false;

// Writes the input, runs the script and returns its results. The input can hold student
// passwords, so it lives in a private temp folder that is always removed.
async function runScript<T>(
  config: AdSyncConfig,
  mode: AdSyncMode,
  students: AdSyncStudent[],
  runner: AdSyncRunner
): Promise<T[]> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'itms-ad-sync-'));
    const inputFile = path.join(dir, 'input.json');
    const outputFile = path.join(dir, 'output.json');
    await writeFile(inputFile, JSON.stringify({ config, students }), { encoding: 'utf8', mode: 0o600 });

    const stderr = await runner(mode, inputFile, outputFile);

    let output: { ok: boolean; error: string | null; results: T[] | T | null };
    try {
      output = JSON.parse((await readFile(outputFile, 'utf8')).replace(/^\uFEFF/, ''));
    } catch {
      throw new AdSyncError(`The AD sync script did not return a result. ${stderr.trim()}`.trim(), 500);
    }
    if (!output.ok) throw new AdSyncError(output.error || 'The AD sync script failed', 500);

    // PowerShell 5.1 writes a one item list as a single object
    return Array.isArray(output.results) ? output.results : output.results ? [output.results] : [];
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

async function getCheckedConfig(prisma: PrismaClient): Promise<AdSyncConfig> {
  const config = await getAdSyncConfig(prisma);
  if (!config?.enabled) throw new AdSyncError('AD sync is not enabled');

  const required = config.driveRootPath ? [...REQUIRED_FIELDS, ...FOLDER_FIELDS] : REQUIRED_FIELDS;
  const missing = required.filter((field) => !config[field]);
  if (missing.length > 0) throw new AdSyncError(`AD sync settings are missing: ${missing.join(', ')}`);
  return config;
}

export async function runAdSync(
  prisma: PrismaClient,
  mode: 'Preview' | 'Apply',
  runner: AdSyncRunner = runPowerShell
): Promise<AdSyncRun> {
  const config = await getCheckedConfig(prisma);

  if (running) throw new AdSyncError('An AD sync is already running', 409);
  running = true;

  try {
    const students = await buildAdSyncStudents(prisma);
    const results = (await runScript<AdSyncResult>(config, mode, students, runner)).map((r) => ({
      ...r,
      steps: Array.isArray(r.steps) ? r.steps : r.steps ? [String(r.steps)] : []
    }));

    if (mode === 'Apply') {
      const leavers = new Set(students.filter((s) => s.action === 'disable').map((s) => s.username));
      const done = results.filter((r) => r.ok && leavers.has(r.username)).map((r) => r.username);
      await prisma.adLeaver.deleteMany({ where: { username: { in: done } } });
      await prisma.settings.upsert({
        where: { key: 'adSyncLastRun' },
        create: { key: 'adSyncLastRun', value: new Date().toISOString() },
        update: { value: new Date().toISOString() }
      });
      logResults(results);
    }

    return { mode, results };
  } finally {
    running = false;
  }
}

export interface HomeFolderStatus {
  enabled: boolean;
  expectedPath?: string;
  path?: string | null;
  exists?: boolean;
  inRightPlace?: boolean;
  permissionsOk?: boolean;
  problems?: string[];
}

// Read only check of one student's home folder against what Apply sets
export async function checkHomeFolder(
  prisma: PrismaClient,
  studentId: string,
  runner: AdSyncRunner = runPowerShell
): Promise<HomeFolderStatus> {
  const config = await getAdSyncConfig(prisma);
  if (!config?.enabled || !config.driveRootPath) return { enabled: false };
  await getCheckedConfig(prisma);

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new AdSyncError('Student not found', 404);
  if (!student.username) throw new AdSyncError('This student has no username, so their folder cannot be checked');

  // The check does not need the password, so it is not sent
  const input = { ...toAdSyncStudent(student), password: null };
  const [result] = await runScript<{ ok: boolean; error: string | null; folder: Omit<HomeFolderStatus, 'enabled'> }>(
    config, 'Check', [input], runner
  );
  if (!result) throw new AdSyncError('The AD sync script did not return a result', 500);
  if (!result.ok) throw new AdSyncError(result.error || 'The home folder check failed', 500);

  const problems = result.folder.problems;
  return {
    enabled: true,
    ...result.folder,
    problems: Array.isArray(problems) ? problems : problems ? [String(problems)] : []
  };
}

// Goes to the service's stdout log. Results never contain passwords.
function logResults(results: AdSyncResult[]) {
  const stamp = new Date().toISOString();
  for (const r of results) {
    if (r.action === 'none' && r.ok) continue;
    console.log(`[AD sync ${stamp}] ${r.name} (${r.username}) ${r.action}${r.ok ? '' : ` FAILED: ${r.error}`}`);
    for (const step of r.steps) console.log(`[AD sync ${stamp}]   ${step}`);
  }
}
