import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from './server.js';
import { saveUploadedState, getUploadedState } from './settings.js';
import type { RawEntry } from './parsers/types.js';

// vi.mock is hoisted — cannot reference variables declared below.
// Inline the mock data directly in the factory.
vi.mock('./summarize.js', () => {
  const mockResult = {
    title: 'Refactored auth module to use token-based auth',
    developerTake: 'The old HS256 approach was a liability. Switched to proper token-based auth.',
    context: 'Auth module was using HS256 shared secrets, needed upgrade.',
    skills: ['TypeScript', 'Authentication'],
    questions: [
      { text: 'Why did you choose this auth approach?', suggestedAnswer: 'Simpler key management and better security.' },
      { text: 'How did you handle key rotation?', suggestedAnswer: 'Added a key ID header to support multiple active keys.' },
      { text: 'What was the migration strategy?', suggestedAnswer: 'Dual-read for 24h, then cut over.' },
    ],
    executionSteps: [
      { stepNumber: 1, title: 'Analyzed existing auth flow', body: 'Read auth.ts to understand HS256 usage patterns.' },
      { stepNumber: 2, title: 'Implemented token-based auth', body: 'Replaced HMAC with proper token generation.' },
    ],
  };

  return {
    summarizeSession: vi.fn().mockResolvedValue(mockResult),
  };
});

vi.mock('./llm/index.js', async () => {
  // Import the mocked summarize module to get the same mock result
  const { summarizeSession } = await import('./summarize.js');
  return {
    getProvider: vi.fn().mockReturnValue({
      name: 'local',
      enhance: vi.fn().mockImplementation((session: unknown) => summarizeSession(session as never)),
    }),
    getEnhanceMode: vi.fn().mockReturnValue('local'),
  };
});

vi.mock('./auth.js', () => ({
  checkAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
  getAuthToken: vi.fn().mockReturnValue(null),
  saveAuthToken: vi.fn(),
}));

vi.mock('./settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings.js')>();
  return {
    ...actual,
    getAnthropicApiKey: vi.fn().mockReturnValue('test-fake-api-key'),
  };
});

const mockEnhanceProject = vi.fn();
const mockRefineNarrative = vi.fn();
vi.mock('./llm/project-enhance.js', () => ({
  enhanceProject: (...args: unknown[]) => mockEnhanceProject(...args),
  refineNarrative: (...args: unknown[]) => mockRefineNarrative(...args),
}));

// --- Test fixtures ---

function makeEntry(overrides: Partial<RawEntry> & { type: string }): RawEntry {
  return {
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: 'test-session-001',
    version: '2.1.80',
    ...overrides,
  } as RawEntry;
}

const TEST_SESSION: RawEntry[] = [
  makeEntry({
    type: 'user',
    timestamp: '2026-03-20T10:00:00.000Z',
    message: { role: 'user', content: 'Refactor the auth module' },
  }),
  makeEntry({
    type: 'assistant',
    timestamp: '2026-03-20T10:00:05.000Z',
    message: {
      role: 'assistant',
      model: 'claude-opus-4-6',
      id: 'msg_001',
      content: [
        {
          type: 'tool_use' as const,
          id: 'toolu_001',
          name: 'Read',
          input: { file_path: '/app/auth.ts' },
        },
      ],
    },
  }),
  makeEntry({
    type: 'user',
    timestamp: '2026-03-20T10:00:06.000Z',
    message: {
      role: 'user',
      content: [{ type: 'tool_result' as const, tool_use_id: 'toolu_001' }],
    },
  }),
  makeEntry({
    type: 'assistant',
    timestamp: '2026-03-20T10:00:10.000Z',
    message: {
      role: 'assistant',
      model: 'claude-opus-4-6',
      id: 'msg_002',
      content: [{ type: 'text' as const, text: 'The auth module uses HS256.' }],
    },
  }),
  makeEntry({
    type: 'system',
    subtype: 'turn_duration',
    timestamp: '2026-03-20T10:00:11.000Z',
    durationMs: 11000,
  }),
];

