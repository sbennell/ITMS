import { execFileSync, spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const API_DIR = path.join(__dirname, '..');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

export const LIMITED_PERMISSIONS = {
  canAccessAssets: true,
  canAccessStudents: true,
  canAccessStocktake: true,
  canAccessReports: true,
  canAccessSoftware: true,
  canViewDevicePasswords: false,
  canViewStudentPasswords: false
};

export const PASSWORD = 'password1';

export async function waitFor(condition: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await sleep(250);
  }
  return false;
}

// Starts the real API on a free port, against its own temporary database
export async function startServer() {
  const dir = mkdtempSync(path.join(tmpdir(), 'itms-test-'));
  const uploadDir = path.join(dir, 'uploads');
  const url = `file:${path.join(dir, 'test.db')}`;
  const port = await freePort();
  const env = {
    ...process.env,
    DATABASE_URL: url,
    PORT: String(port),
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-secret',
    UPLOAD_DIR: uploadDir
  };

  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: API_DIR,
    env,
    stdio: 'ignore'
  });

  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: API_DIR, env, stdio: 'ignore' });
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const base = `http://127.0.0.1:${port}/api`;

  const send = async (method: string, urlPath: string, cookie: string | undefined, init: RequestInit) => {
    const response = await fetch(base + urlPath, {
      ...init,
      method,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
      signal: AbortSignal.timeout(15000)
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      headers: response.headers,
      buffer,
      text: buffer.toString(),
      json: () => JSON.parse(buffer.toString())
    };
  };

  const call = (method: string, urlPath: string, cookie?: string, body?: unknown) =>
    send(method, urlPath, cookie, {
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  const upload = (urlPath: string, cookie: string, filename: string, content: string | Buffer, type: string) => {
    const form = new FormData();
    form.append('file', new Blob([content], { type }), filename);
    return send('POST', urlPath, cookie, { body: form });
  };

  const isAlive = async () => {
    if (exited) return false;
    try {
      return (await call('GET', '/health')).status === 200;
    } catch {
      return false;
    }
  };

  if (!(await waitFor(isAlive, 30000))) {
    throw new Error('Test server did not start');
  }

  // The login route allows 10 attempts per 15 minutes, so each test file must stay under that
  const login = async (username: string) => {
    const response = await call('POST', '/auth/login', undefined, { username, password: PASSWORD });
    if (response.status !== 200) throw new Error(`Login failed for ${username}: ${response.text}`);
    return response.headers.get('set-cookie')!.split(';')[0];
  };

  const createUser = async (adminCookie: string, username: string, extra: object = {}) => {
    const response = await call('POST', '/auth/users', adminCookie, {
      username,
      password: PASSWORD,
      fullName: username,
      role: 'USER',
      ...LIMITED_PERMISSIONS,
      ...extra
    });
    if (response.status !== 201) throw new Error(`Could not create ${username}: ${response.text}`);
    return response.json();
  };

  const stop = async () => {
    child.kill();
    await prisma.$disconnect();
    await sleep(300);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };

  return { prisma, dir, uploadDir, call, upload, login, createUser, isAlive, stop };
}

export type TestServer = Awaited<ReturnType<typeof startServer>>;
