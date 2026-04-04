import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock external dependencies before importing the module under test
vi.mock('../auth.js', () => ({
  getAuthToken: () => ({ username: 'testuser' }),
}));

vi.mock('../settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settings.js')>();
  return {
    ...actual,
    loadEnhancedData: () => null,
    loadProjectEnhanceResult: vi.fn().mockReturnValue(null),
    getDefaultTemplate: vi.fn().mockReturnValue(undefined),
    getPortfolioProfile: vi.fn().mockReturnValue({}),
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
    getTemplateCss: vi.fn().mockReturnValue('body { color: red; }'),
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

import { createPreviewRouter, clearPreviewCache } from './preview.js';
import type { RouteContext } from './context.js';
import { getDefaultTemplate, loadProjectEnhanceResult, getPortfolioProfile } from '../settings.js';
import { renderProjectHtml, renderPortfolioHtml } from '../render/index.js';
import { getTemplateCss } from '../render/templates.js';

function makeCtx(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    db: {} as RouteContext['db'],
    sessionsBasePath: '/tmp',
    getProjects: vi.fn().mockResolvedValue([
      {
        name: 'my-project',
        dirName: 'my-project',
        sessionCount: 0,
        sessions: [],
      },
    ]),
    loadSession: vi.fn().mockResolvedValue({
      title: 'Test Session',
      source: 'claude',
      durationMinutes: 30,
      date: '2026-03-01',
      skills: [],
    }),
    getSessionStats: vi.fn().mockResolvedValue({ duration: 10, loc: 50 }),
    mergeSessionIntervals: vi.fn().mockReturnValue(0),
    getProjectWithStats: vi.fn().mockResolvedValue({
      name: 'my-project',
      dirName: 'my-project',
      sessionCount: 0,
      totalLoc: 100,
      totalDuration: 60,
      totalAgentDuration: 10,
      totalFiles: 5,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
    }),
    buildPreviewPage: vi.fn().mockReturnValue('<html>preview</html>'),
    ...overrides,
  } as unknown as RouteContext;
}

function makeApp(ctx?: RouteContext): express.Express {
  const app = express();
  app.use(createPreviewRouter(ctx ?? makeCtx()));
  return app;
}

describe('GET /api/projects/:project/render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreviewCache();
  });

  it('returns 404 JSON when project is not found', async () => {
    const ctx = makeCtx({
      getProjects: vi.fn().mockResolvedValue([]),
    });
    const app = makeApp(ctx);

    const res = await request(app).get('/api/projects/nonexistent/render');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });

  it('returns rendered HTML, CSS, and template name as JSON', async () => {
    const app = makeApp();

    const res = await request(app).get('/api/projects/my-project/render');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      html: '<div>rendered project</div>',
      css: 'body { color: red; }',
      template: 'editorial',
      accent: '#084471',
      mode: 'light',
    });
  });

  it('uses user default template when set', async () => {
    vi.mocked(getDefaultTemplate).mockReturnValue('kinetic');
    const app = makeApp();

    const res = await request(app).get('/api/projects/my-project/render');
    expect(res.status).toBe(200);
    expect(res.body.template).toBe('kinetic');
    expect(renderProjectHtml).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'kinetic',
    );
    expect(getTemplateCss).toHaveBeenCalledWith('kinetic');
  });

  it('falls back to editorial when no default template is set', async () => {
    vi.mocked(getDefaultTemplate).mockReturnValue(undefined);
    const app = makeApp();

    const res = await request(app).get('/api/projects/my-project/render');
    expect(res.body.template).toBe('editorial');
  });

  it('passes arc from enhance result to renderProjectHtml', async () => {
    const arc = [{ phase: 1, title: 'Setup', description: 'Initial setup' }];
    vi.mocked(loadProjectEnhanceResult).mockReturnValue({
      fingerprint: 'abc',
      enhancedAt: '2026-03-01',
      selectedSessionIds: [],
      result: {
        narrative: 'A narrative',
        arc,
        skills: ['typescript'],
        timeline: [],
        questions: [],
      },
    });
    const app = makeApp();

    await request(app).get('/api/projects/my-project/render');
    expect(renderProjectHtml).toHaveBeenCalledWith(
      expect.anything(),
      { arc },
      'editorial',
    );
  });

  it('returns 500 JSON on unexpected errors', async () => {
    const ctx = makeCtx({
      getProjects: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    });
    const app = makeApp(ctx);

    const res = await request(app).get('/api/projects/my-project/render');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Render failed' });
  });
});

