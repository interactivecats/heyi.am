// Express router for native folder picker dialogs.
//
// Why this exists: the browser File System Access API
// (`showDirectoryPicker`) returns a `FileSystemDirectoryHandle` with `.name`
// but no absolute path — a deliberate browser privacy restriction. The CLI
// is local-only, the user is on their own machine, and the backend needs a
// real absolute path to write the export to. We shell out to the OS-native
// folder picker via `child_process.spawn`, which has no such restriction.
//
// All argv strings are static literals — there is NO user-supplied input
// passed to spawn, so the standard shell-injection class of bug doesn't
// apply. We still use spawn (not exec) and pass argv as an array, never as
// a single string.

import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import { getAuthToken } from '../auth.js';
import type { RouteContext } from './context.js';

interface DialogOk {
  ok: true;
  path: string;
}
interface DialogCancelled {
  ok: false;
  cancelled: true;
}
interface DialogError {
  ok: false;
  error: { code: string; message: string };
}
export type PickFolderResult = DialogOk | DialogCancelled | DialogError;

interface SpawnOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError?: NodeJS.ErrnoException;
}

type SpawnFn = (cmd: string, args: string[]) => Promise<SpawnOutcome>;

const DIALOG_TITLE = 'Pick portfolio export folder';

function defaultSpawn(cmd: string, args: string[]): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args);
    } catch (err) {
      resolve({ code: null, stdout: '', stderr: '', spawnError: err as NodeJS.ErrnoException });
      return;
    }
    child.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ code: null, stdout, stderr, spawnError: err });
    });
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Pure, testable folder-picker driver. Takes the platform as a parameter
 * and a spawn function so unit tests can simulate each OS without actually
 * shelling out.
 */
export async function pickFolderViaNativeDialog(
  platform: NodeJS.Platform,
  spawnFn: SpawnFn = defaultSpawn,
): Promise<PickFolderResult> {
  if (platform === 'darwin') {
    const script = `POSIX path of (choose folder with prompt "${DIALOG_TITLE}")`;
    const out = await spawnFn('osascript', ['-e', script]);
    if (out.spawnError) {
      return errorResult('DIALOG_SPAWN_FAILED', out.spawnError.message);
    }
    if (out.code !== 0) {
      // AppleScript exits non-zero on cancel.
      return { ok: false, cancelled: true };
    }
    const trimmed = out.stdout.trim();
    if (trimmed.length === 0) return { ok: false, cancelled: true };
    return { ok: true, path: trimmed };
  }

  if (platform === 'linux') {
    const out = await spawnFn('zenity', [
      '--file-selection',
      '--directory',
      '--title',
      DIALOG_TITLE,
    ]);
    if (out.spawnError) {
      if (out.spawnError.code === 'ENOENT') {
        return errorResult(
          'ZENITY_MISSING',
          'Install zenity (apt install zenity) or type the path manually',
        );
      }
      return errorResult('DIALOG_SPAWN_FAILED', out.spawnError.message);
    }
    if (out.code === 1) {
      // zenity exits with 1 on cancel.
      return { ok: false, cancelled: true };
    }
    if (out.code !== 0) {
      return errorResult(
        'DIALOG_FAILED',
        `zenity exited with code ${out.code}: ${out.stderr.trim()}`,
      );
    }
    const trimmed = out.stdout.trim();
    if (trimmed.length === 0) return { ok: false, cancelled: true };
    return { ok: true, path: trimmed };
  }

  if (platform === 'win32') {
    const psScript =
      '$f = New-Object -ComObject Shell.Application; ' +
      `$folder = $f.BrowseForFolder(0, "${DIALOG_TITLE}", 0); ` +
      'if ($folder) { $folder.Self.Path }';
    const out = await spawnFn('powershell', ['-NoProfile', '-Command', psScript]);
    if (out.spawnError) {
      return errorResult('DIALOG_SPAWN_FAILED', out.spawnError.message);
    }
    if (out.code !== 0) {
      return errorResult(
        'DIALOG_FAILED',
        `powershell exited with code ${out.code}: ${out.stderr.trim()}`,
      );
    }
    const trimmed = out.stdout.trim();
    if (trimmed.length === 0) return { ok: false, cancelled: true };
    return { ok: true, path: trimmed };
  }

  return errorResult('UNSUPPORTED_PLATFORM', `Native dialog not supported on ${platform}`);
}

function errorResult(code: string, message: string): DialogError {
  return { ok: false, error: { code, message } };
}

export function createDialogRouter(_ctx: RouteContext): Router {
  const router = Router();

  router.post('/api/dialog/pick-folder', async (_req: Request, res: Response) => {
    if (!getAuthToken()) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
      return;
    }
    try {
      const result = await pickFolderViaNativeDialog(process.platform);
      if (result.ok) {
        res.json(result);
      } else if ('cancelled' in result) {
        res.json(result);
      } else {
        // Map known structured errors to appropriate HTTP status codes.
        const status = result.error.code === 'ZENITY_MISSING' ? 503
          : result.error.code === 'UNSUPPORTED_PLATFORM' ? 501
          : 500;
        res.status(status).json(result);
      }
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: {
          code: 'DIALOG_INTERNAL_ERROR',
          message: (err as Error).message,
        },
      });
    }
  });

  return router;
}
