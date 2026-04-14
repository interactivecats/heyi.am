import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mocks ────────────────────────────────────────────────────

vi.mock('../auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth.js')>();
  return {
    ...actual,
    getAuthToken: vi.fn(() => ({ username: 'testuser', token: 'test-token-abc' })),
  };
});

vi.mock('../config.js', () => ({
  API_URL: 'https://heyiam.test',
  PUBLIC_URL: 'https://heyi.test',
  warnIfNonDefaultApiUrl: vi.fn(),
}));

// ── Test fetch ───────────────────────────────────────────────

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

import { createDeleteRouter } from './delete.js';
import type { RouteContext } from './context.js';
import {
  saveUploadedState,
  saveEnhancedData,
  loadEnhancedData,
  getUploadedState,
} from '../settings.js';
import { getAuthToken } from '../auth.js';

let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;
const originalConfigDir = process.env.HEYIAM_CONFIG_DIR;

function makeApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const ctx = {
    db: {} as RouteContext['db'],
    sessionsBasePath: '/tmp',
    getProjects: vi.fn().mockResolvedValue([]),
    getProjectWithStats: vi.fn(),
    loadSession: vi.fn(),
    getSessionStats: vi.fn(),
    buildPreviewPage: vi.fn(),
  } as unknown as RouteContext;
  app.use(createDeleteRouter(ctx));
  return app;
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'heyiam-delete-route-'));
  process.env.HEYIAM_DATA_DIR = configDir;
  process.env.HEYIAM_CONFIG_DIR = configDir;
  fetchMock.mockReset();
  vi.mocked(getAuthToken).mockReturnValue({
    username: 'testuser',
    token: 'test-token-abc',
    savedAt: '2026-04-13T00:00:00.000Z',
  } as ReturnType<typeof getAuthToken>);
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  if (originalDataDir !== undefined) process.env.HEYIAM_DATA_DIR = originalDataDir;
  else delete process.env.HEYIAM_DATA_DIR;
  if (originalConfigDir !== undefined) process.env.HEYIAM_CONFIG_DIR = originalConfigDir;
  else delete process.env.HEYIAM_CONFIG_DIR;
});

// ── DELETE /api/projects/:project/remote ─────────────────────

describe('DELETE /api/projects/:project/remote', () => {
  it('rejects unauthenticated requests with 401 and does not call Phoenix', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a',
      projectId: 42,
      uploadedSessions: ['sess-1'],
    });
    vi.mocked(getAuthToken).mockReturnValueOnce(null);
    const res = await request(makeApp()).delete('/api/projects/proj-a/remote');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_PUBLISHED when local uploaded-state is missing', async () => {
    const res = await request(makeApp()).delete('/api/projects/never-published/remote');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_PUBLISHED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DELETEs Phoenix with bearer auth using published slug, clears local state on 204', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a-slug',
      projectId: 42,
      uploadedSessions: ['sess-1', 'sess-2'],
    });
    saveEnhancedData('sess-1', {
      title: 'One', developerTake: '', context: '',
      skills: [], questions: [], executionSteps: [],
      uploaded: true,
    });
    saveEnhancedData('sess-2', {
      title: 'Two', developerTake: '', context: '',
      skills: [], questions: [], executionSteps: [],
      uploaded: true,
    });

    fetchMock.mockResolvedValueOnce({ status: 204, ok: true });

    const res = await request(makeApp()).delete('/api/projects/proj-a/remote');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://heyiam.test/api/projects/proj-a-slug');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer test-token-abc');

    // Local state cleared.
    expect(getUploadedState('proj-a')).toBeNull();
    expect(loadEnhancedData('sess-1')?.uploaded).toBe(false);
    expect(loadEnhancedData('sess-2')?.uploaded).toBe(false);
  });

  it('maps Phoenix 404 to structured NOT_FOUND and still clears local state', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a-slug',
      projectId: 42,
      uploadedSessions: [],
    });
    fetchMock.mockResolvedValueOnce({ status: 404, ok: false });

    const res = await request(makeApp()).delete('/api/projects/proj-a/remote');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    // local state is still cleared so UI reflects reality
    expect(getUploadedState('proj-a')).toBeNull();
  });

  it('maps Phoenix 401 to UNAUTHORIZED', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a-slug',
      projectId: 42,
      uploadedSessions: [],
    });
    fetchMock.mockResolvedValueOnce({ status: 401, ok: false });

    const res = await request(makeApp()).delete('/api/projects/proj-a/remote');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    // Local state preserved — auth failures don't mean remote is gone.
    expect(getUploadedState('proj-a')).not.toBeNull();
  });

  it('maps Phoenix 5xx to 502 and preserves local state', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a-slug',
      projectId: 42,
      uploadedSessions: [],
    });
    fetchMock.mockResolvedValueOnce({ status: 503, ok: false });

    const res = await request(makeApp()).delete('/api/projects/proj-a/remote');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DELETE_FAILED');
    expect(getUploadedState('proj-a')).not.toBeNull();
  });

  it('maps fetch throw (network error) to 502 DELETE_FAILED', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a-slug',
      projectId: 42,
      uploadedSessions: [],
    });
    fetchMock.mockRejectedValueOnce(new Error('network unreachable'));

    const res = await request(makeApp()).delete('/api/projects/proj-a/remote');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DELETE_FAILED');
    expect(res.body.error.message).toContain('network unreachable');
  });
});

