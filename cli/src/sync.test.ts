import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { writeFile, mkdir, rm, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from './db.js';
import { syncSessionIndex, quickSync, fullReindex, displayNameFromDir, ensureSessionIndexed, startFileWatcher, startCursorPolling, getSyncState, onSyncProgress, syncWithTracking } from './sync.js';
import type { RawEntry } from './parsers/types.js';
import type Database from 'better-sqlite3';

// ── Fixtures ─────────────────────────────────────────────────

function makeEntry(overrides: Partial<RawEntry> & { type: string }): RawEntry {
  return {
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: 'test-sync-001',
    version: '2.1.80',
    ...overrides,
  } as RawEntry;
}

const TEST_SESSION: RawEntry[] = [
  makeEntry({
    type: 'user',
    timestamp: '2026-03-20T10:00:00.000Z',
    message: { role: 'user', content: 'Implement the sync module' },
  }),
  makeEntry({
    type: 'assistant',
    timestamp: '2026-03-20T10:00:05.000Z',
    message: {
      role: 'assistant',
      model: 'claude-opus-4-6',
      id: 'msg_sync1',
      content: [{ type: 'text' as const, text: 'I will implement the sync module.' }],
    },
  }),
  makeEntry({
    type: 'system',
    subtype: 'turn_duration',
    timestamp: '2026-03-20T10:00:10.000Z',
    durationMs: 10000,
  }),
];

function toJsonl(entries: RawEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

// ── Setup ────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;
let db: Database.Database;

beforeAll(async () => {
  tmpDir = join(tmpdir(), `heyiam-sync-test-${Date.now()}`);
  dbPath = join(tmpDir, 'test-sync.db');

  const projectDir = join(tmpDir, '-Users-test-Dev-syncapp');
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'sync-001.jsonl'), toJsonl(TEST_SESSION));
  await writeFile(join(projectDir, 'sync-002.jsonl'), toJsonl(TEST_SESSION));

  db = openDatabase(dbPath);
});

afterAll(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────────

describe('getSyncState', () => {
  it('returns idle state initially', () => {
    const state = getSyncState();
    expect(state.status).toBe('idle');
    expect(state.phase).toBe('done');
    expect(state.current).toBe(0);
    expect(state.total).toBe(0);
    expect(state.result).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.finishedAt).toBeNull();
  });

  it('returns a copy, not the internal reference', () => {
    const a = getSyncState();
    const b = getSyncState();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('onSyncProgress', () => {
  it('listener receives state updates during syncWithTracking', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-sync-tracking.db'));
    const states: Array<{ status: string; phase: string }> = [];

    const unsub = onSyncProgress((state) => {
      states.push({ status: state.status, phase: state.phase });
    });

    await syncWithTracking(freshDb, tmpDir);

    unsub();
    freshDb.close();

    // Should have received at least: syncing/discovering, syncing/indexing, done/done
    expect(states.length).toBeGreaterThanOrEqual(3);
    expect(states[0]).toEqual({ status: 'syncing', phase: 'discovering' });
    expect(states.some((s) => s.phase === 'indexing')).toBe(true);
    expect(states[states.length - 1]).toEqual({ status: 'done', phase: 'done' });
  });

  it('unsubscribe stops further notifications', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-unsub.db'));
    const calls: number[] = [];
    let callCount = 0;

    const unsub = onSyncProgress(() => {
      callCount++;
      calls.push(callCount);
    });

    // Unsubscribe immediately before any sync
    unsub();

    await syncWithTracking(freshDb, tmpDir);
    freshDb.close();

    expect(calls).toHaveLength(0);
  });
});

describe('syncWithTracking', () => {
  it('updates sync state through discovering → indexing → done', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-tracking-phases.db'));
    const phases: string[] = [];

    const unsub = onSyncProgress((state) => {
      if (!phases.includes(state.phase)) phases.push(state.phase);
    });

    const result = await syncWithTracking(freshDb, tmpDir);

    unsub();

    expect(phases).toContain('discovering');
    expect(phases).toContain('indexing');
    expect(phases).toContain('done');

    // Result should match what syncSessionIndex returns
    expect(result.discovered).toBe(2);
    expect(result.indexed).toBe(2);
    expect(result.errors).toBe(0);

    // Final state should be done with the result attached
    const finalState = getSyncState();
    expect(finalState.status).toBe('done');
    expect(finalState.result).toEqual(result);
    expect(finalState.startedAt).toBeTypeOf('number');
    expect(finalState.finishedAt).toBeTypeOf('number');
    expect(finalState.finishedAt!).toBeGreaterThanOrEqual(finalState.startedAt!);

    freshDb.close();
  });

  it('tracks current/total progress during indexing', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-tracking-progress.db'));
    let maxCurrent = 0;
    let maxTotal = 0;

    const unsub = onSyncProgress((state) => {
      if (state.phase === 'indexing') {
        maxCurrent = Math.max(maxCurrent, state.current);
        maxTotal = Math.max(maxTotal, state.total);
      }
    });

    await syncWithTracking(freshDb, tmpDir);

    unsub();
    freshDb.close();

    expect(maxTotal).toBe(2); // 2 session files in tmpDir
    expect(maxCurrent).toBe(2); // should reach total
  });

  it('includes currentProject in state updates', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-tracking-project.db'));
    const projectNames = new Set<string>();

    const unsub = onSyncProgress((state) => {
      if (state.currentProject) {
        projectNames.add(state.currentProject);
      }
    });

    await syncWithTracking(freshDb, tmpDir);

    unsub();
    freshDb.close();

    expect(projectNames.size).toBeGreaterThan(0);
  });
});

