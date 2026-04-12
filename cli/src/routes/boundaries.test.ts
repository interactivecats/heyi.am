import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock storage
let projectCache: Record<string, unknown> | null = null;

vi.mock('../settings.js', () => ({
  loadProjectEnhanceResult: vi.fn(() => projectCache),
  saveProjectEnhanceResult: vi.fn((_dir: string, ids: string[], result: unknown, _cfg?: unknown, extras?: Record<string, unknown>) => {
    projectCache = { selectedSessionIds: [...ids].sort(), result, ...(extras ?? {}), fingerprint: 'fp', enhancedAt: new Date().toISOString() };
  }),
  getUploadedState: vi.fn(() => null),
}));

vi.mock('./preview.js', () => ({
  invalidatePortfolioPreviewCache: vi.fn(),
}));

const mockSessions = [
  { sessionId: 'a1', path: '/a1', source: 'claude', isSubagent: false },
  { sessionId: 'a2', path: '/a2', source: 'claude', isSubagent: false },
  { sessionId: 'a3', path: '/a3', source: 'claude', isSubagent: false },
  { sessionId: 'child1', path: '/c1', source: 'claude', isSubagent: true, parentSessionId: 'a1' },
];

vi.mock('./context.js', () => ({
  requireProject: vi.fn(async (_ctx: unknown, _proj: unknown, _res: unknown) => ({
    name: 'test-proj',
    dirName: '-Users-test-Dev-proj',
    sessions: mockSessions,
  })),
  buildSessionList: vi.fn(async () => []),
  buildProjectDetail: vi.fn(async () => ({})),
}));

vi.mock('../bridge.js', () => ({}));

import { createProjectsRouter } from './projects.js';

const ctx = {
  getProjects: vi.fn(async () => []),
  getProjectWithStats: vi.fn(async (p: unknown) => p),
  getSessionStats: vi.fn(),
  loadSession: vi.fn(),
} as unknown as Parameters<typeof createProjectsRouter>[0];

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(createProjectsRouter(ctx));
  return app;
}

describe('GET /api/projects/:project/boundaries', () => {
  beforeEach(() => {
    projectCache = null;
  });

  it('returns empty selectedSessionIds when no cache', async () => {
    const app = createApp();
    const res = await request(app).get('/api/projects/test-proj/boundaries');
    expect(res.status).toBe(200);
    expect(res.body.selectedSessionIds).toEqual([]);
    // allSessionIds should exclude subagents
    expect(res.body.allSessionIds).toEqual(['a1', 'a2', 'a3']);
  });

  it('returns selectedSessionIds from cache', async () => {
    projectCache = {
      selectedSessionIds: ['a1', 'a2'],
      result: { narrative: '', arc: [], skills: [], timeline: [], questions: [] },
      fingerprint: 'fp',
      enhancedAt: '2026-01-01',
    };
    const app = createApp();
    const res = await request(app).get('/api/projects/test-proj/boundaries');
    expect(res.status).toBe(200);
    expect(res.body.selectedSessionIds).toEqual(['a1', 'a2']);
    expect(res.body.allSessionIds).toEqual(['a1', 'a2', 'a3']);
  });
});

describe('PUT /api/projects/:project/boundaries', () => {
  beforeEach(() => {
    projectCache = {
      selectedSessionIds: ['a1'],
      result: { narrative: 'test', arc: [], skills: [], timeline: [], questions: [] },
      fingerprint: 'fp',
      enhancedAt: '2026-01-01',
      title: 'Test Project',
    };
  });

  it('updates selectedSessionIds', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/projects/test-proj/boundaries')
      .send({ selectedSessionIds: ['a1', 'a2', 'a3'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.selectedSessionIds).toEqual(['a1', 'a2', 'a3']);
  });

  it('rejects empty array', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/projects/test-proj/boundaries')
      .send({ selectedSessionIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects invalid session IDs', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/projects/test-proj/boundaries')
      .send({ selectedSessionIds: ['a1', 'nonexistent'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SESSION_IDS');
  });

  it('rejects when no enhance cache exists', async () => {
    projectCache = null;
    const app = createApp();
    const res = await request(app)
      .put('/api/projects/test-proj/boundaries')
      .send({ selectedSessionIds: ['a1'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_CACHE');
  });
});
