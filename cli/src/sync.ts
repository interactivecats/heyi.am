// Sync — shared session indexing pipeline for both server and CLI
//
// The core loop: discover sessions → check staleness → parse/bridge/analyze → index into SQLite.
// Called by server.ts on startup and by CLI commands (search, context, reindex) standalone.

import type Database from 'better-sqlite3';
import { statSync, watch, type FSWatcher } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { listSessions, parseSession, encodeDirPath, type SessionMeta } from './parsers/index.js';
import { discoverCursorWorkspaces, listConversations } from './parsers/cursor.js';
import { bridgeToAnalyzer } from './bridge.js';
import { analyzeSession } from './analyzer.js';
import {
  isSessionStale, indexSession, getSessionCount,
  cleanupOrphanedSessions, rebuildIndex, deleteSession,
  optimizeFtsIndex,
  type UpsertSessionInput,
} from './db.js';
import { getArchiveDir } from './settings.js';

// ── Types ────────────────────────────────────────────────────

export interface SyncProgress {
  phase: 'discovering' | 'indexing' | 'cleanup' | 'done';
  current?: number;
  total?: number;
  sessionId?: string;
}

export interface SyncResult {
  discovered: number;
  indexed: number;
  skipped: number;
  orphansRemoved: number;
  errors: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

// ── Helpers ──────────────────────────────────────────────────

/** Derive a human-readable project name from the encoded directory name. */
export function displayNameFromDir(dirName: string): string {
  const devIdx = dirName.indexOf('-Dev-');
  if (devIdx !== -1) return dirName.slice(devIdx + 5);
  const segments = dirName.split('-').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : dirName;
}

/** Get file mtime and size, or zeros on error. */
function getFileStats(filePath: string): { mtime: number; size: number } {
  try {
    const stat = statSync(filePath);
    return { mtime: stat.mtimeMs, size: stat.size };
  } catch {
    return { mtime: 0, size: 0 };
  }
}

// ── Index a Single Session ───────────────────────────────────

/**
 * Index a single session if stale or missing from the DB.
 * Returns true if the session was (re-)indexed, false if skipped.
 */
export async function ensureSessionIndexed(
  db: Database.Database,
  meta: SessionMeta,
  projectName: string,
): Promise<boolean> {
  if (!isSessionStale(db, meta.sessionId, meta.path)) return false;

  const parsed = await parseSession(meta.path);
  const input = bridgeToAnalyzer(parsed, { sessionId: meta.sessionId, projectName });
  const session = analyzeSession(input);

  const { mtime, size } = getFileStats(meta.path);

  const upsertInput: UpsertSessionInput = {
    meta,
    analysis: parsed,
    session,
    fileMtime: mtime,
    fileSize: size,
  };

  indexSession(db, upsertInput, input.turns);
  return true;
}

// ── Full Sync ────────────────────────────────────────────────

/**
 * Discover all sessions and index any that are stale or missing.
 *
 * This is the main sync entry point — called by:
 * - `createApp()` in server.ts (on startup, with the server's DB)
 * - CLI commands in index.ts (search, context, reindex — standalone)
 *
 * @param db         Open SQLite database
 * @param basePath   Optional base path override (for tests)
 * @param onProgress Optional callback for progress reporting
 */
export async function syncSessionIndex(
  db: Database.Database,
  basePath?: string,
  onProgress?: SyncProgressCallback,
): Promise<SyncResult> {
  const result: SyncResult = {
    discovered: 0,
    indexed: 0,
    skipped: 0,
    orphansRemoved: 0,
    errors: 0,
  };

  // Phase 1: Discover sessions
  onProgress?.({ phase: 'discovering' });
  const allSessions = await listSessions(basePath);
  result.discovered = allSessions.length;

  // Phase 2: Index stale/missing sessions
  onProgress?.({ phase: 'indexing', current: 0, total: allSessions.length });

  for (let i = 0; i < allSessions.length; i++) {
    const meta = allSessions[i];
    const projectName = displayNameFromDir(meta.projectDir);

    try {
      const wasIndexed = await ensureSessionIndexed(db, meta, projectName);
      if (wasIndexed) {
        result.indexed++;
      } else {
        result.skipped++;
      }
    } catch {
      result.errors++;
    }

    onProgress?.({
      phase: 'indexing',
      current: i + 1,
      total: allSessions.length,
      sessionId: meta.sessionId,
    });
  }

  // Phase 3: Remove orphaned sessions (files deleted from disk)
  onProgress?.({ phase: 'cleanup' });
  result.orphansRemoved = cleanupOrphanedSessions(db);

  onProgress?.({ phase: 'done' });
  return result;
}

// ── Quick Sync (for CLI) ─────────────────────────────────────

/**
 * Lightweight sync: if the DB already has sessions, only re-index stale ones.
 * If the DB is empty (first run), do a full sync with progress reporting.
 *
 * Designed for CLI commands that need a populated DB but shouldn't
 * block for a full scan every time.
 */
export async function quickSync(
  db: Database.Database,
  basePath?: string,
  onProgress?: SyncProgressCallback,
): Promise<SyncResult> {
  const count = getSessionCount(db);

  if (count === 0) {
    // First run — full index with progress
    return syncSessionIndex(db, basePath, onProgress);
  }

  // Incremental: discover and index only stale sessions
  return syncSessionIndex(db, basePath, onProgress);
}

// ── Full Rebuild ─────────────────────────────────────────────

/**
 * Drop all indexed data and rebuild from scratch.
 * Used by `heyiam reindex` CLI command.
 */
export async function fullReindex(
  db: Database.Database,
  basePath?: string,
  onProgress?: SyncProgressCallback,
): Promise<SyncResult> {
  rebuildIndex(db);
  const result = await syncSessionIndex(db, basePath, onProgress);
  // F17: Optimize FTS5 segments after bulk rebuild
  optimizeFtsIndex(db);
  return result;
}

// ── File Watcher ─────────────────────────────────────────────

/** Debounce timers keyed by file path */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DEBOUNCE_MS = 5_000;

/**
 * Try to index a single changed JSONL file.
 * Derives sessionId and projectDir from the file path structure.
 */
async function handleFileChange(db: Database.Database, filePath: string): Promise<void> {
  if (!filePath.endsWith('.jsonl')) return;

  const sessionId = basename(filePath, '.jsonl');
  const projectDir = basename(dirname(filePath));
  const projectName = displayNameFromDir(projectDir);

  const meta: SessionMeta = {
    path: filePath,
    source: 'claude',
    sessionId,
    projectDir,
    isSubagent: false,
  };

  try {
    await ensureSessionIndexed(db, meta, projectName);
  } catch {
    // Parse/index failed — will be caught on next full sync
  }
}

/**
 * Start file watchers on known session source directories.
 * Watches for changes to JSONL files and re-indexes them with a 5s debounce.
 *
 * Returns a cleanup function that stops all watchers.
 */
export function startFileWatcher(db: Database.Database): () => void {
  const watchers: FSWatcher[] = [];

  const dirs = [
    // Claude Code live sessions
    join(homedir(), '.claude', 'projects'),
    // Claude Code archive
    getArchiveDir(),
    // Codex sessions
    join(homedir(), '.codex', 'sessions'),
    // Gemini sessions
    join(homedir(), '.gemini', 'tmp'),
  ];

  for (const dir of dirs) {
    try {
      const watcher = watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename || !filename.endsWith('.jsonl')) return;

        const fullPath = join(dir, filename);

        // Debounce: wait 5s after last change before re-indexing
        const existing = debounceTimers.get(fullPath);
        if (existing) clearTimeout(existing);

        debounceTimers.set(
          fullPath,
          setTimeout(() => {
            debounceTimers.delete(fullPath);
            handleFileChange(db, fullPath).catch(() => {});
          }, DEBOUNCE_MS),
        );
      });