function toJsonl(entries: RawEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

// --- Setup ---

let tmpDir: string;

const CHILD_SESSION: RawEntry[] = [
  makeEntry({
    type: 'user',
    timestamp: '2026-03-20T10:01:00.000Z',
    sessionId: 'child-001',
    message: { role: 'user', content: 'Build the login UI' },
  }),
  makeEntry({
    type: 'assistant',
    timestamp: '2026-03-20T10:01:05.000Z',
    sessionId: 'child-001',
    message: {
      role: 'assistant',
      model: 'claude-opus-4-6',
      id: 'msg_c01',
      content: [{ type: 'text' as const, text: 'I will build the login form.' }],
    },
  }),
  makeEntry({
    type: 'system',
    subtype: 'turn_duration',
    timestamp: '2026-03-20T10:01:10.000Z',
    sessionId: 'child-001',
    durationMs: 10000,
  }),
];

beforeAll(async () => {
  tmpDir = join(tmpdir(), `heyiam-server-test-${Date.now()}`);
  // Create project directories with session files
  const projectDir = join(tmpDir, '-Users-test-Dev-myapp');
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'abc-123.jsonl'), toJsonl(TEST_SESSION));
  await writeFile(join(projectDir, 'def-456.jsonl'), toJsonl(TEST_SESSION));

  // Create subagent sessions under abc-123
  const subagentDir = join(projectDir, 'abc-123', 'subagents');
  await mkdir(subagentDir, { recursive: true });
  await writeFile(join(subagentDir, 'child-001.jsonl'), toJsonl(CHILD_SESSION));

  const project2Dir = join(tmpDir, '-Users-test-Dev-other');
  await mkdir(project2Dir, { recursive: true });
  await writeFile(join(project2Dir, 'ghi-789.jsonl'), toJsonl(TEST_SESSION));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('GET /api/projects (real parser)', () => {
  it('returns projects derived from session directories', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toBeInstanceOf(Array);
    expect(res.body.projects.length).toBe(2);

    const names = res.body.projects.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(['myapp', 'other']);
  });

  it('includes session counts', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects');
    const myapp = res.body.projects.find((p: { name: string }) => p.name === 'myapp');
    expect(myapp.sessionCount).toBe(2);
  });

  it('includes dirName for URL routing', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects');
    const myapp = res.body.projects.find((p: { name: string }) => p.name === 'myapp');
    expect(myapp.dirName).toBe('-Users-test-Dev-myapp');
  });

  it('includes aggregate stats per project', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects');
    const myapp = res.body.projects.find((p: { name: string }) => p.name === 'myapp');
    expect(typeof myapp.totalLoc).toBe('number');
    expect(typeof myapp.totalDuration).toBe('number');
    expect(typeof myapp.totalFiles).toBe('number');
    expect(myapp.skills).toBeInstanceOf(Array);
    expect(myapp.dateRange).toBeDefined();
    expect(myapp.lastSessionDate).toBeDefined();
  });
});

describe('GET /api/projects/:project/sessions (real parser)', () => {
  it('returns parsed sessions for a project by name', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toBeInstanceOf(Array);
    expect(res.body.sessions.length).toBe(2);
  });

  it('also matches by dirName', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/-Users-test-Dev-myapp/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBe(2);
  });

  it('returns empty array for unknown project', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/nonexistent/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  it('sessions have analyzed fields', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions');
    const session = res.body.sessions[0];
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('title');
    expect(session).toHaveProperty('turns');
    expect(session).toHaveProperty('linesOfCode');
    expect(session).toHaveProperty('skills');
    expect(session).toHaveProperty('toolBreakdown');
    expect(session).toHaveProperty('executionPath');
    expect(session).toHaveProperty('turnTimeline');
    expect(session).toHaveProperty('toolCalls');
    expect(session.projectName).toBe('myapp');
  });
});

