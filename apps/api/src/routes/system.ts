import { Router, Request, Response } from 'express';
import { requireAdmin } from './auth.js';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const router = Router();

// Derive paths from compiled output location (apps/api/dist/)
const appRoot = path.resolve(__dirname, '../../..');
const installPath = path.resolve(appRoot, '..');
const logsDir = path.join(installPath, 'logs');
const lockFile = path.join(logsDir, 'update.lock');

// POST /api/system/update - trigger update from GitHub (admin only, production only)
router.post('/update', requireAdmin, async (req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    return res.status(400).json({ error: 'Updates can only be triggered in production mode' });
  }

  // Check if already updating
  if (existsSync(lockFile)) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  // Ensure logs directory exists and write lock file
  try {
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    writeFileSync(lockFile, new Date().toISOString(), 'utf8');
  } catch (err: any) {
    console.error('Failed to create update lock file:', err);
    return res.status(500).json({ error: `Failed to create update lock file: ${err.message}` });
  }

  const taskName = 'AssetSystemWebUpdate';
  const updateScript = path.join(appRoot, 'update.ps1');

  // Generate wrapper script that calls update.ps1 -AutoUpdate and ensures cleanup
  const wrapperPath = path.join(logsDir, '_web_update.ps1');
  const wrapperScript = [
    '$ErrorActionPreference = "Continue"',
    '',
    '# Ensure full system PATH is available',
    '$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")',
    '',
    'try {',
    `    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File \`"${updateScript}\`" -AutoUpdate -InstallPath \`"${installPath}\`"" -Wait -PassThru -WindowStyle Hidden`,
    '} catch {',
    `    "[$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))] Wrapper error: $_" | Out-File "${path.join(logsDir, 'update.log')}" -Append`,
    '}',
    '',
    '# Ensure service is running after update',
    '$svc = Get-Service -Name "AssetSystem" -ErrorAction SilentlyContinue',
    'if ($svc -and $svc.Status -ne "Running") {',
    '    Start-Service -Name "AssetSystem" -ErrorAction SilentlyContinue',
    '    Start-Sleep -Seconds 5',
    '}',
    '',
    '# Remove lock file',
    `Remove-Item "${lockFile}" -Force -ErrorAction SilentlyContinue`,
    '',
  ].join('\r\n');

  try {
    writeFileSync(wrapperPath, wrapperScript, 'utf8');
  } catch (err: any) {
    unlinkSync(lockFile);
    return res.status(500).json({ error: `Failed to write update wrapper: ${err.message}` });
  }

  // Write launcher .cmd to avoid quoting issues with schtasks /TR
  const launcherPath = path.join(logsDir, '_web_update_launcher.cmd');
  try {
    writeFileSync(launcherPath, [
      '@echo off',
      `powershell.exe -ExecutionPolicy Bypass -File "${wrapperPath}"`,
      `schtasks /Delete /TN "${taskName}" /F >nul 2>&1`,
    ].join('\r\n'), 'utf8');
  } catch (err: any) {
    unlinkSync(lockFile);
    return res.status(500).json({ error: `Failed to write launcher: ${err.message}` });
  }

  // Use Windows Task Scheduler to run the update completely independent of NSSM.
  // NSSM uses Job Objects to kill the entire process tree when stopping the service,
  // so any child process (even detached or Start-Process) gets terminated.
  // Task Scheduler runs under its own service, fully outside NSSM's job object.
  try {
    execSync(
      `schtasks /Create /TN "${taskName}" /TR "${launcherPath}" /SC ONCE /ST 00:00 /F /RL HIGHEST /RU SYSTEM`,
      { stdio: 'ignore', windowsHide: true }
    );
    execSync(
      `schtasks /Run /TN "${taskName}"`,
      { stdio: 'ignore', windowsHide: true }
    );
  } catch (err: any) {
    unlinkSync(lockFile);
    console.error('Failed to schedule update:', err);
    return res.status(500).json({ error: `Failed to schedule update: ${err.message}` });
  }

  res.json({ status: 'updating' });
});

// GET /api/system/update-status - check if update is in progress
router.get('/update-status', requireAdmin, async (_req: Request, res: Response) => {
  res.json({ updating: existsSync(lockFile) });
});

export default router;