// ── DELETE /api/projects/:project/sessions/:sessionId/remote ─

describe('DELETE /api/projects/:project/sessions/:sessionId/remote', () => {
  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(getAuthToken).mockReturnValueOnce(null);
    const res = await request(makeApp()).delete('/api/projects/proj-a/sessions/sess-1/remote');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DELETEs Phoenix session and removes sessionId from local uploadedSessions on 204', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a-slug',
      projectId: 42,
      uploadedSessions: ['sess-1', 'sess-2'],
    });
    saveEnhancedData('sess-1', {
      title: 'One', developerTake: '', context: '',
      skills: [], questions: [], executionSteps: [],
      uploaded: true,
    });

    fetchMock.mockResolvedValueOnce({ status: 204, ok: true });

    const res = await request(makeApp())
      .delete('/api/projects/proj-a/sessions/sess-1/remote');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://heyiam.test/api/sessions/sess-1');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer test-token-abc');

    // Project shell preserved, sess-1 removed from upload set.
    const state = getUploadedState('proj-a');
    expect(state).not.toBeNull();
    expect(state!.uploadedSessions).toEqual(['sess-2']);
    expect(loadEnhancedData('sess-1')?.uploaded).toBe(false);
  });

  it('preserves project shell even when deleting the last session', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a-slug',
      projectId: 42,
      uploadedSessions: ['sess-1'],
    });
    fetchMock.mockResolvedValueOnce({ status: 204, ok: true });

    const res = await request(makeApp())
      .delete('/api/projects/proj-a/sessions/sess-1/remote');
    expect(res.status).toBe(200);

    const state = getUploadedState('proj-a');
    expect(state).not.toBeNull();
    expect(state!.uploadedSessions).toEqual([]);
    expect(state!.slug).toBe('proj-a-slug');
  });

  it('maps Phoenix 404 to structured NOT_FOUND', async () => {
    fetchMock.mockResolvedValueOnce({ status: 404, ok: false });
    const res = await request(makeApp())
      .delete('/api/projects/proj-a/sessions/nope/remote');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('maps Phoenix 5xx to 502', async () => {
    fetchMock.mockResolvedValueOnce({ status: 500, ok: false });
    const res = await request(makeApp())
      .delete('/api/projects/proj-a/sessions/sess-1/remote');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DELETE_FAILED');
  });
});
