// SQLite search index for session archive
// Replaces stats-cache.json with a proper database layer

import Database from 'better-sqlite3';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionAnalysis } from './parsers/types.js';
import type { ParsedTurn, ParsedFileChange, Session } from './analyzer.js';
import type { SessionMeta } from './parsers/index.js';

// ── Constants ────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
export const DB_PATH = join(CONFIG_DIR, 'sessions.db');

const CURRENT_SCHEMA_VERSION = 2;

// ── Types ────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  project_dir: string;
  source: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  wall_clock_minutes: number | null;
  turns: number | null;
  loc_added: number | null;
  loc_removed: number | null;
  loc_net: number | null;
  files_changed: number | null;
  tool_calls: number | null;
  skills: string | null;       // JSON array
  files_touched: string | null; // JSON array
  models_used: string | null;   // JSON array
  cwd: string | null;
  parent_session_id: string | null;
  agent_role: string | null;
  is_subagent: number;
  file_path: string | null;
  file_mtime: number | null;
  file_size: number | null;
  indexed_at: string | null;
}

/** Stats shape compatible with the old SessionStats from server.ts */
export interface SessionStats {
  loc: number;
  duration: number;
  files: number;
  turns: number;
  skills: string[];
  date: string;
  endTime?: string;
}

export interface ProjectStats {
  projectDir: string;
  projectName: string;
  sessionCount: number;
  totalLoc: number;
  totalDuration: number;
  totalTurns: number;
  skills: string[];
  sources: string[];
  latestDate: string;
}

// ── Singleton ────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDatabase(dbPath: string = DB_PATH): Database.Database {
  if (_db) return _db;
  _db = openDatabase(dbPath);
  return _db;
}

export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ── Open / Migrate ───────────────────────────────────────────

export function openDatabase(dbPath: string = DB_PATH): Database.Database {
  mkdirSync(join(dbPath, '..'), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  // Create schema_version table if it doesn't exist
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)`);

  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    migrateToV1(db);
  }
}

function migrateToV1(db: Database.Database): void {
  // V1 is superseded by V2 — go straight to V2
  migrateToV2(db);
}

function migrateToV2(db: Database.Database): void {
  // Drop old tables if upgrading from v1
  db.exec('DROP TABLE IF EXISTS session_files');
  db.exec('DROP TABLE IF EXISTS sessions_fts');
  db.exec('DROP TABLE IF EXISTS sessions');

  const tx = db.transaction(() => {
    // F1: session_files gets composite PK
    // F2: ON DELETE CASCADE on all foreign keys
    // F5: NOT NULL DEFAULT on numeric columns
    // F7: role UNINDEXED in FTS5
    // F21: file_mtime as INTEGER not REAL
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        project_dir TEXT NOT NULL,
        source TEXT NOT NULL,
        title TEXT,
        start_time TEXT,
        end_time TEXT,
        duration_minutes REAL NOT NULL DEFAULT 0,
        wall_clock_minutes REAL NOT NULL DEFAULT 0,
        turns INTEGER NOT NULL DEFAULT 0,
        loc_added INTEGER NOT NULL DEFAULT 0,
        loc_removed INTEGER NOT NULL DEFAULT 0,
        loc_net INTEGER NOT NULL DEFAULT 0,
        files_changed INTEGER NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0,
        skills TEXT,
        files_touched TEXT,
        models_used TEXT,
        cwd TEXT,
        parent_session_id TEXT,
        agent_role TEXT,
        is_subagent INTEGER NOT NULL DEFAULT 0,
        file_path TEXT,
        file_mtime INTEGER,
        file_size INTEGER,
        indexed_at TEXT,
        FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    db.exec('CREATE INDEX idx_sessions_project ON sessions(project_dir)');
    db.exec('CREATE INDEX idx_sessions_source ON sessions(source)');
    db.exec('CREATE INDEX idx_sessions_start ON sessions(start_time)');
    db.exec('CREATE INDEX idx_sessions_parent ON sessions(parent_session_id)');

    db.exec(`
      CREATE VIRTUAL TABLE sessions_fts USING fts5(
        session_id UNINDEXED,
        role UNINDEXED,
        content,
        tokenize='porter unicode61'
      )
    `);

    db.exec(`
      CREATE TABLE session_files (
        session_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        additions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, file_path),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    db.exec('CREATE INDEX idx_session_files_path ON session_files(file_path)');

    // Upsert schema version
    const existing = db.prepare('SELECT version FROM schema_version LIMIT 1').get();
    if (existing) {
      db.prepare('UPDATE schema_version SET version = ?').run(CURRENT_SCHEMA_VERSION);
    } else {
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(CURRENT_SCHEMA_VERSION);
    }
  });
  tx();
}

