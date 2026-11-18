import { PrismaClient } from '@prisma/client';
import { execFile } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { ImportResult, runStudentImport } from './studentImporter.js';

// Runs the school's student account matcher scripts to build the master list, then imports it.
// Catholic (Standard) schools use AD_Student_Export.ps1 and Student_Account_Matcher.ps1,
// DE schools use the DE Student_Account_Matcher.ps1 (Cases21 and STMC).

const DEFAULT_FOLDER = 'C:\\ITMS\\Scripts';
const TIMEOUT_MS = 15 * 60 * 1000;

export type ExportKind = 'admin' | 'google' | 'cases21';

export class StudentScriptsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

interface ExportFile {
  label: string;
  dir: string[];
  // The file name the script looks for. Google exports are found by pattern, newest first.
  fileName: () => string;
  matches: (name: string) => boolean;
}

const EXPORTS: Record<ExportKind, ExportFile> = {
  admin: {
    label: 'Admin system export',
    dir: ['source', 'admin'],
    fileName: () => 'exp_ceovic_ven_stu.csv',
    matches: (name) => name.toLowerCase() === 'exp_ceovic_ven_stu.csv'
  },
  google: {
    label: 'Google Workspace export',
    dir: ['source', 'google'],
    fileName: () => `User_Download_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.csv`,
    matches: (name) => /^User_Download_.*\.csv$/i.test(name)
  },
  cases21: {
    label: 'Cases21 export',
    dir: ['source', 'cases21'],
    fileName: () => 'cases21_students.csv',
    matches: (name) => name.toLowerCase() === 'cases21_students.csv'
  }
};

interface ScriptStep {
  file: string;
  args: string[];
}

interface SchoolScripts {
  exports: ExportKind[];
  output: string[];
  steps: (folder: string) => ScriptStep[];
}

const SCHOOL_SCRIPTS: Record<'STANDARD' | 'DE', SchoolScripts> = {
  STANDARD: {
    exports: ['admin', 'google'],
    output: ['data', 'Master_List.csv'],
    steps: () => [
      { file: 'AD_Student_Export.ps1', args: [] },
      { file: 'Student_Account_Matcher.ps1', args: ['-Unattended'] }
    ]
  },
  DE: {
    exports: ['cases21'],
    output: ['data', 'student_master_list.csv'],
    // An uploaded Cases21 export is used. Without one, the path in config.json is used.
    steps: (folder) => {
      const cases21 = path.join(folder, ...EXPORTS.cases21.dir, EXPORTS.cases21.fileName());
      return [{ file: 'Student_Account_Matcher.ps1', args: existsSync(cases21) ? ['-Cases21CsvPath', cases21] : [] }];
    }
  }
};

// Runs one script in the folder and returns its exit code (null if it was stopped) and output.
// Tests replace it, as PowerShell is not available there.
export type ScriptRunner = (file: string, args: string[], cwd: string) => Promise<{ code: number | null; output: string }>;

const runPowerShell: ScriptRunner = (file, args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args],
      { cwd, windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === 'ENOENT') return reject(new StudentScriptsError('PowerShell was not found on this server', 500));
        const output = `${stdout}${stderr}`;
        if (error?.killed) return resolve({ code: null, output: `${output}\nStopped after ${TIMEOUT_MS / 60000} minutes` });
        resolve({ code: error ? (typeof code === 'number' ? code : 1) : 0, output });
      }
    );
  });

async function getSchool(prisma: PrismaClient) {
  const [folderSetting, typeSetting] = await Promise.all([
    prisma.settings.findUnique({ where: { key: 'studentScriptsFolder' } }),
    prisma.settings.findUnique({ where: { key: 'schoolType' } })
  ]);
  const schoolType = typeSetting?.value === 'DE' ? 'DE' : 'STANDARD';
  return { folder: folderSetting?.value || DEFAULT_FOLDER, schoolType, scripts: SCHOOL_SCRIPTS[schoolType] } as const;
}

