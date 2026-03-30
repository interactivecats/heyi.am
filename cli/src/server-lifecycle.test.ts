import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to control HEYIAM_CONFIG_DIR so PID file operations use our temp dir
let tmpDir: string;
const originalEnv = process.env.HEYIAM_CONFIG_DIR;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'heyiam-lifecycle-test-'));
  process.env.HEYIAM_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalEnv !== undefined) {
    process.env.HEYIAM_CONFIG_DIR = originalEnv;
  } else {
    delete process.env.HEYIAM_CONFIG_DIR;
  }
});

// Import after env setup — these read HEYIAM_CONFIG_DIR at call time
import {
  writeServerPidFile,
  removeServerPidFile,
  readServerPid,
  isHeyiamProcess,
} from './server.js';

describe('PID file management', () => {
  it('writeServerPidFile creates a file with the current PID', () => {
    writeServerPidFile();
    const pidPath = join(tmpDir, 'server.pid');
    expect(existsSync(pidPath)).toBe(true);
    const content = readFileSync(pidPath, 'utf-8').trim();
    expect(parseInt(content, 10)).toBe(process.pid);
  });

  it('readServerPid returns the written PID', () => {
    writeServerPidFile();
    expect(readServerPid()).toBe(process.pid);
  });

  it('readServerPid returns null when no PID file exists', () => {
    expect(readServerPid()).toBeNull();
  });

  it('readServerPid returns null for corrupt PID file', () => {
    writeFileSync(join(tmpDir, 'server.pid'), 'not-a-number');
    expect(readServerPid()).toBeNull();
  });

  it('removeServerPidFile deletes the PID file', () => {
    writeServerPidFile();
    expect(readServerPid()).toBe(process.pid);
    removeServerPidFile();
    expect(readServerPid()).toBeNull();
  });

  it('removeServerPidFile does not throw when file is already gone', () => {
    expect(() => removeServerPidFile()).not.toThrow();
  });

  it('PID file has restrictive permissions (0o600)', () => {
    writeServerPidFile();
    const stat = statSync(join(tmpDir, 'server.pid'));
    // 0o600 = owner read/write only
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('isHeyiamProcess', () => {
  it('returns false for a non-existent PID', () => {
    // PID 99999999 almost certainly doesn't exist
    expect(isHeyiamProcess(99999999)).toBe(false);
  });

  it('returns false for the current process (test runner, not heyiam)', () => {
    // The current process is vitest, not heyiam
    expect(isHeyiamProcess(process.pid)).toBe(false);
  });
});

// ── Version endpoint test ─────────────────────────────────────

// Mock out modules that createApp needs but we don't care about here
vi.mock('./summarize.js', () => ({
  summarizeSession: vi.fn().mockResolvedValue({}),
}));

vi.mock('./llm/index.js', () => ({
  getProvider: vi.fn().mockReturnValue({ name: 'local', enhance: vi.fn() }),
  hasApiKey: vi.fn().mockReturnValue(true),
}));

vi.mock('./auth.js', () => ({
  checkAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
  getAuthToken: vi.fn().mockReturnValue(null),
  saveAuthToken: vi.fn(),
  deleteAuthToken: vi.fn(),
}));

vi.mock('./settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings.js')>();
  return {
    ...actual,
    getAnthropicApiKey: vi.fn().mockReturnValue(null),
  };
});

vi.mock('./enhance/project-enhance.js', () => ({
  enhanceProject: vi.fn(),
}));

vi.mock('./sync.js', () => ({
  syncWithTracking: vi.fn().mockResolvedValue({ indexed: 0, skipped: 0, errors: 0 }),
  syncSessionIndex: vi.fn().mockResolvedValue({ indexed: 0, skipped: 0, errors: 0 }),
  startFileWatcher: vi.fn().mockReturnValue(() => {}),
  startCursorPolling: vi.fn().mockReturnValue(() => {}),
  markSyncPending: vi.fn(),
  getSyncState: vi.fn().mockReturnValue({ status: 'idle', phase: 'done', current: 0, total: 0, parentCount: 0 }),
  onSyncProgress: vi.fn().mockReturnValue(() => {}),
  displayNameFromDir: vi.fn().mockReturnValue('test'),
}));

import request from 'supertest';
import { createApp, SERVER_VERSION } from './server.js';

describe('/api/version endpoint', () => {
  it('returns server identifier and version', async () => {
    const app = createApp(tmpDir, join(tmpDir, 'test.db'));
    const res = await request(app).get('/api/version');

    expect(res.status).toBe(200);
    expect(res.body.server).toBe('heyiam');
    expect(res.body.version).toBe(SERVER_VERSION);
  });

  it('does NOT expose PID', async () => {
    const app = createApp(tmpDir, join(tmpDir, 'test.db'));
    const res = await request(app).get('/api/version');

    expect(res.body.pid).toBeUndefined();
  });
});

describe('SPA fallback', () => {
  it('serves index.html for non-API, non-file routes', async () => {
    const app = createApp(tmpDir, join(tmpDir, 'test.db'));
    const res = await request(app)
      .get('/projects')
      .set('Host', 'localhost:17845');

    // Should serve index.html (200) or at minimum not crash (the test env
    // may not have a built frontend, so 404 from missing index.html is ok —
    // but the response should NOT be Express's default "Cannot GET /projects")
    if (res.status === 200) {
      expect(res.text).toContain('<!doctype html>');
    } else {
      // In test env without built frontend, sendFile fails → 404 "Page not found"
      expect(res.text).toBe('Page not found');
    }
  });

  it('serves index.html for deep SPA routes', async () => {
    const app = createApp(tmpDir, join(tmpDir, 'test.db'));
    const res = await request(app)
      .get('/project/-Users-ben-Dev-myapp')
      .set('Host', 'localhost:17845');

    if (res.status === 200) {
      expect(res.text).toContain('<!doctype html>');
    } else {
      expect(res.text).toBe('Page not found');
    }
  });
});
