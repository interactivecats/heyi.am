import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---- Mocks (mirror the structure of preview.test.ts) ----------------------
vi.mock('../auth.js', () => ({
  getAuthToken: () => ({ username: 'testuser', token: 'tok' }),
}));

vi.mock('../settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settings.js')>();
  return {
    ...actual,
    loadEnhancedData: () => null,
    loadProjectEnhanceResult: vi.fn().mockReturnValue(null),
    getDefaultTemplate: vi.fn().mockReturnValue('editorial'),
    getPortfolioProfile: vi.fn().mockReturnValue({ displayName: 'Ada' }),
    savePortfolioProfile: vi.fn(),
    setDefaultTemplate: vi.fn(),
    getSettings: vi.fn().mockReturnValue({}),
    getAnthropicApiKey: vi.fn().mockReturnValue(null),
    saveAnthropicApiKey: vi.fn(),
    clearAnthropicApiKey: vi.fn(),
  };
});

vi.mock('../screenshot.js', () => ({
  SCREENSHOTS_DIR: '/tmp/heyiam-test-screenshots',
}));

vi.mock('../render/index.js', () => ({
  renderProjectHtml: vi.fn().mockReturnValue('<div>rendered project</div>'),
  renderSessionHtml: vi.fn().mockReturnValue('<div>rendered session</div>'),
  renderPortfolioHtml: vi.fn().mockReturnValue('<div>rendered portfolio</div>'),
}));

vi.mock('../render/templates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/templates.js')>();
  return {
    ...actual,
    getTemplateCss: vi.fn().mockReturnValue('body{}'),
    isValidTemplate: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../render/build-render-data.js', () => ({
  buildProjectRenderData: vi.fn().mockReturnValue({ project: { slug: 'test' } }),
  buildSessionCard: vi.fn().mockReturnValue({ id: 'card-1' }),
  buildSessionRenderData: vi.fn().mockReturnValue({ session: {} }),
}));

vi.mock('../sync.js', () => ({
  displayNameFromDir: (dir: string) => dir,
}));

vi.mock('../db.js', () => ({
  getSessionsByProject: vi.fn().mockReturnValue([]),
  getProjectUuid: vi.fn().mockReturnValue('test-uuid'),
  getFileCountWithChildren: vi.fn().mockReturnValue(0),
}));

import {
  createPreviewRouter,
  invalidatePortfolioPreviewCache,
  _getPortfolioPreviewCacheEntry,
} from './preview.js';
import { createSettingsRouter } from './settings.js';
import { renderPortfolioHtml } from '../render/index.js';
import type { RouteContext } from './context.js';

function makeCtx(): RouteContext {
  return {
    db: {} as RouteContext['db'],
    sessionsBasePath: '/tmp',
    getProjects: vi.fn().mockResolvedValue([
      { name: 'my-project', dirName: 'my-project', sessionCount: 0, sessions: [] },
    ]),
    loadSession: vi.fn(),
    getSessionStats: vi.fn(),
    mergeSessionIntervals: vi.fn().mockReturnValue(0),
    getProjectWithStats: vi.fn().mockResolvedValue({
      name: 'my-project',
      dirName: 'my-project',
      sessionCount: 0,
      totalLoc: 0,
      totalDuration: 0,
      totalAgentDuration: 0,
      totalFiles: 0,
    }),
    buildPreviewPage: vi.fn((_t, body) => `<html>${body}</html>`),
  } as unknown as RouteContext;
}

function makeApp(ctx?: RouteContext): express.Express {
  const app = express();
  app.use(express.json());
  app.use(createPreviewRouter(ctx ?? makeCtx()));
  app.use(createSettingsRouter(ctx ?? makeCtx()));
  return app;
}

describe('GET /preview/portfolio cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePortfolioPreviewCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves the second hit within TTL from cache (render runs once)', async () => {
    const app = makeApp();
    const r1 = await request(app).get('/preview/portfolio');
    const r2 = await request(app).get('/preview/portfolio');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.text).toBe(r2.text);
    expect(renderPortfolioHtml).toHaveBeenCalledTimes(1);
  });

  it('re-renders after TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T00:00:00Z'));
    const app = makeApp();

    await request(app).get('/preview/portfolio');
    expect(renderPortfolioHtml).toHaveBeenCalledTimes(1);

    // Advance past 30s TTL
    vi.setSystemTime(new Date('2026-04-07T00:00:31Z'));
    await request(app).get('/preview/portfolio');
    expect(renderPortfolioHtml).toHaveBeenCalledTimes(2);
  });

  it('caches HTML with expiresAt ~30s ahead', async () => {
    const before = Date.now();
    await request(makeApp()).get('/preview/portfolio');
    const entry = _getPortfolioPreviewCacheEntry();
    expect(entry).toBeDefined();
    expect(entry!.expiresAt).toBeGreaterThanOrEqual(before + 29_000);
    expect(entry!.expiresAt).toBeLessThanOrEqual(before + 31_000);
  });

  it('POST /api/portfolio invalidates cache', async () => {
    const app = makeApp();
    await request(app).get('/preview/portfolio');
    expect(_getPortfolioPreviewCacheEntry()).toBeDefined();

    const res = await request(app)
      .post('/api/portfolio')
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(200);
    expect(_getPortfolioPreviewCacheEntry()).toBeUndefined();

    await request(app).get('/preview/portfolio');
    expect(renderPortfolioHtml).toHaveBeenCalledTimes(2);
  });

  it('POST /api/settings/theme invalidates cache', async () => {
    const app = makeApp();
    await request(app).get('/preview/portfolio');
    expect(_getPortfolioPreviewCacheEntry()).toBeDefined();

    const res = await request(app)
      .post('/api/settings/theme')
      .send({ template: 'editorial' });
    expect(res.status).toBe(200);
    expect(_getPortfolioPreviewCacheEntry()).toBeUndefined();
  });

  it('invalidatePortfolioPreviewCache() clears cache directly (publish/enhance hook)', async () => {
    const app = makeApp();
    await request(app).get('/preview/portfolio');
    expect(_getPortfolioPreviewCacheEntry()).toBeDefined();

    // This is the exact function wired into POST /api/portfolio/upload,
    // POST /api/projects/:project/enhance-save, screenshot capture, and
    // screenshot delete. Simulate any of those firing.
    invalidatePortfolioPreviewCache();
    expect(_getPortfolioPreviewCacheEntry()).toBeUndefined();

    await request(app).get('/preview/portfolio');
    expect(renderPortfolioHtml).toHaveBeenCalledTimes(2);
  });
});