      watchers.push(watcher);
    } catch {
      // Directory doesn't exist — skip silently
    }
  }

  return () => {
    for (const w of watchers) w.close();
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    debounceTimers.clear();
  };
}

// ── Cursor Polling ───────────────────────────────────────────

/**
 * Poll Cursor workspace DBs for new or updated conversations.
 * Cursor stores conversations in SQLite, so we can't use fs.watch.
 * Instead we poll at an interval and compare lastUpdatedAt values.
 *
 * Returns a cleanup function that stops polling.
 */
export function startCursorPolling(
  db: Database.Database,
  intervalMs: number = 30_000,
): () => void {
  // Track last-seen lastUpdatedAt per composerId
  const lastSeen = new Map<string, number>();

  async function poll(): Promise<void> {
    let workspaces;
    try {
      workspaces = await discoverCursorWorkspaces();
    } catch {
      return;
    }

    const CURSOR_DATA_CUTOFF = new Date('2025-09-01').getTime();

    for (const ws of workspaces) {
      const conversations = listConversations(ws);
      for (const conv of conversations) {
        if (!conv.name) continue;
        if (conv.createdAt < CURSOR_DATA_CUTOFF) continue;

        const prevUpdated = lastSeen.get(conv.composerId);
        const currentUpdated = conv.lastUpdatedAt ?? conv.createdAt;

        // Skip if we've seen this exact state before
        if (prevUpdated !== undefined && prevUpdated >= currentUpdated) continue;

        lastSeen.set(conv.composerId, currentUpdated);

        // Build the cursor:// URL the same way listSessions does
        const params = new URLSearchParams();
        if (conv.name) params.set('name', conv.name);
        if (conv.createdAt) params.set('createdAt', String(conv.createdAt));
        if (conv.lastUpdatedAt) params.set('lastUpdatedAt', String(conv.lastUpdatedAt));
        if (conv.totalLinesAdded) params.set('linesAdded', String(conv.totalLinesAdded));
        if (conv.totalLinesRemoved) params.set('linesRemoved', String(conv.totalLinesRemoved));

        const qs = params.toString();
        const meta: SessionMeta = {
          path: `cursor://${conv.composerId}${qs ? '?' + qs : ''}`,
          source: 'cursor',
          sessionId: conv.composerId,
          projectDir: encodeDirPath(ws.projectDir),
          isSubagent: false,
        };

        const projectName = displayNameFromDir(meta.projectDir);
        try {
          await ensureSessionIndexed(db, meta, projectName);
        } catch {
          // Will be caught on next full sync
        }
      }
    }
  }

  // Run initial poll immediately
  poll().catch(() => {});

  const timer = setInterval(() => {
    poll().catch(() => {});
  }, intervalMs);

  return () => {
    clearInterval(timer);
    lastSeen.clear();
  };
}
