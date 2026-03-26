import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import {
  openDatabase,
  upsertSession,
  indexSessionContent,
  indexSessionFiles,
  type UpsertSessionInput,
} from './db.js';
import { searchSessions, decodeProjectName, type SearchFilters } from './search.js';
import type { SessionAnalysis } from './parsers/types.js';
import type { Session, ParsedTurn, ParsedFileChange } from './analyzer.js';
import type { SessionMeta } from './parsers/index.js';

// ── Helpers ──────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'heyiam-search-test-'));
}

function makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    path: '/tmp/fake-session.jsonl',
    source: 'claude',
    sessionId: 'session-1',
    projectDir: '-Users-test-Dev-myapp',
    isSubagent: false,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<SessionAnalysis> = {}): SessionAnalysis {
  return {
    source: 'claude',
    turns: 10,
    tool_calls: [],
    files_touched: ['src/index.ts'],
    duration_ms: 1800000,
    wall_clock_ms: 2400000,
    loc_stats: { loc_added: 100, loc_removed: 20, loc_net: 80, files_changed: ['src/index.ts'] },
    raw_entries: [],
    start_time: '2026-03-20T10:00:00Z',
    end_time: '2026-03-20T10:30:00Z',
    models_used: ['claude-opus-4-6'],
    cwd: '/Users/test/Dev/myapp',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    title: 'Fix auth middleware',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 30,
    wallClockMinutes: 40,
    turns: 10,
    linesOfCode: 120,
    status: 'draft',
    projectName: 'myapp',
    rawLog: [],
    skills: ['TypeScript', 'Node.js'],
    executionPath: [],
    toolBreakdown: [{ tool: 'Edit', count: 5 }],
    filesChanged: [
      { path: 'src/index.ts', additions: 80, deletions: 10 },
      { path: 'src/auth.ts', additions: 20, deletions: 10 },
    ],
    turnTimeline: [],
    toolCalls: 15,
    ...overrides,
  };
}

function makeUpsertInput(overrides: Partial<UpsertSessionInput> = {}): UpsertSessionInput {
  return {
    meta: makeMeta(),
    analysis: makeAnalysis(),
    session: makeSession(),
    fileMtime: 1711000000000,
    fileSize: 50000,
    ...overrides,
  };
}

function makeTurns(content: string = 'Fix the authentication middleware bug'): ParsedTurn[] {
  return [
    { timestamp: '2026-03-20T10:00:00Z', type: 'prompt', content },
    { timestamp: '2026-03-20T10:01:00Z', type: 'response', content: 'I will start by reading the auth module.' },
    { timestamp: '2026-03-20T10:02:00Z', type: 'tool', content: 'Read src/auth.ts', toolName: 'Read', toolInput: 'src/auth.ts' },
  ];
}

/** Seed multiple sessions for filter testing */
function seedTestData(db: Database.Database): void {
  // Session 1: Claude, myapp, TypeScript, March 20, 30min
  const input1 = makeUpsertInput();
  upsertSession(db, input1);
  indexSessionContent(db, 'session-1', makeTurns('Fix the authentication middleware bug'));
  indexSessionFiles(db, 'session-1', input1.session.filesChanged);

  // Session 2: Cursor, myapp, Elixir, March 22, 60min
  const input2 = makeUpsertInput({
    meta: makeMeta({ sessionId: 'session-2', source: 'cursor' }),
    analysis: makeAnalysis({
      source: 'cursor',
      start_time: '2026-03-22T14:00:00Z',
      end_time: '2026-03-22T15:00:00Z',
      loc_stats: { loc_added: 200, loc_removed: 50, loc_net: 150, files_changed: ['lib/auth.ex'] },
    }),
    session: makeSession({
      id: 'session-2',
      title: 'Rebuild auth with phx.gen.auth',
      durationMinutes: 60,
      turns: 25,
      skills: ['Elixir', 'Phoenix'],
      filesChanged: [
        { path: 'lib/auth.ex', additions: 150, deletions: 30 },
        { path: 'lib/auth_controller.ex', additions: 50, deletions: 20 },
      ],
    }),
  });
  upsertSession(db, input2);
  indexSessionContent(db, 'session-2', makeTurns('Rebuild the auth system using phx.gen.auth'));
  indexSessionFiles(db, 'session-2', input2.session.filesChanged);

  // Session 3: Claude, different project, March 25, 15min
  const input3 = makeUpsertInput({
    meta: makeMeta({
      sessionId: 'session-3',
      projectDir: '-Users-test-Dev-webapp',
    }),
    analysis: makeAnalysis({
      start_time: '2026-03-25T09:00:00Z',
      end_time: '2026-03-25T09:15:00Z',
      loc_stats: { loc_added: 30, loc_removed: 5, loc_net: 25, files_changed: ['src/app.tsx'] },
    }),
    session: makeSession({
      id: 'session-3',
      title: 'Add search component',
      durationMinutes: 15,
      turns: 8,
      skills: ['React', 'TypeScript'],
      filesChanged: [
        { path: 'src/app.tsx', additions: 30, deletions: 5 },
      ],
    }),
  });
  upsertSession(db, input3);
  indexSessionContent(db, 'session-3', makeTurns('Add a search component to the webapp'));
  indexSessionFiles(db, 'session-3', input3.session.filesChanged);
}

// ── Tests ────────────────────────────────────────────────────