describe('displayNameFromDir', () => {
  it('extracts name after -Dev-', () => {
    expect(displayNameFromDir('-Users-ben-Dev-heyi-am')).toBe('heyi-am');
  });

  it('falls back to last segment', () => {
    expect(displayNameFromDir('-home-user-myproject')).toBe('myproject');
  });
});

describe('syncSessionIndex', () => {
  it('discovers and indexes sessions', async () => {
    const result = await syncSessionIndex(db, tmpDir);

    expect(result.discovered).toBe(2);
    expect(result.indexed).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('skips already-indexed sessions on second run', async () => {
    const result = await syncSessionIndex(db, tmpDir);

    expect(result.discovered).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.indexed).toBe(0);
  });

  it('reports progress via callback', async () => {
    // Rebuild to clear, then sync with progress
    const freshDb = openDatabase(join(tmpDir, 'test-progress.db'));
    const phases: string[] = [];

    await syncSessionIndex(freshDb, tmpDir, (p) => {
      if (!phases.includes(p.phase)) phases.push(p.phase);
    });

    expect(phases).toContain('discovering');
    expect(phases).toContain('indexing');
    expect(phases).toContain('done');
    expect(phases).not.toContain('cleanup');

    freshDb.close();
  });

  it('includes currentProject in indexing progress events', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-project-names.db'));
    const projectNames: string[] = [];

    await syncSessionIndex(freshDb, tmpDir, (p) => {
      if (p.phase === 'indexing' && p.currentProject) {
        projectNames.push(p.currentProject);
      }
    });

    expect(projectNames.length).toBeGreaterThan(0);
    // All project names should be derived from the dir name
    for (const name of projectNames) {
      expect(name).toBeTruthy();
      expect(typeof name).toBe('string');
    }

    freshDb.close();
  });
});

describe('quickSync', () => {
  it('returns sync result', async () => {
    const result = await quickSync(db, tmpDir);
    expect(result.discovered).toBeGreaterThan(0);
  });
});