// ── Staleness Check ──────────────────────────────────────────

export function isSessionStale(
  db: Database.Database,
  sessionId: string,
  filePath: string,
): boolean {
  const row = db.prepare(
    'SELECT file_mtime, file_size FROM sessions WHERE id = ?',
  ).get(sessionId) as { file_mtime: number | null; file_size: number | null } | undefined;

  if (!row) return true; // Not in DB — needs indexing

  // Skip stat for non-filesystem paths (e.g. cursor:// URLs) — F23 fix
  if (filePath.includes('://')) return true;

  try {
    const stat = statSync(filePath);
    // F21: Use Math.floor to avoid floating-point comparison issues
    const mtime = Math.floor(stat.mtimeMs);
    const size = stat.size;
    return mtime !== row.file_mtime || size !== row.file_size;
  } catch {
    return true; // Can't stat — re-index to be safe
  }
}

// ── Upsert Session ───────────────────────────────────────────

export interface UpsertSessionInput {
  meta: SessionMeta;
  analysis: SessionAnalysis;
  session: Session;
  fileMtime: number;
  fileSize: number;
}

export function upsertSession(db: Database.Database, input: UpsertSessionInput): void {
  const { meta, analysis, session, fileMtime, fileSize } = input;

  const stmt = db.prepare(`
    INSERT INTO sessions (
      id, project_dir, source, title, start_time, end_time,
      duration_minutes, wall_clock_minutes, turns, loc_added, loc_removed, loc_net,
      files_changed, tool_calls, skills, files_touched, models_used,
      cwd, parent_session_id, agent_role, is_subagent,
      file_path, file_mtime, file_size, indexed_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      project_dir = excluded.project_dir,
      source = excluded.source,
      title = excluded.title,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      duration_minutes = excluded.duration_minutes,
      wall_clock_minutes = excluded.wall_clock_minutes,
      turns = excluded.turns,
      loc_added = excluded.loc_added,
      loc_removed = excluded.loc_removed,
      loc_net = excluded.loc_net,
      files_changed = excluded.files_changed,
      tool_calls = excluded.tool_calls,
      skills = excluded.skills,
      files_touched = excluded.files_touched,
      models_used = excluded.models_used,
      cwd = excluded.cwd,
      parent_session_id = excluded.parent_session_id,
      agent_role = excluded.agent_role,
      is_subagent = excluded.is_subagent,
      file_path = excluded.file_path,
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      indexed_at = excluded.indexed_at
  `);

  stmt.run(
    meta.sessionId,
    meta.projectDir,
    analysis.source,
    session.title ?? null,
    analysis.start_time ?? null,
    analysis.end_time ?? null,
    session.durationMinutes,
    session.wallClockMinutes ?? null,
    session.turns,
    analysis.loc_stats.loc_added,
    analysis.loc_stats.loc_removed,
    analysis.loc_stats.loc_net,
    session.filesChanged.length,
    session.toolCalls,
    JSON.stringify(session.skills),
    JSON.stringify(analysis.files_touched),
    JSON.stringify(analysis.models_used ?? []),
    analysis.cwd ?? null,
    meta.parentSessionId ?? null,
    meta.agentRole ?? null,
    meta.isSubagent ? 1 : 0,
    meta.path,
    Math.floor(fileMtime),
    fileSize,
    new Date().toISOString(),
  );
}

// ── Index Session Content (FTS5) ─────────────────────────────