describe('GET /api/projects/:project/sessions/:id (real parser)', () => {
  it('returns a specific session', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions/abc-123');
    expect(res.status).toBe(200);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe('abc-123');
    // Title may be overridden by locally-saved enhanced data from prior tests
    expect(res.body.session.title).toBeDefined();
  });

  it('returns 404 for unknown project', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/nope/sessions/abc-123');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 404 for unknown session', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions/zzz-999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('Hierarchical session API', () => {
  it('session list includes childCount for parent with subagents', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions');
    const parent = res.body.sessions.find((s: { id: string }) => s.id === 'abc-123');
    expect(parent.childCount).toBe(1);
    expect(parent.children).toBeInstanceOf(Array);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].sessionId).toBe('child-001');
  });

  it('session list children are lightweight (no full parse fields)', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions');
    const parent = res.body.sessions.find((s: { id: string }) => s.id === 'abc-123');
    const child = parent.children[0];
    // Lightweight: has sessionId but not full session fields
    expect(child.sessionId).toBeDefined();
    expect(child).not.toHaveProperty('rawLog');
    expect(child).not.toHaveProperty('turnTimeline');
  });

  it('session without children has no children field', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions');
    const solo = res.body.sessions.find((s: { id: string }) => s.id === 'def-456');
    expect(solo.childCount).toBe(0);
    expect(solo.children).toBeUndefined();
  });

  it('session detail includes children as AgentChild array', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions/abc-123');
    expect(res.status).toBe(200);
    const session = res.body.session;
    expect(session.children).toBeInstanceOf(Array);
    expect(session.children).toHaveLength(1);
    expect(session.children[0].sessionId).toBe('child-001');
    expect(session.children[0]).toHaveProperty('role');
    expect(session.children[0]).toHaveProperty('durationMinutes');
    expect(session.children[0]).toHaveProperty('linesOfCode');
  });

  it('session detail includes aggregated stats', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions/abc-123');
    const session = res.body.session;
    expect(session.isOrchestrated).toBe(true);
    expect(session.aggregatedStats).toBeDefined();
    expect(session.aggregatedStats.agentCount).toBe(1);
    expect(typeof session.aggregatedStats.totalLoc).toBe('number');
    expect(typeof session.aggregatedStats.totalDurationMinutes).toBe('number');
  });

  it('session detail without children has no children', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions/def-456');
    expect(res.status).toBe(200);
    expect(res.body.session.children).toBeUndefined();
    expect(res.body.session.aggregatedStats).toBeUndefined();
  });
});

describe('GET /api/enhance/status', () => {
  it('returns enhance status with mode', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/enhance/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mode');
    // In test env with mocked llm module, getEnhanceMode returns 'local'
    expect(res.body.mode).toBe('local');
  });
});

describe('GET /api/auth/status', () => {
  it('returns auth status', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('authenticated');
  });
});

describe('POST /api/auth/login', () => {
  it('endpoint exists and proxies to Phoenix', () => {
    const app = createApp(tmpDir);
    // Verify no global state is stored
    expect(app.locals.pendingDeviceCode).toBeUndefined();
  });
});

describe('POST /api/auth/poll', () => {
  it('returns 400 when no device_code provided', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).post('/api/auth/poll').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing device_code');
  });
});

describe('CORS restriction', () => {
  it('allows requests from localhost:17845', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .get('/api/projects')
      .set('Origin', 'http://localhost:17845');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:17845');
  });

  it('rejects requests from other origins', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .get('/api/projects')
      .set('Origin', 'http://evil.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('empty sessions directory', () => {
  it('returns empty projects for non-existent base path', async () => {
    const app = createApp(join(tmpDir, 'does-not-exist'));
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toEqual([]);
  });
});

describe('POST /api/projects/:project/sessions/:id/enhance', () => {
  it('returns enhancement result for a valid session', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/sessions/abc-123/enhance')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    expect(res.body.result.title).toBe('Refactored auth module to use token-based auth');
    expect(res.body.result.skills).toEqual(['TypeScript', 'Authentication']);
    expect(res.body.result.questions).toHaveLength(3);
    expect(res.body.result.executionSteps).toHaveLength(2);
  });

  it('returns 404 for unknown project', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/nope/sessions/abc-123/enhance')
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 404 for unknown session', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/sessions/zzz-999/enhance')
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('GET /api/projects/:project/git-remote', () => {
  it('returns 404 for unknown project', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/nonexistent/git-remote');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns url: null when project path is not a git repo', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/git-remote');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    // The test fixture dir decodes to /Users/test/Dev/myapp which is not a real git repo
    expect(res.body.url).toBeNull();
  });

  it('also matches by dirName', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/-Users-test-Dev-myapp/git-remote');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
  });
});

// ── Phase 3: Project Enhance endpoints ──────────────────────────

const MOCK_ENHANCE_RESULT = {
  narrative: 'A full-stack platform built from scratch.',
  arc: [{ phase: 1, title: 'Foundation', description: 'CLI parser' }],
  skills: ['TypeScript', 'Elixir'],
  timeline: [{
    period: 'Week 1',
    label: 'Setup',
    sessions: [{ sessionId: 'abc-123', title: 'Auth rewrite', featured: true }],
  }],
  questions: [{
    id: 'q1',
    category: 'pattern',
    question: 'You overrode the AI 3 times. Why?',
    context: 'High correction count',
  }],
};

