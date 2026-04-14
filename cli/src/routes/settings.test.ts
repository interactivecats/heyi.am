import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Track what the mocked settings module stores
let settingsStore: Record<string, unknown> = {};
let configDir: string;

vi.mock('../settings.js', () => ({
  saveAnthropicApiKey: vi.fn((key: string) => {
    settingsStore.anthropicApiKey = key || undefined;
  }),
  clearAnthropicApiKey: vi.fn(() => {
    delete settingsStore.anthropicApiKey;
  }),
  getAnthropicApiKey: vi.fn(() => settingsStore.anthropicApiKey as string | undefined),
  getSettings: vi.fn(() => settingsStore),
  setDefaultTemplate: vi.fn((t: string) => {
    settingsStore.defaultTemplate = t;
  }),
  getPortfolioProfile: vi.fn(() => (settingsStore.portfolio ?? {}) as Record<string, unknown>),
  savePortfolioProfile: vi.fn((data: Record<string, unknown>) => {
    settingsStore.portfolio = data;
  }),
  isTranscriptIncluded: vi.fn((sessionId: string) => {
    const map = (settingsStore.transcriptIncluded ?? {}) as Record<string, boolean>;
    return map[sessionId] !== false;
  }),
  setTranscriptIncluded: vi.fn((sessionId: string, included: boolean) => {
    const map = { ...((settingsStore.transcriptIncluded ?? {}) as Record<string, boolean>) };
    if (included) delete map[sessionId];
    else map[sessionId] = false;
    settingsStore.transcriptIncluded = map;
  }),
}));

vi.mock('../llm/index.js', () => ({
  hasApiKey: vi.fn(() => !!settingsStore.anthropicApiKey),
}));

vi.mock('../db.js', () => ({
  getDbPath: vi.fn(() => '/tmp/heyiam-test/sessions.db'),
}));

vi.mock('../daemon-install.js', () => ({
  getDaemonBinaryPath: vi.fn(() => '/tmp/heyiam-test/daemon/heyiam-tray'),
}));

vi.mock('../render/templates.js', () => ({
  isValidTemplate: vi.fn((name: string) => ['editorial', 'minimal', 'brutalist'].includes(name)),
  DEFAULT_TEMPLATE: 'editorial',
  BUILT_IN_TEMPLATES: [
    { name: 'editorial', label: 'Editorial', description: 'Clean editorial layout', accent: '#2563eb', mode: 'light', tags: ['minimal'] },
    { name: 'minimal', label: 'Minimal', description: 'Stripped down', accent: '#000000', mode: 'light', tags: ['minimal'] },
  ],
}));

import { createSettingsRouter } from './settings.js';
import type { RouteContext } from './context.js';

function makeApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const ctx = { sessionsBasePath: '/tmp', db: null } as unknown as RouteContext;
  app.use(createSettingsRouter(ctx));
  return app;
}