export function indexSessionContent(
  db: Database.Database,
  sessionId: string,
  turns: ParsedTurn[],
): void {
  // Clear existing FTS entries for this session
  db.prepare('DELETE FROM sessions_fts WHERE session_id = ?').run(sessionId);

  const insert = db.prepare(
    'INSERT INTO sessions_fts (session_id, role, content) VALUES (?, ?, ?)',
  );

  for (const turn of turns) {
    const role = turn.type === 'prompt' ? 'user' : turn.type === 'tool' ? 'tool' : 'assistant';
    const content = turn.content;
    if (content && content.length > 0) {
      insert.run(sessionId, role, content);
    }
  }
}

// ── Index Session Files ──────────────────────────────────────

export function indexSessionFiles(
  db: Database.Database,
  sessionId: string,
  files: ParsedFileChange[],
): void {
  db.prepare('DELETE FROM session_files WHERE session_id = ?').run(sessionId);

  const insert = db.prepare(
    'INSERT OR REPLACE INTO session_files (session_id, file_path, additions, deletions) VALUES (?, ?, ?, ?)',
  );

  for (const file of files) {
    insert.run(sessionId, file.path, file.additions, file.deletions);
  }
}

// ── Full Index Pipeline (transactional) ──────────────────────

export function indexSession(db: Database.Database, input: UpsertSessionInput, turns: ParsedTurn[]): void {
  const tx = db.transaction(() => {
    upsertSession(db, input);
    indexSessionContent(db, input.meta.sessionId, turns);
    indexSessionFiles(db, input.meta.sessionId, input.session.filesChanged);
  });
  tx();
}

// ── Read: Get Session Stats ──────────────────────────────────

export function getSessionStats(db: Database.Database, sessionId: string): SessionStats | null {
  const row = db.prepare(`
    SELECT
      id, start_time, end_time, duration_minutes, turns,
      loc_added, loc_removed, files_changed, skills
    FROM sessions WHERE id = ?
  `).get(sessionId) as SessionRow | undefined;

  if (!row) return null;

  const loc = (row.loc_added ?? 0) + (row.loc_removed ?? 0);
  const skills: string[] = row.skills ? JSON.parse(row.skills) : [];

  return {
    loc,
    duration: row.duration_minutes ?? 0,
    files: row.files_changed ?? 0,
    turns: row.turns ?? 0,
    skills,
    date: row.start_time ?? '',
    endTime: row.end_time ?? undefined,
  };
}

// ── Read: Get All Project Stats ──────────────────────────────

export function getAllProjectStats(db: Database.Database): ProjectStats[] {
  // F9: Single query — no N+1. Fetch aggregates and skills in one pass.
  const rows = db.prepare(`
    SELECT
      project_dir,
      COUNT(*) as session_count,
      COALESCE(SUM(loc_added + loc_removed), 0) as total_loc,
      COALESCE(SUM(duration_minutes), 0) as total_duration,
      COALESCE(SUM(turns), 0) as total_turns,
      MAX(start_time) as latest_date,
      GROUP_CONCAT(DISTINCT source) as sources
    FROM sessions
    WHERE is_subagent = 0
    GROUP BY project_dir
    ORDER BY latest_date DESC
  `).all() as Array<{
    project_dir: string;
    session_count: number;
    total_loc: number;
    total_duration: number;
    total_turns: number;
    latest_date: string | null;
    sources: string | null;
  }>;

  // Collect all skills in a single query, grouped by project
  const skillRows = db.prepare(
    'SELECT project_dir, skills FROM sessions WHERE skills IS NOT NULL AND is_subagent = 0',
  ).all() as Array<{ project_dir: string; skills: string }>;

  const skillsByProject = new Map<string, Set<string>>();
  for (const sr of skillRows) {
    const parsed: string[] = JSON.parse(sr.skills);
    if (!skillsByProject.has(sr.project_dir)) {
      skillsByProject.set(sr.project_dir, new Set());
    }
    const set = skillsByProject.get(sr.project_dir)!;
    for (const s of parsed) set.add(s);
  }

  return rows.map((row) => {
    const projectSkills = skillsByProject.get(row.project_dir);
    const projectName = row.project_dir.replace(/^-/, '').split('-').pop() ?? row.project_dir;

    return {
      projectDir: row.project_dir,
      projectName,
      sessionCount: row.session_count,
      totalLoc: row.total_loc,
      totalDuration: row.total_duration,
      totalTurns: row.total_turns,
      skills: projectSkills ? [...projectSkills].sort() : [],
      sources: row.sources ? row.sources.split(',') : [],
      latestDate: row.latest_date ?? '',
    };
  });
}