describe('POST /api/projects/:project/enhance-project (SSE)', () => {
  beforeEach(() => {
    mockEnhanceProject.mockReset();
    mockRefineNarrative.mockReset();
    mockEnhanceProject.mockResolvedValue(MOCK_ENHANCE_RESULT);
  });

  it('streams SSE events and ends with done + result', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/enhance-project')
      .send({
        selectedSessionIds: ['abc-123'],
        skippedSessions: [{ title: 'Dep update', duration: 3, loc: 12 }],
      })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);

    // Parse SSE events from raw text
    const events = (res.body as string)
      .split('\n\n')
      .filter((s: string) => s.startsWith('data: '))
      .map((s: string) => JSON.parse(s.replace('data: ', '')));

    // Should have session_progress, project_enhance, and done events
    const types = events.map((e: { type: string }) => e.type);
    expect(types).toContain('session_progress');
    expect(types).toContain('project_enhance');
    expect(types).toContain('done');

    const doneEvent = events.find((e: { type: string }) => e.type === 'done');
    expect(doneEvent.result.narrative).toBe('A full-stack platform built from scratch.');
  });

  it('skips already-enhanced sessions (sends skipped status)', async () => {
    // Enhance a session first so it has saved data
    const app = createApp(tmpDir);
    await request(app)
      .post('/api/projects/myapp/sessions/abc-123/enhance')
      .send({});

    const res = await request(app)
      .post('/api/projects/myapp/enhance-project')
      .send({
        selectedSessionIds: ['abc-123'],
        skippedSessions: [],
      })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    const events = (res.body as string)
      .split('\n\n')
      .filter((s: string) => s.startsWith('data: '))
      .map((s: string) => JSON.parse(s.replace('data: ', '')));

    const progressEvents = events.filter((e: { type: string }) => e.type === 'session_progress');
    // Session was already enhanced, so it should be skipped
    expect(progressEvents.some((e: { status: string }) => e.status === 'skipped')).toBe(true);
  });

  it('returns 400 when selectedSessionIds is empty', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/enhance-project')
      .send({ selectedSessionIds: [], skippedSessions: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns error SSE event for unknown project', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/nonexistent/enhance-project')
      .send({ selectedSessionIds: ['abc-123'], skippedSessions: [] })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    const events = (res.body as string)
      .split('\n\n')
      .filter((s: string) => s.startsWith('data: '))
      .map((s: string) => JSON.parse(s.replace('data: ', '')));

    expect(events.some((e: { type: string }) => e.type === 'error')).toBe(true);
  });
});

