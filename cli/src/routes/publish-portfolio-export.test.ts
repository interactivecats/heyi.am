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

const generatePortfolioSiteMock = vi.fn(async (_data, _projects, outputDir) => ({
  files: [`${outputDir}/index.html`, `${outputDir}/projects/a/index.html`],
  totalBytes: 1234,
  outputPath: outputDir,
}));

const safePortfolioExportPathMock = vi.fn((p: string) => {
  if (p.includes('..')) {
    const err = new Error('Output path must not contain .. segments') as Error & { code: string };
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
  if (!p.startsWith('/')) {
    const err = new Error('Output path must be absolute') as Error & { code: string };
    err.code = 'NOT_ABSOLUTE';
    throw err;
  }
  return p;
});

vi.mock('../export.js', () => ({
  generatePortfolioHtmlFragment: vi.fn(() => '<section/>'),
  generatePortfolioSite: (...args: unknown[]) => generatePortfolioSiteMock(...(args as Parameters<typeof generatePortfolioSiteMock>)),
  safePortfolioExportPath: (p: string) => safePortfolioExportPathMock(p),
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

// buildProjectDetail reads the DB; stub it out wholesale.
vi.mock('./context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./context.js')>();
  return {
    ...actual,
    buildProjectDetail: vi.fn(() => ({
      project: { totalFiles: 3, totalAgentDuration: 0 },
      sessions: [],
      enhanceCache: null,
    })),
  };
});

// Mock the file-manager opener so tests don't try to spawn `open`.
const openInFileManagerMock = vi.fn(() => true);
vi.mock('./open-in-file-manager.js', () => ({
  openInFileManager: (p: string) => openInFileManagerMock(p),
}));

let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;

import { createPublishRouter } from './publish.js';
import type { RouteContext } from './context.js';
import { getAuthToken } from '../auth.js';

function makeApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const ctx = {
    db: {} as RouteContext['db'],
    sessionsBasePath: '/tmp',
    getProjects: vi.fn().mockResolvedValue([
      { dirName: 'proj-a', name: 'Proj A', sessionCount: 1, sessions: [] },
    ]),
    getProjectWithStats: vi.fn().mockResolvedValue({
      name: 'Proj A',
      totalDuration: 10,
      totalLoc: 100,
      sessionCount: 1,
      totalFiles: 3,
    }),
    loadSession: vi.fn(),
    getSessionStats: vi.fn(),
    buildPreviewPage: vi.fn(),
  } as unknown as RouteContext;
  app.use(createPublishRouter(ctx));
  return app;
}

describe('POST /api/portfolio/export', () => {
  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'heyiam-export-route-'));
    process.env.HEYIAM_DATA_DIR = configDir;
    process.env.HEYIAM_CONFIG_DIR = configDir;
    generatePortfolioSiteMock.mockClear();
    safePortfolioExportPathMock.mockClear();
    openInFileManagerMock.mockClear();
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
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({ targetPath: '/tmp/portfolio-out' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(generatePortfolioSiteMock).not.toHaveBeenCalled();
  });

  it('returns 400 when targetPath is missing', async () => {
    const res = await request(makeApp()).post('/api/portfolio/export').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_PATH');
    expect(generatePortfolioSiteMock).not.toHaveBeenCalled();
  });

  it('returns 400 when targetPath is not a string', async () => {
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({ targetPath: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_PATH');
  });

  it('rejects path traversal with 400', async () => {
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({ targetPath: '../../../etc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PATH_TRAVERSAL');
    expect(generatePortfolioSiteMock).not.toHaveBeenCalled();
  });

  it('happy path: generates site, opens file manager, returns 200', async () => {
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({ targetPath: '/tmp/portfolio-out' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.path).toBe('/tmp/portfolio-out');
    expect(res.body.fileCount).toBe(2);
    expect(res.body.openedInFileManager).toBe(true);

    expect(generatePortfolioSiteMock).toHaveBeenCalledTimes(1);
    const [renderData, projects, outDir, template] = generatePortfolioSiteMock.mock.calls[0];
    expect(outDir).toBe('/tmp/portfolio-out');
    expect(template).toBeDefined();
    expect((renderData as { user: { username: string } }).user.username).toBe('testuser');
    expect(Array.isArray(projects)).toBe(true);

    expect(openInFileManagerMock).toHaveBeenCalledWith('/tmp/portfolio-out');
  });

  it('reports openedInFileManager:false when the opener returns false', async () => {
    openInFileManagerMock.mockReturnValueOnce(false);
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({ targetPath: '/tmp/portfolio-out' });
    expect(res.status).toBe(200);
    expect(res.body.openedInFileManager).toBe(false);
  });

  it('returns 500 when generatePortfolioSite throws', async () => {
    generatePortfolioSiteMock.mockRejectedValueOnce(new Error('disk full'));
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({ targetPath: '/tmp/portfolio-out' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PORTFOLIO_EXPORT_FAILED');
    expect(res.body.error.message).toBe('disk full');
  });
});