describe('search', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    db = openDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('decodeProjectName', () => {
    it('strips leading dash and converts dashes to slashes', () => {
      expect(decodeProjectName('-Users-test-Dev-myapp')).toBe('Users/test/Dev/myapp');
    });

    it('handles single-segment project dirs', () => {
      expect(decodeProjectName('-myapp')).toBe('myapp');
    });

    it('handles no leading dash', () => {
      expect(decodeProjectName('myapp')).toBe('myapp');
    });
  });

  describe('searchSessions with text query', () => {
    it('returns FTS matches with snippets', () => {
      const results = searchSessions(db, 'authentication');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sessionId).toBe('session-1');
      expect(results[0].snippet).toBeTruthy();
    });

    it('returns empty array for no matches', () => {
      const results = searchSessions(db, 'xyznonexistent');
      expect(results).toEqual([]);
    });

    it('populates all result fields', () => {
      const results = searchSessions(db, 'authentication');
      const r = results[0];
      expect(r.sessionId).toBe('session-1');
      expect(r.title).toBe('Fix auth middleware');
      expect(r.projectDir).toBe('-Users-test-Dev-myapp');
      expect(r.projectName).toBe('Users/test/Dev/myapp');
      expect(r.source).toBe('claude');
      expect(r.date).toBe('2026-03-20T10:00:00Z');
      expect(r.durationMinutes).toBe(30);
      expect(r.turns).toBe(10);
      expect(r.linesOfCode).toBe(120); // 100 + 20
      expect(r.skills).toEqual(['TypeScript', 'Node.js']);
      expect(typeof r.score).toBe('number');
    });

    it('deduplicates sessions with multiple FTS matches', () => {
      // session-1 has 3 FTS rows; should appear once in results
      const results = searchSessions(db, 'auth');
      const session1Results = results.filter((r) => r.sessionId === 'session-1');
      expect(session1Results).toHaveLength(1);
    });

    it('combines text query with source filter', () => {
      const results = searchSessions(db, 'auth', { source: 'cursor' });
      expect(results.every((r) => r.source === 'cursor')).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('combines text query with project filter', () => {
      const results = searchSessions(db, 'search', { project: 'webapp' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-3');
    });

    it('combines text query with date filters', () => {
      const results = searchSessions(db, 'auth', { after: '2026-03-21T00:00:00Z' });
      expect(results.every((r) => r.date >= '2026-03-21T00:00:00Z')).toBe(true);
    });

    it('combines text query with file filter', () => {
      const results = searchSessions(db, 'auth', { file: 'auth.ex' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });
  });

  describe('searchSessions with filters only (no query)', () => {
    it('returns all sessions when no filters', () => {
      const results = searchSessions(db);
      expect(results).toHaveLength(3);
    });

    it('filters by source', () => {
      const results = searchSessions(db, undefined, { source: 'cursor' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });

    it('filters by project substring', () => {
      const results = searchSessions(db, undefined, { project: 'webapp' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-3');
    });

    it('filters by after date', () => {
      const results = searchSessions(db, undefined, { after: '2026-03-21T00:00:00Z' });
      expect(results).toHaveLength(2); // session-2 and session-3
      expect(results.every((r) => r.date >= '2026-03-21T00:00:00Z')).toBe(true);
    });

    it('filters by before date', () => {
      const results = searchSessions(db, undefined, { before: '2026-03-21T00:00:00Z' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-1');
    });

    it('filters by date range', () => {
      const results = searchSessions(db, undefined, {
        after: '2026-03-21T00:00:00Z',
        before: '2026-03-24T00:00:00Z',
      });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });

    it('filters by skill', () => {
      const results = searchSessions(db, undefined, { skill: 'Elixir' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });

    it('filters by skill that appears in multiple sessions', () => {
      const results = searchSessions(db, undefined, { skill: 'TypeScript' });
      expect(results).toHaveLength(2); // session-1 and session-3
    });

    it('filters by minimum duration', () => {
      const results = searchSessions(db, undefined, { minDuration: 25 });
      expect(results).toHaveLength(2); // session-1 (30m) and session-2 (60m)
      expect(results.every((r) => r.durationMinutes >= 25)).toBe(true);
    });

    it('filters by file path', () => {
      const results = searchSessions(db, undefined, { file: 'auth.ex' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });

    it('file filter matches partial paths', () => {
      const results = searchSessions(db, undefined, { file: 'app.tsx' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-3');
    });

    it('combines multiple filters', () => {
      const results = searchSessions(db, undefined, {
        source: 'claude',
        skill: 'TypeScript',
        minDuration: 20,
      });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-1');
    });

    it('returns empty when filters match nothing', () => {
      const results = searchSessions(db, undefined, { source: 'codex' });
      expect(results).toEqual([]);
    });

    it('sorts by start_time DESC (newest first)', () => {
      const results = searchSessions(db);
      expect(results[0].sessionId).toBe('session-3'); // March 25
      expect(results[1].sessionId).toBe('session-2'); // March 22
      expect(results[2].sessionId).toBe('session-1'); // March 20
    });

    it('snippets are empty when no text query', () => {
      const results = searchSessions(db);
      expect(results.every((r) => r.snippet === '')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles session with null title', () => {
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'no-title' }),
        session: makeSession({ id: 'no-title', title: undefined as unknown as string }),
      }));

      const results = searchSessions(db, undefined, { source: 'claude' });
      const noTitle = results.find((r) => r.sessionId === 'no-title');
      expect(noTitle).toBeDefined();
      expect(noTitle!.title).toBe('');
    });

    it('handles session with null skills', () => {
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'no-skills' }),
        session: makeSession({ id: 'no-skills', skills: [] }),
      }));

      const results = searchSessions(db, undefined, { skill: 'TypeScript' });
      expect(results.find((r) => r.sessionId === 'no-skills')).toBeUndefined();
    });

    it('handles empty database', () => {
      // Create a fresh empty DB
      const emptyDb = openDatabase(join(tmpDir, 'empty.db'));
      const results = searchSessions(emptyDb);
      expect(results).toEqual([]);
      emptyDb.close();
    });
  });
});