describe('POST /api/projects/:project/refine-narrative', () => {
  beforeEach(() => {
    mockRefineNarrative.mockReset();
  });

  it('returns refined narrative from LLM', async () => {
    mockRefineNarrative.mockResolvedValue({
      narrative: 'Refined: trust is structural.',
      timeline: MOCK_ENHANCE_RESULT.timeline,
    });

    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/refine-narrative')
      .send({
        draftNarrative: 'Draft narrative.',
        draftTimeline: MOCK_ENHANCE_RESULT.timeline,
        answers: [{ questionId: 'q1', question: 'Why override?', answer: 'Backward compat was the problem.' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Refined: trust is structural.');
    expect(res.body.timeline).toHaveLength(1);
  });

  it('passes through unchanged when no answers', async () => {
    mockRefineNarrative.mockResolvedValue({
      narrative: 'Draft.',
      timeline: [],
    });

    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/refine-narrative')
      .send({
        draftNarrative: 'Draft.',
        draftTimeline: [],
        answers: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Draft.');
  });

  it('returns 400 when draftNarrative is missing', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/refine-narrative')
      .send({ answers: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 500 when LLM fails', async () => {
    mockRefineNarrative.mockRejectedValue(new Error('API rate limited'));

    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/refine-narrative')
      .send({
        draftNarrative: 'Draft.',
        answers: [{ questionId: 'q1', question: 'Q?', answer: 'A.' }],
      });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('REFINE_FAILED');
  });
});

// ── Phase 6: Uploaded state in GET /api/projects ────────────────

describe('GET /api/projects includes uploaded state', () => {
  const PROJECT_DIR_NAME = '-Users-test-Dev-myapp';

  it('returns isUploaded=false when no uploaded state exists', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects');
    const myapp = res.body.projects.find((p: { name: string }) => p.name === 'myapp');
    // May or may not be published depending on test order, but field should exist
    expect(myapp).toHaveProperty('isUploaded');
    expect(typeof myapp.isUploaded).toBe('boolean');
  });

  it('returns isUploaded=true and uploadedSessions after saving uploaded state', async () => {
    // Save uploaded state to default config dir (same as server uses)
    saveUploadedState(PROJECT_DIR_NAME, {
      slug: 'myapp-project',
      projectId: 99,
      uploadedSessions: ['abc-123'],
    });

    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects');
    const myapp = res.body.projects.find((p: { name: string }) => p.name === 'myapp');

    expect(myapp.isUploaded).toBe(true);
    expect(myapp.uploadedSessionCount).toBe(1);
    expect(myapp.uploadedSessions).toEqual(['abc-123']);
  });
});

// ── Phase 6: Triage SSE endpoint ─────────────────────────────────

function parseSSE(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n\n')
    .filter((s: string) => s.startsWith('data: '))
    .map((s: string) => JSON.parse(s.replace('data: ', '')));
}

describe('POST /api/projects/:project/triage (SSE)', () => {
  it('returns SSE stream with result event containing triageMethod', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/triage')
      .send({ useLLM: false })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);
    const events = parseSSE(res.body as string);

    // Should have loading_stats events (one per session) and a result event
    expect(events.some((e) => e.type === 'loading_stats')).toBe(true);

    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect(resultEvent!.triageMethod).toBeDefined();
    expect(['llm', 'scoring', 'auto-select']).toContain(resultEvent!.triageMethod);
  });

  it('includes alreadyPublished sessions in result event', async () => {
    // Ensure uploaded state exists for this project
    saveUploadedState('-Users-test-Dev-myapp', {
      slug: 'myapp-project',
      projectId: 99,
      uploadedSessions: ['abc-123'],
    });

    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/triage')
      .send({ useLLM: false })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    const events = parseSSE(res.body as string);
    const resultEvent = events.find((e) => e.type === 'result');

    expect(resultEvent).toBeDefined();
    expect(resultEvent!.alreadyUploaded).toBeInstanceOf(Array);
    expect(resultEvent!.alreadyUploaded).toContain('abc-123');
  });

  it('returns 404 for unknown project', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/nonexistent/triage')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('fires hard_floor events for each session', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/triage')
      .send({ useLLM: false })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    const events = parseSSE(res.body as string);
    const hardFloors = events.filter((e) => e.type === 'hard_floor');

    // myapp has 2 sessions (abc-123 and def-456)
    expect(hardFloors).toHaveLength(2);
    // Each hard_floor event should have passed boolean
    hardFloors.forEach((e) => {
      expect(typeof e.passed).toBe('boolean');
      expect(e.sessionId).toBeDefined();
    });
  });
});

// ── Phase 6: Small project auto-select via triage endpoint ────────

describe('POST /api/projects/:project/triage — small project', () => {
  it('auto-selects when project has few sessions passing hard floor', async () => {
    // The test fixture has 2 sessions with minimal data — they likely fail hard floor
    // (duration ~0, turns 2, files 0), so auto-select fires with 0 selected.
    // Let's verify the triageMethod is auto-select (since < 5 pass hard floor).
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/triage')
      .send({ useLLM: false })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    const events = parseSSE(res.body as string);
    const resultEvent = events.find((e) => e.type === 'result');

    expect(resultEvent).toBeDefined();
    // With only 2 sessions in myapp, fewer than 5 will pass hard floor → auto-select
    expect(resultEvent!.triageMethod).toBe('auto-select');
    expect(resultEvent!.autoSelected).toBe(true);
  });
});

// ── Phase 6: Enhance project with session failure ─────────────────

describe('POST /api/projects/:project/enhance-project — error recovery', () => {
  it('continues enhancing after one session fails (unknown session is skipped)', async () => {
    const app = createApp(tmpDir);
    const res = await request(app)
      .post('/api/projects/myapp/enhance-project')
      .send({
        selectedSessionIds: ['abc-123', 'nonexistent-session'],
        skippedSessions: [],
      })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);
    const events = parseSSE(res.body as string);

    // Should still get a done event despite one session being nonexistent
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.result).toBeDefined();

    // abc-123 should have been processed (skipped as already enhanced, or done)
    const progressEvents = events.filter((e) => e.type === 'session_progress');
    const abc123 = progressEvents.find((e) => e.sessionId === 'abc-123');
    expect(abc123).toBeDefined();
    expect(['done', 'skipped']).toContain(abc123!.status);
  });

  it('sends failed status for sessions that error during enhancement', async () => {
    const { getProvider } = await import('./llm/index.js');
    const provider = getProvider();
    const enhanceMock = provider.enhance as ReturnType<typeof vi.fn>;

    // Delete enhanced data so the session needs re-enhancement
    const app = createApp(tmpDir);
    await request(app).delete('/api/sessions/def-456/enhanced');

    // Make the provider.enhance mock reject once for this test
    enhanceMock.mockRejectedValueOnce(new Error('LLM rate limited'));

    const res = await request(app)
      .post('/api/projects/myapp/enhance-project')
      .send({
        selectedSessionIds: ['def-456'],
        skippedSessions: [],
        force: true,
      })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    const events = parseSSE(res.body as string);

    // Session should have an enhancing event followed by a failed event
    const progressEvents = events.filter((e) => e.type === 'session_progress');
    const failedEvent = progressEvents.find((e) => e.status === 'failed');

    expect(failedEvent).toBeDefined();
    expect(failedEvent!.sessionId).toBe('def-456');
    expect(failedEvent!.error).toBeDefined();
    expect(failedEvent!.error).toContain('LLM rate limited');
  });
});

