import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pickFolderViaNativeDialog, createDialogRouter } from './dialog.js';

interface FakeOutcome {
  code: number | null;
  stdout?: string;
  stderr?: string;
  spawnError?: NodeJS.ErrnoException;
}
function fakeSpawn(outcome: FakeOutcome) {
  return vi.fn(async () => ({
    code: outcome.code,
    stdout: outcome.stdout ?? '',
    stderr: outcome.stderr ?? '',
    spawnError: outcome.spawnError,
  }));
}

describe('pickFolderViaNativeDialog', () => {
  describe('darwin', () => {
    it('happy path: returns trimmed path from osascript', async () => {
      const spawnFn = fakeSpawn({ code: 0, stdout: '/Users/ada/portfolio\n' });
      const result = await pickFolderViaNativeDialog('darwin', spawnFn);
      expect(result).toEqual({ ok: true, path: '/Users/ada/portfolio' });
      expect(spawnFn).toHaveBeenCalledWith('osascript', [
        '-e',
        expect.stringContaining('POSIX path of (choose folder'),
      ]);
    });

    it('non-zero exit returns cancelled', async () => {
      const spawnFn = fakeSpawn({ code: 1, stderr: 'User canceled.' });
      const result = await pickFolderViaNativeDialog('darwin', spawnFn);
      expect(result).toEqual({ ok: false, cancelled: true });
    });

    it('empty stdout returns cancelled', async () => {
      const spawnFn = fakeSpawn({ code: 0, stdout: '   \n' });
      const result = await pickFolderViaNativeDialog('darwin', spawnFn);
      expect(result).toEqual({ ok: false, cancelled: true });
    });
  });

  describe('linux', () => {
    it('happy path: returns trimmed path from zenity', async () => {
      const spawnFn = fakeSpawn({ code: 0, stdout: '/home/ada/out\n' });
      const result = await pickFolderViaNativeDialog('linux', spawnFn);
      expect(result).toEqual({ ok: true, path: '/home/ada/out' });
      expect(spawnFn).toHaveBeenCalledWith('zenity', [
        '--file-selection',
        '--directory',
        '--title',
        expect.any(String),
      ]);
    });

    it('exit code 1 returns cancelled', async () => {
      const spawnFn = fakeSpawn({ code: 1 });
      const result = await pickFolderViaNativeDialog('linux', spawnFn);
      expect(result).toEqual({ ok: false, cancelled: true });
    });

    it('ENOENT spawnError returns ZENITY_MISSING', async () => {
      const enoent: NodeJS.ErrnoException = Object.assign(new Error('not found'), {
        code: 'ENOENT',
      });
      const spawnFn = fakeSpawn({ code: null, spawnError: enoent });
      const result = await pickFolderViaNativeDialog('linux', spawnFn);
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'ZENITY_MISSING',
          message: expect.stringContaining('zenity'),
        },
      });
    });
  });

  describe('win32', () => {
    it('happy path: returns trimmed path from powershell', async () => {
      const spawnFn = fakeSpawn({ code: 0, stdout: 'C:\\Users\\Ada\\portfolio\r\n' });
      const result = await pickFolderViaNativeDialog('win32', spawnFn);
      expect(result).toEqual({ ok: true, path: 'C:\\Users\\Ada\\portfolio' });
      expect(spawnFn).toHaveBeenCalledWith('powershell', [
        '-NoProfile',
        '-Command',
        expect.stringContaining('BrowseForFolder'),
      ]);
    });

    it('empty stdout returns cancelled', async () => {
      const spawnFn = fakeSpawn({ code: 0, stdout: '' });
      const result = await pickFolderViaNativeDialog('win32', spawnFn);
      expect(result).toEqual({ ok: false, cancelled: true });
    });
  });

  it('unsupported platform returns UNSUPPORTED_PLATFORM', async () => {
    const spawnFn = fakeSpawn({ code: 0 });
    const result = await pickFolderViaNativeDialog(
      'aix' as NodeJS.Platform,
      spawnFn,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNSUPPORTED_PLATFORM', message: expect.any(String) },
    });
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

describe('POST /api/dialog/pick-folder', () => {
  let configDir: string;
  let app: express.Express;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'heyiam-dialog-test-'));
    process.env.HEYIAM_CONFIG_DIR = configDir;

    app = express();
    app.use(express.json());
    // Cast: tests don't use the route ctx, so an empty stub is fine.
    app.use(createDialogRouter({} as never));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    delete process.env.HEYIAM_CONFIG_DIR;
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/dialog/pick-folder').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns a result shape (ok/cancelled/error) when authenticated', async () => {
    // Drop a fake auth token so getAuthToken() succeeds.
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'auth.json'),
      JSON.stringify({ token: 'tkn', username: 'ada', savedAt: 'now' }),
    );
    const res = await request(app).post('/api/dialog/pick-folder').send({});
    // We can't assert on shell behavior in CI, but the response must be
    // structured: either ok+path, cancelled, or error+code.
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.body).toBeDefined();
    if (res.body.ok === true) {
      expect(typeof res.body.path).toBe('string');
    } else if (res.body.cancelled === true) {
      expect(res.body.ok).toBe(false);
    } else {
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error.code).toBe('string');
    }
  });
});
