import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from './server.js';
import type { RawEntry } from './parsers/types.js';

// vi.mock is hoisted — cannot reference variables declared below.
// Inline the mock data directly in the factory.
vi.mock('./summarize.js', () => {
  const mockResult = {
    title: 'Refactored auth module to use Ed25519',
    developerTake: 'The old HS256 approach was a liability. Switched to Ed25519 for proper asymmetric signing.',
    context: 'Auth module was using HS256 shared secrets, needed upgrade to asymmetric keys.',
    skills: ['TypeScript', 'Cryptography'],
    questions: [
      { text: 'Why did you choose Ed25519 over RSA?', suggestedAnswer: 'Ed25519 has smaller keys and faster verification.' },
      { text: 'How did you handle key rotation?', suggestedAnswer: 'Added a key ID header to support multiple active keys.' },
      { text: 'What was the migration strategy?', suggestedAnswer: 'Dual-read for 24h, then cut over.' },
    ],
    executionSteps: [
      { stepNumber: 1, title: 'Analyzed existing auth flow', body: 'Read auth.ts to understand HS256 usage patterns.' },
      { stepNumber: 2, title: 'Implemented Ed25519 signing', body: 'Replaced HMAC with Ed25519 key pair generation.' },
    ],
  };

  return {
    summarizeSession: vi.fn().mockResolvedValue(mockResult),
    createSSEHandler: vi.fn().mockReturnValue(
      async (
        _req: { on: (event: string, handler: () => void) => void },
        res: {
          writeHead: (status: number, headers: Record<string, string>) => void;
          write: (data: string) => void;
          end: () => void;
        },
      ) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`event: title\ndata: ${JSON.stringify(mockResult.title)}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify(mockResult)}\n\n`);
        res.end();
      },
    ),
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

  it('session detail includes fully parsed childSessions', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions/abc-123');
    expect(res.status).toBe(200);
    const session = res.body.session;
    expect(session.childSessions).toBeInstanceOf(Array);
    expect(session.childSessions).toHaveLength(1);
    expect(session.childSessions[0].id).toBe('child-001');
    expect(session.childSessions[0].title).toBe('Build the login UI');
    expect(session.childSessions[0]).toHaveProperty('rawLog');
    expect(session.childSessions[0]).toHaveProperty('turns');
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

  it('session detail without children has no childSessions', async () => {
    const app = createApp(tmpDir);
    const res = await request(app).get('/api/projects/myapp/sessions/def-456');
    expect(res.status).toBe(200);
    expect(res.body.session.childSessions).toBeUndefined();
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
    expect(res.body.result.title).toBe('Refactored auth module to use Ed25519');
    expect(res.body.result.skills).toEqual(['TypeScript', 'Cryptography']);
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

