import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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

// Mock generatePortfolioSite to write a couple of real files into the
// supplied output directory so the route can read them back, zip them,
// and stream the zip in the response.
const generatePortfolioSiteMock = vi.fn(async (_data: unknown, _projects: unknown, outputDir: string, _template?: string) => {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'projects', 'a'), { recursive: true });
  writeFileSync(join(outputDir, 'index.html'), '<html>landing</html>');
  writeFileSync(join(outputDir, 'projects', 'a', 'index.html'), '<html>project a</html>');
  return {
    files: [
      join(outputDir, 'index.html'),
      join(outputDir, 'projects', 'a', 'index.html'),
    ],
    totalBytes: 1234,
    outputPath: outputDir,
  };
});

// Re-export every other symbol from the real export module so the route
// keeps using the actual createZipBuffer / generatePortfolioHtmlFragment.
vi.mock('../export.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../export.js')>();
  return {
    ...actual,
    generatePortfolioHtmlFragment: vi.fn(() => '<section/>'),
    generatePortfolioSite: (...args: unknown[]) =>
      generatePortfolioSiteMock(...(args as Parameters<typeof generatePortfolioSiteMock>)),
  };
});

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
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(generatePortfolioSiteMock).not.toHaveBeenCalled();
  });

  it('happy path: returns a zip attachment', async () => {
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({})
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="portfolio-testuser-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    expect(Buffer.isBuffer(res.body)).toBe(true);
    // ZIP file magic: "PK\x03\x04"
    expect((res.body as Buffer).slice(0, 4).toString('hex')).toBe('504b0304');
    expect(generatePortfolioSiteMock).toHaveBeenCalledTimes(1);
  });

  it('does not require a body and ignores any provided fields', async () => {
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({ targetPath: '/anywhere' });
    // The route ignores targetPath now — should still 200.
    expect(res.status).toBe(200);
  });

  it('returns 500 when generatePortfolioSite throws', async () => {
    generatePortfolioSiteMock.mockRejectedValueOnce(new Error('disk full'));
    const res = await request(makeApp())
      .post('/api/portfolio/export')
      .send({});
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PORTFOLIO_EXPORT_FAILED');
    expect(res.body.error.message).toBe('disk full');
  });
});