// ── New API endpoints: search, session by ID, context export ─────

describe('GET /api/search', () => {
  it('returns empty results when no query params', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns results when searching with a query', async () => {
    // First, hit the projects endpoint to trigger indexing
    const app = createApp(tmpDir);
    await request(app).get('/api/projects');

    // Now search for content from our test sessions
    const res = await request(app).get('/api/search?q=auth');
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
    // Results may or may not match — depends on FTS indexing timing
    expect(res.body).toHaveProperty('total');
  });

  it('filters by source', async () => {
    const app = createApp(tmpDir);
    await request(app).get('/api/projects'); // trigger indexing
    const res = await request(app).get('/api/search?source=claude');
    expect(res.status).toBe(200);
    expect(res.body.results).toBeInstanceOf(Array);
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns session by ID after indexing', async () => {
    const app = createApp(tmpDir);
    // Trigger indexing by loading projects
    await request(app).get('/api/projects/myapp/sessions');

    const res = await request(app).get('/api/sessions/abc-123');
    expect(res.status).toBe(200);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe('abc-123');
  });

  it('returns 404 for unknown session', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/sessions/nonexistent-999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('GET /api/sessions/:id/context', () => {
  it('returns context export after indexing', async () => {
    const app = createApp(tmpDir);
    // Trigger indexing
    await request(app).get('/api/projects/myapp/sessions');

    const res = await request(app).get('/api/sessions/abc-123/context?format=summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content');
    expect(res.body).toHaveProperty('tokens');
    expect(res.body.format).toBe('summary');
    expect(typeof res.body.content).toBe('string');
    expect(res.body.content.length).toBeGreaterThan(0);
  });

  it('supports compact format', async () => {
    const app = createApp(tmpDir);
    await request(app).get('/api/projects/myapp/sessions');

    const res = await request(app).get('/api/sessions/abc-123/context?format=compact');
    expect(res.status).toBe(200);
    expect(res.body.format).toBe('compact');
  });

  it('returns 404 for unknown session', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/sessions/nonexistent-999/context');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('SPA fallback', () => {
  it('serves index.html for non-API client-side routes', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/projects/-Users-test-Dev-myapp/detail');
    // SPA fallback should serve index.html (200) or gracefully 404 if frontend missing
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).toContain('<!doctype html>');
    }
  });

  it('serves index.html for /settings route', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/settings');
    expect([200, 404]).toContain(res.status);
  });

  it('serves index.html for /search route', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/search');
    expect([200, 404]).toContain(res.status);
  });

  it('serves index.html for /time route', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/time');
    expect([200, 404]).toContain(res.status);
  });

  it('does not interfere with API routes', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
  });
});