describe('GET /preview/project/:project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreviewCache();
  });

  it('returns 404 when project is not found', async () => {
    const ctx = makeCtx({
      getProjects: vi.fn().mockResolvedValue([]),
    });
    const app = makeApp(ctx);

    const res = await request(app).get('/preview/project/nonexistent');
    expect(res.status).toBe(404);
    expect(res.text).toBe('Project not found');
  });

  it('returns full HTML preview page', async () => {
    const app = makeApp();

    const res = await request(app).get('/preview/project/my-project');
    expect(res.status).toBe(200);
    expect(res.text).toBe('<html>preview</html>');
  });

  it('uses ?template= override when valid', async () => {
    const app = makeApp();

    const res = await request(app).get('/preview/project/my-project?template=kinetic');
    expect(res.status).toBe(200);
    expect(renderProjectHtml).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'kinetic',
    );
  });

  it('ignores invalid ?template= and falls back to default', async () => {
    vi.mocked(getDefaultTemplate).mockReturnValue('terminal');
    const app = makeApp();

    const res = await request(app).get('/preview/project/my-project?template=nonexistent');
    expect(res.status).toBe(200);
    expect(renderProjectHtml).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'terminal',
    );
  });
});

describe('GET /api/projects/:project/render with ?template=', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreviewCache();
  });

  it('uses ?template= override when valid', async () => {
    const app = makeApp();

    const res = await request(app).get('/api/projects/my-project/render?template=kinetic');
    expect(res.status).toBe(200);
    expect(res.body.template).toBe('kinetic');
    expect(renderProjectHtml).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'kinetic',
    );
    expect(getTemplateCss).toHaveBeenCalledWith('kinetic');
  });

  it('ignores invalid ?template= and falls back to user default', async () => {
    vi.mocked(getDefaultTemplate).mockReturnValue('terminal');
    const app = makeApp();

    const res = await request(app).get('/api/projects/my-project/render?template=bogus');
    expect(res.status).toBe(200);
    expect(res.body.template).toBe('terminal');
  });

  it('?template= takes precedence over user default', async () => {
    vi.mocked(getDefaultTemplate).mockReturnValue('terminal');
    const app = makeApp();

    const res = await request(app).get('/api/projects/my-project/render?template=showcase');
    expect(res.status).toBe(200);
    expect(res.body.template).toBe('showcase');
  });
});

describe('GET /api/projects/:project/render — session links use SPA routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreviewCache();
  });

  it('overrides sessionBaseUrl to /session for SPA routing', async () => {
    const app = makeApp();

    await request(app).get('/api/projects/my-project/render');
    // renderProjectHtml should be called with renderData that has sessionBaseUrl = '/session'
    expect(renderProjectHtml).toHaveBeenCalledWith(
      expect.objectContaining({ sessionBaseUrl: '/session' }),
      expect.anything(),
      expect.any(String),
    );
  });
});

describe('GET /preview/portfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreviewCache();
  });

  it('uses real project data with empty profile fields when nothing is filled out', async () => {
    vi.mocked(getPortfolioProfile).mockReturnValue({});
    const app = makeApp();

    const res = await request(app).get('/preview/portfolio');
    expect(res.status).toBe(200);
    expect(renderPortfolioHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ displayName: '', bio: '', location: '', photoUrl: undefined }),
        projects: expect.any(Array),
      }),
      expect.any(String),
    );
  });

  it('uses profile fields when provided', async () => {
    vi.mocked(getPortfolioProfile).mockReturnValue({
      displayName: 'Test User',
      bio: 'A developer',
      location: 'NYC',
    });
    const app = makeApp();

    const res = await request(app).get('/preview/portfolio');
    expect(res.status).toBe(200);
    expect(renderPortfolioHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ displayName: 'Test User', bio: 'A developer', location: 'NYC' }),
      }),
      expect.any(String),
    );
  });

  it('handles partial profile (name but no photo/bio)', async () => {
    vi.mocked(getPortfolioProfile).mockReturnValue({
      displayName: 'Jane',
    });
    const app = makeApp();

    const res = await request(app).get('/preview/portfolio');
    expect(res.status).toBe(200);
    expect(renderPortfolioHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          displayName: 'Jane',
          bio: '',
          location: '',
          photoUrl: undefined,
        }),
      }),
      expect.any(String),
    );
  });

  it('returns 500 on unexpected errors', async () => {
    const ctx = makeCtx({
      getProjects: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const app = makeApp(ctx);

    const res = await request(app).get('/preview/portfolio');
    expect(res.status).toBe(500);
    expect(res.text).toBe('Portfolio preview failed');
  });
});
