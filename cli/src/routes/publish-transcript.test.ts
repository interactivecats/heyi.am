import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mocks ────────────────────────────────────────────────────

vi.mock('../auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth.js')>();
  return {
    ...actual,
    getAuthToken: vi.fn(() => ({
      username: 'testuser',
      token: 'test-token-abc',
      savedAt: '2026-04-13T00:00:00.000Z',
    })),
  };
});

vi.mock('../config.js', () => ({
  API_URL: 'https://heyiam.test',
  PUBLIC_URL: 'https://heyi.test',
  warnIfNonDefaultApiUrl: vi.fn(),
}));

vi.mock('../render/index.js', () => ({
  renderProjectHtml: vi.fn(() => '<div>project</div>'),
  renderSessionHtml: vi.fn(() => '<div>session</div>'),
  renderPortfolioHtml: vi.fn(() => '<div>portfolio</div>'),
}));

vi.mock('../render/build-render-data.js', () => ({
  buildProjectRenderData: vi.fn(() => ({})),
  buildSessionCard: vi.fn(() => ({ token: 's1', slug: 's-slug', title: 'T' })),
  buildSessionRenderData: vi.fn(() => ({})),
}));

vi.mock('../db.js', () => ({
  getSessionsByProject: vi.fn(() => []),
  getProjectUuid: vi.fn(() => 'uuid'),
  getFileCountWithChildren: vi.fn(() => 0),
}));

