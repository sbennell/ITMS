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

// POST /api/system/update - trigger update via pre-configured scheduled task
router.post('/update', requireAdmin, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'production') {
    return res.status(400).json({ error: 'Updates can only be triggered in production mode' });
  }

  if (existsSync(lockFile)) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  // Create lock file so frontend knows update is in progress
  try {
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    writeFileSync(lockFile, new Date().toISOString(), 'utf8');
  } catch (err: any) {
    console.error('Failed to create update lock file:', err);
    return res.status(500).json({ error: `Failed to create lock file: ${err.message}` });
  }

  // Run the pre-configured scheduled task (created by install.ps1).
  // Task Scheduler runs under its own service, completely independent of NSSM,
  // so the update process survives the service being stopped and restarted.
  try {
    execSync('schtasks /Run /TN "AssetSystemWebUpdate"', { stdio: 'ignore', windowsHide: true });
  } catch (err: any) {
    try { unlinkSync(lockFile); } catch {}
    console.error('Failed to trigger update task:', err);
    return res.status(500).json({ error: 'Failed to trigger update. Is the AssetSystemWebUpdate scheduled task configured?' });
  }

  res.json({ status: 'updating' });
});

// GET /api/system/update-status - check if update is in progress
router.get('/update-status', requireAdmin, async (_req: Request, res: Response) => {
  res.json({ updating: existsSync(lockFile) });
});

export default router;
