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

const generatePortfolioHtmlFragment = vi.fn(() => '<section>portfolio-fragment</section>');
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

// Use a real temp configDir for settings so round-trip persistence works.
let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;

// ── Test fetch ───────────────────────────────────────────────

const fetchMock = vi.fn();
// @ts-expect-error override global fetch
globalThis.fetch = fetchMock;

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

  it('renders fragment, POSTs to Phoenix with Bearer auth, persists state on success', async () => {
    savePortfolioProfile({ displayName: 'Ada', bio: 'hello' }, configDir);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, username: 'testuser' }),
    });

    const res = await request(makeApp()).post('/api/portfolio/upload').send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toBe('https://heyiam.test/testuser');
    expect(res.body.hash).toMatch(/^[0-9a-f]{16}$/);

    // Fragment was generated.
    expect(generatePortfolioHtmlFragment).toHaveBeenCalledTimes(1);

    // Phoenix call shape.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://heyiam.test/api/portfolio/upload');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token-abc');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.html).toBe('<section>portfolio-fragment</section>');
    expect(body.profile).toBeDefined();
    expect(body.profile.displayName).toBe('Ada');

    // State persisted.
    const state = getPortfolioPublishState(configDir);
    const target = state.targets[DEFAULT_PORTFOLIO_TARGET];
    expect(target).toBeDefined();
    expect(target.lastPublishedProfile.displayName).toBe('Ada');
    expect(target.lastPublishedProfileHash).toBe(res.body.hash);
    expect(target.url).toBe('https://heyiam.test/testuser');
    expect(target.lastError).toBeUndefined();
  });

  it('persists lastError on Phoenix failure and returns structured error', async () => {
    savePortfolioProfile({ displayName: 'Ada' }, configDir);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'html sanitized to empty' } }),
    });

    const res = await request(makeApp()).post('/api/portfolio/upload').send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PORTFOLIO_UPLOAD_FAILED');
    expect(res.body.error.message).toBe('html sanitized to empty');

    const state = getPortfolioPublishState(configDir);
    const target = state.targets[DEFAULT_PORTFOLIO_TARGET];
    expect(target.lastError).toBe('html sanitized to empty');
    expect(target.lastErrorAt).toBeDefined();
    // no successful publish → no publishedAt/hash
    expect(target.lastPublishedAt).toBe('');
  });

  it('maps Phoenix 5xx to 502 gateway error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => null,
    });

    const res = await request(makeApp()).post('/api/portfolio/upload').send({});
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PORTFOLIO_UPLOAD_FAILED');
  });
});