describe('Settings routes', () => {
  beforeAll(async () => {
    configDir = join(tmpdir(), `heyiam-settings-test-${Date.now()}`);
    await mkdir(configDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(configDir, { recursive: true, force: true });
  });

  describe('GET /api/portfolio', () => {
    it('returns empty object when no portfolio data exists', async () => {
      settingsStore = {};
      const res = await request(makeApp()).get('/api/portfolio');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('returns saved portfolio data', async () => {
      settingsStore = { portfolio: { displayName: 'Jane', bio: 'Hello' } };
      const res = await request(makeApp()).get('/api/portfolio');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ displayName: 'Jane', bio: 'Hello' });
    });
  });

  describe('POST /api/portfolio', () => {
    it('saves valid portfolio data', async () => {
      settingsStore = {};
      const app = makeApp();
      const res = await request(app)
        .post('/api/portfolio')
        .send({
          displayName: 'Jane Smith',
          bio: 'A developer',
          email: 'jane@example.com',
          githubUrl: 'https://github.com/jane',
        });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('rejects non-object body', async () => {
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send('not an object');
      // express will parse this as string, which is not an object
      expect(res.status).toBe(400);
    });

    it('rejects invalid email format', async () => {
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ]),
      );
    });

    it('rejects URLs that do not start with http', async () => {
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send({
          linkedinUrl: 'linkedin.com/in/jane',
          githubUrl: 'github.com/jane',
          websiteUrl: 'janesmith.dev',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveLength(3);
    });

    it('rejects display name over 200 characters', async () => {
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send({ displayName: 'x'.repeat(201) });
      expect(res.status).toBe(400);
      expect(res.body.error.fields[0].field).toBe('displayName');
    });

    it('rejects bio over 2000 characters', async () => {
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send({ bio: 'x'.repeat(2001) });
      expect(res.status).toBe(400);
      expect(res.body.error.fields[0].field).toBe('bio');
    });

    it('strips unknown fields', async () => {
      settingsStore = {};
      const { savePortfolioProfile } = await import('../settings.js');
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send({ displayName: 'Jane', unknownField: 'value', hackerField: true });
      expect(res.status).toBe(200);
      // The saved data should only contain allowed fields
      expect(savePortfolioProfile).toHaveBeenCalledWith(
        expect.not.objectContaining({ unknownField: 'value' }),
      );
    });

    it('ignores empty string and null values', async () => {
      settingsStore = {};
      const { savePortfolioProfile } = await import('../settings.js');
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send({ displayName: 'Jane', bio: '', location: null });
      expect(res.status).toBe(200);
      expect(savePortfolioProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Jane' }),
      );
      // bio and location should not be in the cleaned object since they are empty/null
      const lastCall = (savePortfolioProfile as ReturnType<typeof vi.fn>).mock.lastCall?.[0];
      expect(lastCall).not.toHaveProperty('bio');
      expect(lastCall).not.toHaveProperty('location');
    });

    it('returns all validation errors at once', async () => {
      const res = await request(makeApp())
        .post('/api/portfolio')
        .send({
          displayName: 'x'.repeat(201),
          email: 'bad',
          linkedinUrl: 'no-http',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('GET /api/templates', () => {
    it('returns built-in templates', async () => {
      const res = await request(makeApp()).get('/api/templates');
      expect(res.status).toBe(200);
      expect(res.body.templates).toHaveLength(2);
      expect(res.body.templates[0]).toHaveProperty('name', 'editorial');
      expect(res.body.templates[0]).toHaveProperty('builtIn', true);
    });
  });

  describe('GET /api/settings/theme', () => {
    it('returns default template when none set', async () => {
      settingsStore = {};
      const res = await request(makeApp()).get('/api/settings/theme');
      expect(res.status).toBe(200);
      expect(res.body.template).toBe('editorial');
    });
  });

  describe('POST /api/settings/theme', () => {
    it('saves a valid theme', async () => {
      const res = await request(makeApp())
        .post('/api/settings/theme')
        .send({ template: 'minimal' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('rejects invalid theme name', async () => {
      const res = await request(makeApp())
        .post('/api/settings/theme')
        .send({ template: 'nonexistent' });
      expect(res.status).toBe(400);
    });
  });

  describe('Transcript toggle routes', () => {
    it('GET returns default true when no setting has been stored', async () => {
      settingsStore = {};
      const res = await request(makeApp())
        .get('/api/sessions/sess-new/transcript-setting');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sessionId: 'sess-new', included: true });
    });

    it('PUT then GET round-trips the included=false setting', async () => {
      settingsStore = {};
      const putRes = await request(makeApp())
        .put('/api/sessions/sess-1/transcript-setting')
        .send({ included: false });
      expect(putRes.status).toBe(200);
      expect(putRes.body.ok).toBe(true);
      expect(putRes.body.included).toBe(false);

      const getRes = await request(makeApp())
        .get('/api/sessions/sess-1/transcript-setting');
      expect(getRes.status).toBe(200);
      expect(getRes.body.included).toBe(false);
    });

    it('PUT rejects non-boolean included with 400', async () => {
      const res = await request(makeApp())
        .put('/api/sessions/sess-1/transcript-setting')
        .send({ included: 'yes' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BODY');
    });

    it('PUT with included=true clears the flag', async () => {
      settingsStore = { transcriptIncluded: { 'sess-back-on': false } };
      const res = await request(makeApp())
        .put('/api/sessions/sess-back-on/transcript-setting')
        .send({ included: true });
      expect(res.status).toBe(200);
      // The helper deletes the false flag when flipping back to true.
      expect((settingsStore.transcriptIncluded as Record<string, boolean>)['sess-back-on']).toBeUndefined();
    });
  });

  describe('GET /api/local-data', () => {
    it('returns dbPath and daemon install state', async () => {
      const res = await request(makeApp()).get('/api/local-data');
      expect(res.status).toBe(200);
      expect(res.body.dbPath).toBe('/tmp/heyiam-test/sessions.db');
      expect(res.body.daemon).toBeDefined();
      expect(typeof res.body.daemon.installed).toBe('boolean');
      expect(res.body.daemon.binaryPath).toBe('/tmp/heyiam-test/daemon/heyiam-tray');
      // The mocked binary path does not exist, so installed should be false.
      expect(res.body.daemon.installed).toBe(false);
    });
  });
});
