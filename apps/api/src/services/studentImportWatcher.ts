import { PrismaClient } from '@prisma/client';
import chokidar, { FSWatcher } from 'chokidar';
import { runStudentImport } from './studentImporter';

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Starts watching the student import folder for file changes.
 * Returns a watcher instance that can be stopped.
 * Returns null if the import path is not configured.
 */
export async function startStudentImportWatcher(prisma: PrismaClient): Promise<FSWatcher | null> {
  try {
    const pathSetting = await prisma.settings.findUnique({ where: { key: 'studentImportPath' } });
    const importPath = pathSetting?.value;

    if (!importPath) {
      console.log('[StudentImportWatcher] No import path configured, skipping watcher startup');
      return null;
    }

    console.log(`[StudentImportWatcher] Starting watcher for: ${importPath}`);

    watcher = chokidar.watch(importPath, {
      ignored: /(^|[\/\\])\./,
      persistent: true,
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
  if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
    return;
  }

  // Debounce: reset timer on each event
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    try {
      console.log(`[StudentImportWatcher] Importing file: ${filePath}`);
      const result = await runStudentImport(prisma);
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
  }, 2000);
}
