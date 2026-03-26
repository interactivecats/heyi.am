import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import {
  openDatabase,
  upsertSession,
  indexSessionContent,
  indexSessionFiles,
  indexSession,
  getSessionStats,
  getAllProjectStats,
  getSessionRow,
  getSessionsByProject,
  deleteSession,
  rebuildIndex,
  isSessionStale,
  searchFts,
  searchByFile,
  getSessionCount,
  cleanupOrphanedSessions,
  countPreservedSessions,
  getContextSummary,
  getDashboardStats,
  type UpsertSessionInput,
} from './db.js';
import type { SessionAnalysis } from './parsers/types.js';
import type { Session, ParsedTurn, ParsedFileChange } from './analyzer.js';
import type { SessionMeta } from './parsers/index.js';

// ── Helpers ──────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'heyiam-db-test-'));
}

function makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    path: '/tmp/fake-session.jsonl',
    source: 'claude',
    sessionId: 'test-session-1',
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
    files_touched: ['src/index.ts', 'src/db.ts'],
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
    id: 'test-session-1',
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
      { path: 'src/db.ts', additions: 20, deletions: 10 },
    ],
    turnTimeline: [],
    toolCalls: 15,
    ...overrides,
  };
}

function makeTurns(): ParsedTurn[] {
  return [
    { timestamp: '2026-03-20T10:00:00Z', type: 'prompt', content: 'Fix the authentication middleware bug' },
    { timestamp: '2026-03-20T10:01:00Z', type: 'response', content: 'I will start by reading the auth module to understand the issue.' },
    { timestamp: '2026-03-20T10:02:00Z', type: 'tool', content: 'Read src/auth.ts', toolName: 'Read', toolInput: 'src/auth.ts' },
    { timestamp: '2026-03-20T10:05:00Z', type: 'response', content: 'Found the bug — the token validation skips expired tokens.' },
    { timestamp: '2026-03-20T10:06:00Z', type: 'tool', content: 'Edit src/auth.ts', toolName: 'Edit', toolInput: 'src/auth.ts' },
  ];
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

// ── Tests ────────────────────────────────────────────────────

describe('db', () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    db = openDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('openDatabase', () => {
    it('creates schema_version table with current version', () => {
      const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
      expect(row.version).toBe(3);
    });

    it('creates sessions table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('creates sessions_fts virtual table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_fts'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('creates session_files table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='session_files'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('is idempotent — opening twice does not error', () => {
      const db2 = openDatabase(join(tmpDir, 'test.db'));
      const row = db2.prepare('SELECT version FROM schema_version').get() as { version: number };
      expect(row.version).toBe(3);
      db2.close();
    });
  });

  describe('upsertSession', () => {
    it('inserts a new session', () => {
      upsertSession(db, makeUpsertInput());

      const row = getSessionRow(db, 'test-session-1');
      expect(row).not.toBeNull();
      expect(row!.title).toBe('Fix auth middleware');
      expect(row!.source).toBe('claude');
      expect(row!.project_dir).toBe('-Users-test-Dev-myapp');
      expect(row!.turns).toBe(10);
      expect(row!.loc_added).toBe(100);
      expect(row!.loc_removed).toBe(20);
      expect(row!.duration_minutes).toBe(30);
      expect(row!.file_mtime).toBe(1711000000000);
      expect(row!.file_size).toBe(50000);
    });

    it('updates an existing session on conflict', () => {
      upsertSession(db, makeUpsertInput());

      const updated = makeUpsertInput({
        session: makeSession({ title: 'Updated title', turns: 20 }),
        fileMtime: 1711000001000,
      });
      upsertSession(db, updated);

      const row = getSessionRow(db, 'test-session-1');
      expect(row!.title).toBe('Updated title');
      expect(row!.turns).toBe(20);
      expect(row!.file_mtime).toBe(1711000001000);
    });

    it('stores skills as JSON array', () => {
      upsertSession(db, makeUpsertInput());

      const row = getSessionRow(db, 'test-session-1');
      expect(JSON.parse(row!.skills!)).toEqual(['TypeScript', 'Node.js']);
    });

    it('stores subagent flag', () => {
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ isSubagent: true, agentRole: 'researcher' }),
      }));

      const row = getSessionRow(db, 'test-session-1');
      expect(row!.is_subagent).toBe(1);
      expect(row!.agent_role).toBe('researcher');
    });
  });

  describe('indexSessionContent', () => {
    it('populates FTS5 table with turns', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionContent(db, 'test-session-1', makeTurns());

      const count = db.prepare('SELECT COUNT(*) as c FROM sessions_fts WHERE session_id = ?')
        .get('test-session-1') as { c: number };
      expect(count.c).toBe(5);
    });

    it('replaces existing FTS entries on re-index', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionContent(db, 'test-session-1', makeTurns());
      indexSessionContent(db, 'test-session-1', makeTurns().slice(0, 2));

      const count = db.prepare('SELECT COUNT(*) as c FROM sessions_fts WHERE session_id = ?')
        .get('test-session-1') as { c: number };
      expect(count.c).toBe(2);
    });

    it('skips empty content', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionContent(db, 'test-session-1', [
        { timestamp: '2026-03-20T10:00:00Z', type: 'prompt', content: '' },
        { timestamp: '2026-03-20T10:01:00Z', type: 'response', content: 'Hello' },
      ]);

      const count = db.prepare('SELECT COUNT(*) as c FROM sessions_fts WHERE session_id = ?')
        .get('test-session-1') as { c: number };
      expect(count.c).toBe(1);
    });
  });

  describe('indexSessionFiles', () => {
    it('populates session_files table', () => {
      upsertSession(db, makeUpsertInput());
      const files: ParsedFileChange[] = [
        { path: 'src/index.ts', additions: 80, deletions: 10 },
        { path: 'src/db.ts', additions: 20, deletions: 10 },
      ];
      indexSessionFiles(db, 'test-session-1', files);

      const rows = db.prepare('SELECT * FROM session_files WHERE session_id = ? ORDER BY file_path')
        .all('test-session-1') as Array<{ file_path: string; additions: number; deletions: number }>;
      expect(rows).toHaveLength(2);
      expect(rows[0].file_path).toBe('src/db.ts');
      expect(rows[1].file_path).toBe('src/index.ts');
      expect(rows[1].additions).toBe(80);
    });

    it('replaces existing entries on re-index', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionFiles(db, 'test-session-1', [{ path: 'a.ts', additions: 10, deletions: 0 }]);
      indexSessionFiles(db, 'test-session-1', [{ path: 'b.ts', additions: 5, deletions: 2 }]);

      const rows = db.prepare('SELECT * FROM session_files WHERE session_id = ?')
        .all('test-session-1') as Array<{ file_path: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].file_path).toBe('b.ts');
    });
  });

  describe('indexSession (transactional)', () => {
    it('inserts session, FTS, and file data atomically', () => {
      indexSession(db, makeUpsertInput(), makeTurns());

      expect(getSessionRow(db, 'test-session-1')).not.toBeNull();
      expect(getSessionCount(db)).toBe(1);

      const ftsCount = db.prepare('SELECT COUNT(*) as c FROM sessions_fts WHERE session_id = ?')
        .get('test-session-1') as { c: number };
      expect(ftsCount.c).toBe(5);

      const fileCount = db.prepare('SELECT COUNT(*) as c FROM session_files WHERE session_id = ?')
        .get('test-session-1') as { c: number };
      expect(fileCount.c).toBe(2);
    });
  });

  describe('getSessionStats', () => {
    it('returns stats for an indexed session', () => {
      upsertSession(db, makeUpsertInput());

      const stats = getSessionStats(db, 'test-session-1');
      expect(stats).not.toBeNull();
      expect(stats!.loc).toBe(120); // 100 + 20
      expect(stats!.duration).toBe(30);
      expect(stats!.turns).toBe(10);
      expect(stats!.skills).toEqual(['TypeScript', 'Node.js']);
      expect(stats!.date).toBe('2026-03-20T10:00:00Z');
      expect(stats!.endTime).toBe('2026-03-20T10:30:00Z');
    });

    it('returns null for unknown session', () => {
      expect(getSessionStats(db, 'nonexistent')).toBeNull();
    });
  });

  describe('getAllProjectStats', () => {
    it('aggregates stats by project', () => {
      upsertSession(db, makeUpsertInput());
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'test-session-2' }),
        analysis: makeAnalysis({
          start_time: '2026-03-21T10:00:00Z',
          loc_stats: { loc_added: 50, loc_removed: 10, loc_net: 40, files_changed: [] },
        }),
        session: makeSession({
          id: 'test-session-2',
          title: 'Add logging',
          turns: 5,
          skills: ['TypeScript', 'Docker'],
        }),
      }));

      const projects = getAllProjectStats(db);
      expect(projects).toHaveLength(1);
      expect(projects[0].sessionCount).toBe(2);
      expect(projects[0].totalLoc).toBe(180); // (100+20) + (50+10)
      expect(projects[0].skills).toContain('TypeScript');
      expect(projects[0].skills).toContain('Node.js');
      expect(projects[0].skills).toContain('Docker');
    });

    it('excludes subagent sessions from count', () => {
      upsertSession(db, makeUpsertInput());
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'child-1', isSubagent: true }),
        session: makeSession({ id: 'child-1' }),
      }));

      const projects = getAllProjectStats(db);
      expect(projects).toHaveLength(1);
      expect(projects[0].sessionCount).toBe(1);
    });

    it('returns empty array when no sessions', () => {
      expect(getAllProjectStats(db)).toEqual([]);
    });
  });

  describe('getSessionsByProject', () => {
    it('returns sessions ordered by start_time DESC', () => {
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 's1' }),
        analysis: makeAnalysis({ start_time: '2026-03-19T10:00:00Z' }),
        session: makeSession({ id: 's1' }),
      }));
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 's2' }),
        analysis: makeAnalysis({ start_time: '2026-03-21T10:00:00Z' }),
        session: makeSession({ id: 's2' }),
      }));

      const rows = getSessionsByProject(db, '-Users-test-Dev-myapp');
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('s2');
      expect(rows[1].id).toBe('s1');
    });

    it('returns empty array for unknown project', () => {
      expect(getSessionsByProject(db, 'unknown')).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('removes session from all tables', () => {
      indexSession(db, makeUpsertInput(), makeTurns());
      expect(getSessionCount(db)).toBe(1);

      deleteSession(db, 'test-session-1');

      expect(getSessionRow(db, 'test-session-1')).toBeNull();
      expect(getSessionCount(db)).toBe(0);

      const ftsCount = db.prepare('SELECT COUNT(*) as c FROM sessions_fts WHERE session_id = ?')
        .get('test-session-1') as { c: number };
      expect(ftsCount.c).toBe(0);

      const fileCount = db.prepare('SELECT COUNT(*) as c FROM session_files WHERE session_id = ?')
        .get('test-session-1') as { c: number };
      expect(fileCount.c).toBe(0);
    });
  });

  describe('rebuildIndex', () => {
    it('clears all data from all tables', () => {
      indexSession(db, makeUpsertInput(), makeTurns());
      expect(getSessionCount(db)).toBe(1);

      rebuildIndex(db);

      expect(getSessionCount(db)).toBe(0);
    });

    it('calls progress callback', () => {
      let called = false;
      rebuildIndex(db, () => { called = true; });
      expect(called).toBe(true);
    });
  });

  describe('isSessionStale', () => {
    it('returns true for session not in DB', () => {
      expect(isSessionStale(db, 'nonexistent', '/tmp/fake.jsonl')).toBe(true);
    });

    it('returns true when file cannot be stat-ed', () => {
      upsertSession(db, makeUpsertInput());
      expect(isSessionStale(db, 'test-session-1', '/tmp/does-not-exist.jsonl')).toBe(true);
    });

    it('returns false when mtime and size match', () => {
      // Create a real temp file to stat
      const filePath = join(tmpDir, 'session.jsonl');
      writeFileSync(filePath, '{"test": true}\n');
      const { mtimeMs, size } = require('node:fs').statSync(filePath);

      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ path: filePath }),
        fileMtime: mtimeMs,
        fileSize: size,
      }));

      expect(isSessionStale(db, 'test-session-1', filePath)).toBe(false);
    });

    it('returns true when file size changes', () => {
      const filePath = join(tmpDir, 'session.jsonl');
      writeFileSync(filePath, '{"test": true}\n');
      const { mtimeMs } = require('node:fs').statSync(filePath);

      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ path: filePath }),
        fileMtime: mtimeMs,
        fileSize: 1, // Wrong size
      }));

      expect(isSessionStale(db, 'test-session-1', filePath)).toBe(true);
    });
  });

  describe('searchFts', () => {
    it('returns matching sessions with snippets', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionContent(db, 'test-session-1', makeTurns());

      const results = searchFts(db, 'authentication');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sessionId).toBe('test-session-1');
      expect(results[0].snippet).toBeTruthy();
    });

    it('returns empty array for no matches', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionContent(db, 'test-session-1', makeTurns());

      const results = searchFts(db, 'xyznonexistent');
      expect(results).toEqual([]);
    });

    it('respects limit parameter', () => {
      // Index two sessions
      upsertSession(db, makeUpsertInput());
      indexSessionContent(db, 'test-session-1', makeTurns());

      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'test-session-2' }),
        session: makeSession({ id: 'test-session-2' }),
      }));
      indexSessionContent(db, 'test-session-2', makeTurns());

      const results = searchFts(db, 'authentication', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('searchByFile', () => {
    it('finds sessions that touched a file', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionFiles(db, 'test-session-1', [
        { path: 'src/auth.ts', additions: 50, deletions: 5 },
        { path: 'src/index.ts', additions: 10, deletions: 2 },
      ]);

      const results = searchByFile(db, 'auth.ts');
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('test-session-1');
      expect(results[0].additions).toBe(50);
    });

    it('matches partial file paths', () => {
      upsertSession(db, makeUpsertInput());
      indexSessionFiles(db, 'test-session-1', [
        { path: 'src/middleware/auth.ts', additions: 30, deletions: 5 },
      ]);

      const results = searchByFile(db, 'auth');
      expect(results).toHaveLength(1);
    });
  });

  describe('cleanupOrphanedSessions', () => {
    it('never deletes sessions — DB is the archive', () => {
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ path: '/tmp/gone-forever.jsonl' }),
      }));
      expect(getSessionCount(db)).toBe(1);

      // Source file is gone, but cleanup should NOT delete — the DB preserves it
      const removed = cleanupOrphanedSessions(db);
      expect(removed).toBe(0);
      expect(getSessionCount(db)).toBe(1);
    });

    it('countPreservedSessions reports sessions whose source is gone', () => {
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ path: '/tmp/gone-forever.jsonl' }),
      }));

      const preserved = countPreservedSessions(db);
      expect(preserved).toBe(1);
    });
  });

  describe('getSessionCount', () => {
    it('returns 0 for empty database', () => {
      expect(getSessionCount(db)).toBe(0);
    });

    it('counts all sessions', () => {
      upsertSession(db, makeUpsertInput());
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 's2' }),
        session: makeSession({ id: 's2' }),
      }));
      expect(getSessionCount(db)).toBe(2);
    });
  });

  describe('context_summary column', () => {
    it('stores context_summary when provided', () => {
      const summary = '# Session: Fix auth middleware\nProject: myapp | Source: Claude Code';
      upsertSession(db, makeUpsertInput({ contextSummary: summary }));

      const row = getSessionRow(db, 'test-session-1');
      expect(row!.context_summary).toBe(summary);
    });

    it('stores null when context_summary not provided', () => {
      upsertSession(db, makeUpsertInput());

      const row = getSessionRow(db, 'test-session-1');
      expect(row!.context_summary).toBeNull();
    });

    it('updates context_summary on re-index', () => {
      upsertSession(db, makeUpsertInput({ contextSummary: 'old summary' }));
      upsertSession(db, makeUpsertInput({ contextSummary: 'new summary' }));

      const row = getSessionRow(db, 'test-session-1');
      expect(row!.context_summary).toBe('new summary');
    });
  });

  describe('getDashboardStats', () => {
    it('returns zeros for empty database', () => {
      const stats = getDashboardStats(db);
      expect(stats.sessionCount).toBe(0);
      expect(stats.projectCount).toBe(0);
      expect(stats.sourceCount).toBe(0);
      expect(stats.projects).toEqual([]);
    });

    it('returns correct counts with sessions', () => {
      upsertSession(db, makeUpsertInput());
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'test-session-2', projectDir: '-Users-test-Dev-otherapp' }),
        analysis: makeAnalysis({ source: 'cursor', start_time: '2026-03-21T10:00:00Z' }),
        session: makeSession({ id: 'test-session-2', projectName: 'otherapp', skills: ['Go'] }),
      }));

      const stats = getDashboardStats(db);
      expect(stats.sessionCount).toBe(2);
      expect(stats.projectCount).toBe(2);
      expect(stats.sourceCount).toBe(2); // claude + cursor
      expect(stats.projects).toHaveLength(2);
    });

    it('excludes subagent sessions from counts', () => {
      upsertSession(db, makeUpsertInput());
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'child-1', isSubagent: true }),
        session: makeSession({ id: 'child-1' }),
      }));

      const stats = getDashboardStats(db);
      expect(stats.sessionCount).toBe(1);
      expect(stats.projects).toHaveLength(1);
      expect(stats.projects[0].sessionCount).toBe(1);
    });

    it('aggregates project-level stats correctly', () => {
      upsertSession(db, makeUpsertInput());
      upsertSession(db, makeUpsertInput({
        meta: makeMeta({ sessionId: 'test-session-2' }),
        analysis: makeAnalysis({
          start_time: '2026-03-21T10:00:00Z',
          loc_stats: { loc_added: 50, loc_removed: 10, loc_net: 40, files_changed: [] },
        }),
        session: makeSession({ id: 'test-session-2', turns: 5, skills: ['Docker'] }),
      }));

      const stats = getDashboardStats(db);
      expect(stats.projects).toHaveLength(1);
      expect(stats.projects[0].sessionCount).toBe(2);
      expect(stats.projects[0].totalLoc).toBe(180); // (100+20) + (50+10)
      expect(stats.projects[0].skills).toContain('TypeScript');
      expect(stats.projects[0].skills).toContain('Docker');
    });
  });

  describe('getContextSummary', () => {
    it('returns stored summary for a session', () => {
      const summary = '# Session: Fix auth\nProject: myapp';
      upsertSession(db, makeUpsertInput({ contextSummary: summary }));

      expect(getContextSummary(db, 'test-session-1')).toBe(summary);
    });

    it('returns null when no summary stored', () => {
      upsertSession(db, makeUpsertInput());

      expect(getContextSummary(db, 'test-session-1')).toBeNull();
    });

    it('returns null for nonexistent session', () => {
      expect(getContextSummary(db, 'nonexistent')).toBeNull();
    });
  });

});