vi.mock('../screenshot.js', () => ({
  captureScreenshot: vi.fn().mockResolvedValue(null),
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

// ── Setup ────────────────────────────────────────────────────

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

import { createPublishRouter } from './publish.js';
import type { RouteContext } from './context.js';
import { setTranscriptIncluded } from '../settings.js';
import { getAuthToken } from '../auth.js';

let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;
const originalConfigDir = process.env.HEYIAM_CONFIG_DIR;

function makeSessionMeta(sessionId: string, path: string) {
  return {
    sessionId,
    path,
    source: 'claude',
    children: [],
  };
}

function makeSession(title: string, rawLog: string[]) {
  return {
    title,
    date: '2026-04-01T10:00:00.000Z',
    endTime: '2026-04-01T11:00:00.000Z',
    durationMinutes: 30,
    wallClockMinutes: 60,
    turns: 10,
    filesChanged: [],
    linesOfCode: 100,
    skills: ['TypeScript'],
    source: 'claude',
    developerTake: '',
    narrative: '',
    cwd: '/tmp/proj',
    rawLog,
    toolBreakdown: [],
    executionPath: [],
    qaPairs: [],
    turnTimeline: [
      { timestamp: '2026-04-01T10:00:00.000Z', type: 'prompt', content: 'Do X', tools: [] },
    ],
  };
}

function makeApp(sessionId: string, rawLogPath: string, rawLog: string[]): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const ctx = {
    db: {} as RouteContext['db'],
    sessionsBasePath: '/tmp',
    getProjects: vi.fn().mockResolvedValue([
      {
        name: 'demo-project',
        dirName: 'demo-project',
        sessions: [makeSessionMeta(sessionId, rawLogPath)],
      },
    ]),
    getProjectWithStats: vi.fn(),
    loadSession: vi.fn().mockResolvedValue(makeSession('Fix bug', rawLog)),
    getSessionStats: vi.fn(),
    buildPreviewPage: vi.fn(),
  } as unknown as RouteContext;
  app.use(createPublishRouter(ctx));
  return app;
}

/**
 * Collect SSE events from the streaming upload endpoint by reading the
 * raw text body and splitting on data: lines.
 */
async function uploadAndParseEvents(
  app: express.Express,
  projectDir: string,
  sessionId: string,
) {
  const res = await request(app)
    .post(`/api/projects/${projectDir}/upload`)
    .send({
      title: 'Demo',
      slug: 'demo',
      narrative: 'A project',
      repoUrl: '',
      projectUrl: '',
      timeline: [],
      skills: ['TypeScript'],
      totalSessions: 1,
      totalLoc: 100,
      totalDurationMinutes: 30,
      totalFilesChanged: 0,
      skippedSessions: [],
      selectedSessionIds: [sessionId],
    });
  return res;
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'heyiam-publish-transcript-'));
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

// ── Tests ────────────────────────────────────────────────────

describe('POST /api/projects/:project/upload — transcript toggle', () => {
  /**
   * Stage a fake session raw-log file on disk so the raw S3 upload path
   * in publish.ts has something to read. We want to prove it does NOT
   * get read when transcript is off.
   */
  function stageSessionFile(): { path: string; rawLog: string[] } {
    const sessionsDir = join(configDir, 'fake-sessions');
    mkdirSync(sessionsDir, { recursive: true });
    const path = join(sessionsDir, 'sess.jsonl');
    writeFileSync(path, '{"type":"user","content":"hello"}\n');
    return { path, rawLog: ['> hello', 'world response'] };
  }

  function mockPhoenixForOneSession() {
    // 1. Project upsert (initial).
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ project_id: 42, slug: 'demo' }),
    });
    // 2. Session POST returns upload_urls.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        upload_urls: {
          raw: 'https://s3.test/raw',
          log: 'https://s3.test/log',
          session: 'https://s3.test/session',
        },
      }),
    });
  }

  it('with transcript ON (default), uploads raw + log + session-data to S3', async () => {
    const { path, rawLog } = stageSessionFile();
    mockPhoenixForOneSession();
    // Chain the three S3 PUTs + the Step-3 render re-POST.
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const app = makeApp('sess-with-transcript', path, rawLog);
    const res = await uploadAndParseEvents(app, 'demo-project', 'sess-with-transcript');
    expect(res.status).toBe(200);

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain('https://s3.test/raw');
    expect(urls).toContain('https://s3.test/log');
    expect(urls).toContain('https://s3.test/session');
  });

  it('with transcript OFF, skips all three transcript S3 uploads', async () => {
    const { path, rawLog } = stageSessionFile();
    setTranscriptIncluded('sess-no-transcript', false);

    mockPhoenixForOneSession();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const app = makeApp('sess-no-transcript', path, rawLog);
    const res = await uploadAndParseEvents(app, 'demo-project', 'sess-no-transcript');
    expect(res.status).toBe(200);

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).not.toContain('https://s3.test/raw');
    expect(urls).not.toContain('https://s3.test/log');
    expect(urls).not.toContain('https://s3.test/session');
  });

  it('with transcript OFF, the session POST body has no transcript_excerpt or turn_timeline', async () => {
    const { path, rawLog } = stageSessionFile();
    setTranscriptIncluded('sess-strip', false);

    mockPhoenixForOneSession();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const app = makeApp('sess-strip', path, rawLog);
    await uploadAndParseEvents(app, 'demo-project', 'sess-strip');

    // Find the call to /api/sessions (the second fetch).
    const sessionPostCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/api/sessions'),
    );
    expect(sessionPostCall).toBeTruthy();
    // The POST to /api/sessions never contains transcript_excerpt in the
    // Phoenix payload — that field only lives in the S3 session-data
    // JSON, which was skipped above. Assert the payload is still clean:
    const payload = JSON.parse(sessionPostCall![1]!.body as string);
    expect(payload.session).toBeDefined();
    expect(payload.session.transcript_excerpt).toBeUndefined();
    expect(payload.session.turn_timeline).toBeUndefined();
  });

  it('respects per-session flag independently', async () => {
    // Not-toggled session has default true; toggling only one does not
    // affect others.
    setTranscriptIncluded('sess-A', false);
    // Re-reading back for a different session should yield true.
    const { isTranscriptIncluded } = await import('../settings.js');
    expect(isTranscriptIncluded('sess-A')).toBe(false);
    expect(isTranscriptIncluded('sess-B')).toBe(true);
  });
});
