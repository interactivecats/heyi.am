import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock storage for enhanced data
const enhancedStore: Record<string, unknown> = {};

vi.mock('../settings.js', () => ({
  loadEnhancedData: vi.fn((id: string) => enhancedStore[id] ?? null),
  saveEnhancedData: vi.fn((id: string, data: Record<string, unknown>) => {
    enhancedStore[id] = { ...data, enhancedAt: new Date().toISOString(), quickEnhanced: data.quickEnhanced ?? false };
  }),
  deleteEnhancedData: vi.fn((id: string) => { delete enhancedStore[id]; }),
  getAnthropicApiKey: vi.fn(() => 'sk-test'),
  loadFreshProjectEnhanceResult: vi.fn(() => null),
  loadProjectEnhanceResult: vi.fn(() => null),
  saveProjectEnhanceResult: vi.fn(),
  buildProjectFingerprint: vi.fn(() => 'fp'),
  getUploadedState: vi.fn(() => null),
}));

vi.mock('../llm/index.js', () => ({
  getProvider: vi.fn(() => ({ name: 'test', enhance: vi.fn() })),
}));

vi.mock('./preview.js', () => ({
  invalidatePortfolioPreviewCache: vi.fn(),
}));

vi.mock('./context.js', () => ({
  requireProject: vi.fn(async (_ctx: unknown, _proj: unknown, _res: unknown) => ({
    name: 'test',
    dirName: 'test',
    sessions: [],
  })),
}));

vi.mock('./sse.js', () => ({
  startSSE: vi.fn(() => vi.fn()),
}));

import { createEnhanceRouter } from './enhance.js';

const ctx = {
  getProjects: vi.fn(async () => []),
  getProjectWithStats: vi.fn(),
  getSessionStats: vi.fn(),
  loadSession: vi.fn(),
} as unknown as Parameters<typeof createEnhanceRouter>[0];

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(createEnhanceRouter(ctx));
  return app;
}

describe('PATCH /api/sessions/:id/enhanced', () => {
  const sampleEnhanced = {
    title: 'Original title',
    developerTake: 'Original take',
    context: 'Some context',
    skills: ['TypeScript'],
    questions: [{ text: 'Q?', suggestedAnswer: 'A' }],
    executionSteps: [{ stepNumber: 1, title: 'Step 1', body: 'Did stuff' }],
    qaPairs: [{ question: 'Why?', answer: 'Because' }],
    enhancedAt: '2026-01-01T00:00:00Z',
    quickEnhanced: false,
  };

  beforeEach(() => {
    Object.keys(enhancedStore).forEach((k) => delete enhancedStore[k]);
  });

  it('returns 404 when no enhanced data exists', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/sessions/nonexistent/enhanced').send({ title: 'New' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('updates title only, preserves other fields', async () => {
    enhancedStore['s1'] = { ...sampleEnhanced };
    const app = createApp();
    const res = await request(app).patch('/api/sessions/s1/enhanced').send({ title: 'Updated title' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.enhancedAt).toBeDefined();
    // Verify the saved data
    const saved = enhancedStore['s1'] as Record<string, unknown>;
    expect(saved.title).toBe('Updated title');
    expect(saved.developerTake).toBe('Original take');
    expect(saved.skills).toEqual(['TypeScript']);
  });

  it('updates multiple fields at once', async () => {
    enhancedStore['s2'] = { ...sampleEnhanced };
    const app = createApp();
    const res = await request(app).patch('/api/sessions/s2/enhanced').send({
      title: 'New title',
      developerTake: 'New take',
      skills: ['React', 'Node'],
    });
    expect(res.status).toBe(200);
    const saved = enhancedStore['s2'] as Record<string, unknown>;
    expect(saved.title).toBe('New title');
    expect(saved.developerTake).toBe('New take');
    expect(saved.skills).toEqual(['React', 'Node']);
  });

  it('rejects title over 200 characters', async () => {
    enhancedStore['s3'] = { ...sampleEnhanced };
    const app = createApp();
    const res = await request(app).patch('/api/sessions/s3/enhanced').send({ title: 'x'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects empty title', async () => {
    enhancedStore['s4'] = { ...sampleEnhanced };
    const app = createApp();
    const res = await request(app).patch('/api/sessions/s4/enhanced').send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('rejects non-string skills', async () => {
    enhancedStore['s5'] = { ...sampleEnhanced };
    const app = createApp();
    const res = await request(app).patch('/api/sessions/s5/enhanced').send({ skills: [1, 2] });
    expect(res.status).toBe(400);
  });

  it('updates executionSteps', async () => {
    enhancedStore['s6'] = { ...sampleEnhanced };
    const app = createApp();
    const newSteps = [
      { stepNumber: 1, title: 'New step', body: 'New body' },
      { stepNumber: 2, title: 'Step 2', body: 'More' },
    ];
    const res = await request(app).patch('/api/sessions/s6/enhanced').send({ executionSteps: newSteps });
    expect(res.status).toBe(200);
    const saved = enhancedStore['s6'] as Record<string, unknown>;
    expect(saved.executionSteps).toEqual(newSteps);
  });

  it('updates qaPairs', async () => {
    enhancedStore['s7'] = { ...sampleEnhanced };
    const app = createApp();
    const newPairs = [{ question: 'New Q?', answer: 'New A' }];
    const res = await request(app).patch('/api/sessions/s7/enhanced').send({ qaPairs: newPairs });
    expect(res.status).toBe(200);
    const saved = enhancedStore['s7'] as Record<string, unknown>;
    expect(saved.qaPairs).toEqual(newPairs);
  });
});