// ── Read: Get Session Row ────────────────────────────────────

export function getSessionRow(db: Database.Database, sessionId: string): SessionRow | null {
  return (db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow) ?? null;
}

// ── Read: List sessions by project ───────────────────────────

export function getSessionsByProject(db: Database.Database, projectDir: string): SessionRow[] {
  return db.prepare(
    'SELECT * FROM sessions WHERE project_dir = ? ORDER BY start_time DESC',
  ).all(projectDir) as SessionRow[];
}

// ── Delete ───────────────────────────────────────────────────

export function deleteSession(db: Database.Database, sessionId: string): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sessions_fts WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM session_files WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  });
  tx();
}

// ── Rebuild Index ────────────────────────────────────────────

export function rebuildIndex(
  db: Database.Database,
  onProgress?: (current: number, total: number) => void,
): void {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM sessions_fts');
    db.exec('DELETE FROM session_files');
    db.exec('DELETE FROM sessions');
  });
  tx();
  onProgress?.(0, 0);
}

/** F17: Merge FTS5 segments for better query performance. Call after bulk indexing. */
export function optimizeFtsIndex(db: Database.Database): void {
  db.exec("INSERT INTO sessions_fts(sessions_fts) VALUES('optimize')");
}

// ── Cleanup: remove sessions whose files no longer exist ─────

export function cleanupOrphanedSessions(db: Database.Database): number {
  const rows = db.prepare('SELECT id, file_path FROM sessions WHERE file_path IS NOT NULL').all() as Array<{
    id: string;
    file_path: string;
  }>;

  let removed = 0;
  for (const row of rows) {
    try {
      statSync(row.file_path);
    } catch {
      deleteSession(db, row.id);
      removed++;
    }
  }
  return removed;
}

// ── FTS5 Search ──────────────────────────────────────────────

export interface FtsSearchResult {
  sessionId: string;
  snippet: string;
  rank: number;
}

export function searchFts(
  db: Database.Database,
  query: string,
  limit: number = 50,
): FtsSearchResult[] {
  // Fetch a larger window of raw FTS matches, then deduplicate in JS.
  // We fetch limit*10 rows to ensure we get enough distinct sessions,
  // since a single session can have dozens of matching turns.
  const rawRows = db.prepare(`
    SELECT
      session_id,
      snippet(sessions_fts, 2, '<mark>', '</mark>', '...', 40) as snippet,
      rank
    FROM sessions_fts
    WHERE sessions_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit * 10) as Array<{
    session_id: string;
    snippet: string;
    rank: number;
  }>;

  // Deduplicate: keep best-ranking entry per session
  const bySession = new Map<string, { session_id: string; snippet: string; rank: number }>();
  for (const r of rawRows) {
    const existing = bySession.get(r.session_id);
    if (!existing || r.rank < existing.rank) {
      bySession.set(r.session_id, r);
    }
  }

  // Sort by rank and limit
  const rows = [...bySession.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);

  return rows.map((r) => ({
    sessionId: r.session_id,
    snippet: r.snippet,
    rank: r.rank,
  }));
}

// ── File Search ──────────────────────────────────────────────

export function searchByFile(
  db: Database.Database,
  filePath: string,
): Array<{ sessionId: string; additions: number; deletions: number }> {
  return db.prepare(`
    SELECT session_id as sessionId, additions, deletions
    FROM session_files
    WHERE file_path LIKE ?
  `).all(`%${filePath}%`) as Array<{
    sessionId: string;
    additions: number;
    deletions: number;
  }>;
}

// ── Session Count ────────────────────────────────────────────

export function getSessionCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  return row.count;
}
