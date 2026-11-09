import { PrismaClient } from '@prisma/client';
import chokidar, { FSWatcher } from 'chokidar';
import { statSync } from 'fs';
import { runStudentImport } from './studentImporter';

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Starts watching the student import file for changes.
 * Returns a watcher instance that can be stopped.
 * Returns null if the import file is not configured.
 */
export async function startStudentImportWatcher(prisma: PrismaClient): Promise<FSWatcher | null> {
  try {
    const fileSetting = await prisma.settings.findUnique({ where: { key: 'studentImportFile' } });
    const importFile = fileSetting?.value;

    if (!importFile) {
      console.log('[StudentImportWatcher] No import file configured, skipping watcher startup');
      return null;
    }

    // Normalize path - convert backslashes to forward slashes for Windows compatibility
    const normalizedPath = importFile.replace(/\\/g, '/');
    console.log(`[StudentImportWatcher] Starting watcher for: ${normalizedPath}`);

    watcher = chokidar.watch(normalizedPath, {
      persistent: true,
      // An import can delete students, so only a real change to the file may start one,
      // not the service starting or a new path being saved
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    watcher.on('add', (filePath: string) => handleFileChange(filePath, prisma));
    watcher.on('change', (filePath: string) => handleFileChange(filePath, prisma));
    watcher.on('error', (error: Error) => {
      console.error('[StudentImportWatcher] Error:', error.message);
    });

    return watcher;
  } catch (error) {
    console.error('[StudentImportWatcher] Failed to start watcher:', error);
    return null;
  }
}

/**
 * Restarts the watcher when the import path is changed.
 */
export async function restartStudentImportWatcher(prisma: PrismaClient): Promise<FSWatcher | null> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }

  return startStudentImportWatcher(prisma);
}

/**
 * Closes the watcher.
 */
export async function closeStudentImportWatcher(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (watcher) {
    await watcher.close();
    watcher = null;
  }
}

/**
 * Handles file change events with debouncing to avoid duplicate imports.
 */
function handleFileChange(filePath: string, prisma: PrismaClient): void {
  // Only watch CSV and Excel files
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx'].includes(ext || '')) {
    return;
  }

  // Debounce: reset timer on each event
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => runAutomaticImport(filePath, prisma), 2000);
}

async function runAutomaticImport(filePath: string, prisma: PrismaClient): Promise<void> {
  try {
    console.log(`[StudentImportWatcher] Importing file: ${filePath}`);
    const result = await runStudentImport(prisma, { limitRemovals: true });
    console.log(
      `[StudentImportWatcher] Import complete: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`
    );

    if (result.errors.length > 0) {
      console.warn('[StudentImportWatcher] Import errors:');
      result.errors.forEach(err => {
        console.warn(`  Row ${err.row}: ${err.message}`);
      });
    }
  } catch (error) {
    console.error('[StudentImportWatcher] Import failed:', error);
  }
}

/**
 * Runs at service start: the watcher cannot see a change made while the service was stopped.
 */
export async function importIfChangedWhileStopped(prisma: PrismaClient): Promise<void> {
  try {
    const [fileSetting, lastImport] = await Promise.all([
      prisma.settings.findUnique({ where: { key: 'studentImportFile' } }),
      prisma.settings.findUnique({ where: { key: 'studentLastImport' } })
    ]);
    if (!fileSetting?.value || !lastImport?.value) return;

    const filePath = fileSetting.value.replace(/\\/g, '/');
    if (statSync(filePath).mtime > new Date(lastImport.value)) {
      await runAutomaticImport(filePath, prisma);
    }
  } catch (error) {
    console.error('[StudentImportWatcher] Could not check for missed changes:', error);
  }
}
