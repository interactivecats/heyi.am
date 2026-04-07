import { spawn } from 'node:child_process';

/**
 * Open a directory in the host OS file manager. Best-effort:
 * failures are swallowed and reported via the boolean return.
 *
 * Platform branches:
 *  - darwin → `open <path>`
 *  - linux  → `xdg-open <path>`
 *  - win32  → not supported; logs and returns false
 *
 * Uses `spawn` (not `exec`) to avoid shell interpretation of the
 * path argument. The child process is detached and unref'd so the
 * CLI does not block on file-manager lifetime.
 *
 * Exported `platform` is injectable for tests (process.platform is
 * read-only in Node).
 */
export function openInFileManager(
  absolutePath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  let command: string;
  if (platform === 'darwin') {
    command = 'open';
  } else if (platform === 'linux') {
    command = 'xdg-open';
  } else if (platform === 'win32') {
    // Could use explorer.exe, but the plan says log-and-skip.
    console.warn('[portfolio-export] open-in-file-manager: unsupported on win32; open manually:', absolutePath);
    return false;
  } else {
    console.warn(`[portfolio-export] open-in-file-manager: unsupported platform ${platform}`);
    return false;
  }

  try {
    const child = spawn(command, [absolutePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (err) => {
      console.warn(`[portfolio-export] ${command} failed:`, (err as Error).message);
    });
    child.unref();
    return true;
  } catch (err) {
    console.warn(`[portfolio-export] ${command} spawn threw:`, (err as Error).message);
    return false;
  }
}