describe('fullReindex', () => {
  it('clears and rebuilds the index', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-reindex.db'));

    // First index
    await syncSessionIndex(freshDb, tmpDir);
    const count1 = (freshDb.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
    expect(count1).toBe(2);

    // Full reindex
    const result = await fullReindex(freshDb, tmpDir);
    expect(result.indexed).toBe(2);

    const count2 = (freshDb.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
    expect(count2).toBe(2);

    freshDb.close();
  });
});

describe('startFileWatcher', () => {
  it('returns a cleanup function that can be called without error', () => {
    const freshDb = openDatabase(join(tmpDir, 'test-watcher.db'));
    // startFileWatcher watches real home dirs — it won't find our tmp dir,
    // but it should not throw even when dirs don't exist
    const stop = startFileWatcher(freshDb);
    expect(typeof stop).toBe('function');
    stop();
    freshDb.close();
  });
});

describe('startCursorPolling', () => {
  it('returns a cleanup function and polls without error', async () => {
    const freshDb = openDatabase(join(tmpDir, 'test-cursor-poll.db'));
    // Cursor may or may not be installed — polling should not throw
    const stop = startCursorPolling(freshDb, 60_000);
    expect(typeof stop).toBe('function');
    // Give initial poll time to complete
    await new Promise((r) => setTimeout(r, 100));
    stop();
    freshDb.close();
  });
});

describe('syncSessionIndex preserves DB sessions when source files are deleted', () => {
  it('does not remove sessions from DB when their source files are gone', async () => {
    // Create a fresh DB and index a session
    const preserveDir = join(tmpDir, 'preserve-test');
    const projectDir = join(preserveDir, '-Users-test-Dev-preserveapp');
    await mkdir(projectDir, { recursive: true });

    const sessionPath = join(projectDir, 'preserve-001.jsonl');
    await writeFile(sessionPath, toJsonl(TEST_SESSION));

    const freshDb = openDatabase(join(tmpDir, 'test-preserve.db'));

    // First sync — indexes the session
    const result1 = await syncSessionIndex(freshDb, preserveDir);
    expect(result1.indexed).toBe(1);

    // Verify session is in DB
    const count1 = (freshDb.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
    expect(count1).toBe(1);

    // Delete the source file
    await rm(sessionPath);

    // Second sync — session file is gone, but DB should keep it
    const result2 = await syncSessionIndex(freshDb, preserveDir);
    // Session should still be in the DB (archive behavior)
    const count2 = (freshDb.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
    expect(count2).toBe(1);

    freshDb.close();
  });
});

describe('file watcher reindexes on change', () => {
  it('picks up a new session file written to a watched directory', async () => {
    // This test creates a temp dir structure, starts a watcher pointed at it,
    // writes a new session file, and verifies it gets indexed after debounce.
    const watchDir = join(tmpDir, 'watch-test');
    const projectDir = join(watchDir, '-Users-test-Dev-watchapp');
    await mkdir(projectDir, { recursive: true });

    const freshDb = openDatabase(join(tmpDir, 'test-watch-reindex.db'));

    // We can't easily point startFileWatcher at a custom dir,
    // so we test the underlying ensureSessionIndexed directly
    // to verify the indexing pipeline works for a new file
    const sessionPath = join(projectDir, 'watch-001.jsonl');
    await writeFile(sessionPath, toJsonl(TEST_SESSION));

    const meta = {
      path: sessionPath,
      source: 'claude',
      sessionId: 'watch-001',
      projectDir: '-Users-test-Dev-watchapp',
      isSubagent: false,
    };

    const indexed = await ensureSessionIndexed(freshDb, meta, 'watchapp');
    expect(indexed).toBe(true);

    // Second call should skip (not stale)
    const skipped = await ensureSessionIndexed(freshDb, meta, 'watchapp');
    expect(skipped).toBe(false);

    // Modify the file — should re-index
    await appendFile(sessionPath, JSON.stringify(makeEntry({
      type: 'user',
      timestamp: '2026-03-20T10:01:00.000Z',
      message: { role: 'user', content: 'Another message' },
    })) + '\n');

    const reindexed = await ensureSessionIndexed(freshDb, meta, 'watchapp');
    expect(reindexed).toBe(true);

    freshDb.close();
  });
});
