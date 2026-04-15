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

const generatePortfolioHtmlFragment = vi.fn((..._args: unknown[]) => '<section>portfolio-fragment</section>');
vi.mock('../export.js', () => ({
  generatePortfolioHtmlFragment: (...args: unknown[]) => generatePortfolioHtmlFragment(...args),
}));

vi.mock('../render/index.js', () => ({
  renderProjectHtml: vi.fn(() => '<div/>'),
  renderSessionHtml: vi.fn(() => '<div/>'),
  renderPortfolioHtml: vi.fn(() => '<div/>'),
}));

vi.mock('../render/build-render-data.js', () => ({
  buildProjectRenderData: vi.fn(() => ({})),
  buildSessionCard: vi.fn(() => ({})),
  buildSessionRenderData: vi.fn(() => ({})),
}));

vi.mock('../db.js', () => ({
  getSessionsByProject: vi.fn(() => []),
  getProjectUuid: vi.fn(() => 'uuid'),
  getFileCountWithChildren: vi.fn(() => 0),
}));

vi.mock('../screenshot.js', () => ({
  captureScreenshot: vi.fn(),
  SCREENSHOTS_DIR: '/tmp/screens',
}));

vi.mock('../redact.js', () => ({
  redactSession: (x: unknown) => x,
  redactText: (x: string) => x,
  scanTextSync: () => [],
  formatFindings: () => '',
  stripHomePathsInText: (x: string) => x,
}));

vi.mock('../sync.js', () => ({
  displayNameFromDir: (d: string) => d,
}));

let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;

// ── Test fetch ───────────────────────────────────────────────

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

import { createPublishRouter } from './publish.js';
import type { RouteContext } from './context.js';
import {
  getPortfolioPublishState,
  savePortfolioProfile,
  DEFAULT_PORTFOLIO_TARGET,
} from '../settings.js';
import { getAuthToken } from '../auth.js';

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
  app.use(createPublishRouter(ctx));
  return app;
}

/** Parse SSE text body into an array of JSON event objects. */
function parseSSE(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('POST /api/portfolio/upload', () => {
  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'heyiam-pub-route-'));
    process.env.HEYIAM_DATA_DIR = configDir;
    process.env.HEYIAM_CONFIG_DIR = configDir;
    fetchMock.mockReset();
    generatePortfolioHtmlFragment.mockClear();
    vi.mocked(getAuthToken).mockReturnValue({ username: 'testuser', token: 'test-token-abc' } as ReturnType<typeof getAuthToken>);
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    if (originalDataDir) process.env.HEYIAM_DATA_DIR = originalDataDir;
    else delete process.env.HEYIAM_DATA_DIR;
    delete process.env.HEYIAM_CONFIG_DIR;
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(getAuthToken).mockReturnValueOnce(null);
    const res = await request(makeApp()).post('/api/portfolio/upload').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams SSE progress events and persists state on success', async () => {
    savePortfolioProfile({ displayName: 'Ada', bio: 'hello' }, configDir);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, username: 'testuser' }),
    });

    const res = await request(makeApp())
      .post('/api/portfolio/upload')
      .send({})
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);
    const events = parseSSE(res.body as string);

    const progressMsgs = events.filter((e) => e.type === 'progress');
    expect(progressMsgs.length).toBeGreaterThan(0);

    const doneEvent = events.find((e) => e.type === 'done') as Record<string, unknown>;
    expect(doneEvent).toBeDefined();
    expect(doneEvent.ok).toBe(true);
    expect(doneEvent.url).toBe('https://heyi.test/testuser');
    expect(doneEvent.hash).toMatch(/^[0-9a-f]{16}$/);

    expect(generatePortfolioHtmlFragment).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://heyiam.test/api/portfolio/upload');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token-abc');

    const state = getPortfolioPublishState(configDir);
    const target = state.targets[DEFAULT_PORTFOLIO_TARGET];
    expect(target).toBeDefined();
    expect(target.lastPublishedProfile.displayName).toBe('Ada');
    expect(target.url).toBe('https://heyi.test/testuser');
    expect(target.lastError).toBeUndefined();
  });

  it('streams error event on Phoenix failure and persists lastError', async () => {
    savePortfolioProfile({ displayName: 'Ada' }, configDir);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'html sanitized to empty' } }),
    });

    const res = await request(makeApp())
      .post('/api/portfolio/upload')
      .send({})
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);
    const events = parseSSE(res.body as string);
    const errEvent = events.find((e) => e.type === 'error') as Record<string, unknown>;
    expect(errEvent).toBeDefined();
    expect(errEvent.message).toBe('html sanitized to empty');

    const state = getPortfolioPublishState(configDir);
    const target = state.targets[DEFAULT_PORTFOLIO_TARGET];
    expect(target.lastError).toBe('html sanitized to empty');
    expect(target.lastPublishedAt).toBe('');
  });

  it('GET /api/portfolio/state returns empty state by default', async () => {
    const res = await request(makeApp()).get('/api/portfolio/state');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ targets: {} });
  });

  it('GET /api/portfolio/state requires auth', async () => {
    vi.mocked(getAuthToken).mockReturnValueOnce(null);
    const res = await request(makeApp()).get('/api/portfolio/state');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/portfolio/state returns persisted state after a successful publish', async () => {
    savePortfolioProfile({ displayName: 'Ada' }, configDir);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, username: 'testuser' }),
    });
    await request(makeApp())
      .post('/api/portfolio/upload')
      .send({})
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    const res = await request(makeApp()).get('/api/portfolio/state');
    expect(res.status).toBe(200);
    const target = res.body.targets[DEFAULT_PORTFOLIO_TARGET];
    expect(target).toBeDefined();
    expect(target.lastPublishedProfile.displayName).toBe('Ada');
    expect(target.visibility).toBe('public');
  });
});