function latestExport(folder: string, kind: ExportKind) {
  const dir = path.join(folder, ...EXPORTS[kind].dir);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(EXPORTS[kind].matches)
    .map((name) => ({ name, modified: statSync(path.join(dir, name)).mtime }))
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return files[0] ?? null;
}

const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

export async function getStudentScriptsStatus(prisma: PrismaClient) {
  const { folder, schoolType, scripts } = await getSchool(prisma);
  const folderExists = existsSync(folder);
  const outputFile = path.join(folder, ...scripts.output);
  const importFile = (await prisma.settings.findUnique({ where: { key: 'studentImportFile' } }))?.value || '';
  const lastRun = (await prisma.settings.findUnique({ where: { key: 'studentScriptsLastRun' } }))?.value || null;

  return {
    folder,
    folderExists,
    schoolType,
    outputFile,
    importsOutput: samePath(importFile, outputFile),
    lastRun,
    exports: scripts.exports.map((kind) => {
      const latest = folderExists ? latestExport(folder, kind) : null;
      return { kind, label: EXPORTS[kind].label, fileName: latest?.name ?? null, modified: latest?.modified.toISOString() ?? null };
    })
  };
}

export async function saveStudentExport(prisma: PrismaClient, kind: string, content: Buffer, originalName: string) {
  const { folder, scripts } = await getSchool(prisma);
  if (!(kind in EXPORTS) || !scripts.exports.includes(kind as ExportKind)) {
    throw new StudentScriptsError('This export is not used for this school type');
  }
  if (!/\.csv$/i.test(originalName)) throw new StudentScriptsError('Upload the export as a CSV file');
  if (!existsSync(folder)) throw new StudentScriptsError(`The scripts folder ${folder} was not found`);

  const file = EXPORTS[kind as ExportKind];
  const dir = path.join(folder, ...file.dir);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file.fileName());
  await writeFile(target, content);
  return { path: target };
}

export interface ScriptRunResult {
  ok: boolean;
  steps: { script: string; ok: boolean; output: string }[];
  import: ImportResult | null;
  message: string | null;
}

let running = false;

export async function runStudentScripts(prisma: PrismaClient, runner: ScriptRunner = runPowerShell): Promise<ScriptRunResult> {
  const { folder, scripts } = await getSchool(prisma);
  if (!existsSync(folder)) throw new StudentScriptsError(`The scripts folder ${folder} was not found`);

  const steps = scripts.steps(folder);
  const missing = steps.filter((step) => !existsSync(path.join(folder, step.file))).map((step) => step.file);
  if (missing.length > 0) throw new StudentScriptsError(`Not found in ${folder}: ${missing.join(', ')}`);

  if (running) throw new StudentScriptsError('The scripts are already running', 409);
  running = true;

  try {
    const result: ScriptRunResult = { ok: true, steps: [], import: null, message: null };
    for (const step of steps) {
      const { code, output } = await runner(path.join(folder, step.file), step.args, folder);
      result.steps.push({ script: step.file, ok: code === 0, output });
      if (code !== 0) {
        result.ok = false;
        result.message = `${step.file} failed${code === null ? '' : ` with exit code ${code}`}, so the student import was not run`;
        return result;
      }
    }

    await prisma.settings.upsert({
      where: { key: 'studentScriptsLastRun' },
      create: { key: 'studentScriptsLastRun', value: new Date().toISOString() },
      update: { value: new Date().toISOString() }
    });

    // Only import the list the scripts just made, not some other configured file
    const outputFile = path.join(folder, ...scripts.output);
    const importFile = (await prisma.settings.findUnique({ where: { key: 'studentImportFile' } }))?.value || '';
    if (!samePath(importFile, outputFile)) {
      result.message = `The student import file is not ${outputFile}, so the import was not run`;
      return result;
    }

    // Started by an administrator, so the automatic removal limit does not apply
    result.import = await runStudentImport(prisma);
    return result;
  } finally {
    running = false;
  }
}
