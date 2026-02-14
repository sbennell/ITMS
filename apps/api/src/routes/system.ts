import { Router, Request, Response } from 'express';
import { requireAdmin } from './auth.js';
import { execSync } from 'child_process';

const router = Router();

function isTaskRunning(): boolean {
  try {
    const output = execSync('schtasks /Query /TN "AssetSystemWebUpdate" /FO CSV /NH', {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output.includes('Running');
  } catch {
    return false;
  }
}

// POST /api/system/update - trigger update via pre-configured scheduled task
router.post('/update', requireAdmin, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'production') {
    return res.status(400).json({ error: 'Updates can only be triggered in production mode' });
  }

  if (isTaskRunning()) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  // Run the pre-configured scheduled task (created by install.ps1).
  // Task Scheduler runs under its own service, completely independent of NSSM,
  // so the update process survives the service being stopped and restarted.
  try {
    execSync('schtasks /Run /TN "AssetSystemWebUpdate"', { stdio: 'ignore', windowsHide: true });
  } catch (err: any) {
    console.error('Failed to trigger update task:', err);
    return res.status(500).json({ error: 'Failed to trigger update. Is the AssetSystemWebUpdate scheduled task configured?' });
  }

  res.json({ status: 'updating' });
});

// GET /api/system/update-status - check if update is in progress
router.get('/update-status', requireAdmin, async (_req: Request, res: Response) => {
  res.json({ updating: isTaskRunning() });
});

export default router;
