// SQLite search index for session archive
// Replaces stats-cache.json with a proper database layer

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionAnalysis } from './parsers/types.js';
import type { ParsedTurn, ParsedFileChange, Session } from './analyzer.js';
import type { SessionMeta } from './parsers/index.js';

// ── Constants ────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.HEYIAM_DATA_DIR || join(homedir(), '.local', 'share', 'heyiam');
}
export function getDbPath(): string {
  return join(getDataDir(), 'sessions.db');
}

const CURRENT_SCHEMA_VERSION = 5;

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
  context_summary: string | null;
  active_intervals: string | null; // JSON array of [startMs, endMs] pairs
  input_tokens: number;
  output_tokens: number;
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
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ── Singleton ────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDatabase(dbPath: string = getDbPath()): Database.Database {
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

export function openDatabase(dbPath: string = getDbPath()): Database.Database {
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

  if (currentVersion < 2) {
    migrateToV2(db);
  }
  if (currentVersion < 3) {
    migrateToV3(db);
  }
  if (currentVersion < 4) {
    migrateToV4(db);
  }
  if (currentVersion < 5) {
    migrateToV5(db);
  }
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
        context_summary TEXT,
        active_intervals TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
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
      db.prepare('UPDATE schema_version SET version = ?').run(2);
    } else {
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(2);
    }
  });
  tx();
}

function migrateToV3(db: Database.Database): void {
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_uuids (
        project_dir TEXT PRIMARY KEY,
        uuid TEXT NOT NULL
      )
    `);

    db.prepare('UPDATE schema_version SET version = ?').run(3);
  });
  tx();
}

function migrateToV5(db: Database.Database): void {
  const tx = db.transaction(() => {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'input_tokens')) {
      db.exec('ALTER TABLE sessions ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0');
    }
    if (!cols.some(c => c.name === 'output_tokens')) {
      db.exec('ALTER TABLE sessions ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0');
    }
    db.prepare('UPDATE schema_version SET version = ?').run(5);
  });
  tx();
}

function migrateToV4(db: Database.Database): void {
  const tx = db.transaction(() => {
    // Add active_intervals column for overlap-aware human hours aggregation
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'active_intervals')) {
      db.exec('ALTER TABLE sessions ADD COLUMN active_intervals TEXT');
    }

    db.prepare('UPDATE schema_version SET version = ?').run(4);
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
  contextSummary?: string;
}

export function upsertSession(db: Database.Database, input: UpsertSessionInput): void {
  const { meta, analysis, session, fileMtime, fileSize } = input;

  const stmt = db.prepare(`
    INSERT INTO sessions (
      id, project_dir, source, title, start_time, end_time,
      duration_minutes, wall_clock_minutes, turns, loc_added, loc_removed, loc_net,
      files_changed, tool_calls, skills, files_touched, models_used,
      cwd, parent_session_id, agent_role, is_subagent,
      file_path, file_mtime, file_size, indexed_at, context_summary,
      active_intervals, input_tokens, output_tokens
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?
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
      indexed_at = excluded.indexed_at,
      context_summary = excluded.context_summary,
      active_intervals = excluded.active_intervals,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens
  `);

  stmt.run(
    meta.sessionId,
    meta.projectDir,
    analysis.source,
    session.title ?? null,
    analysis.start_time ?? null,
    analysis.end_time ?? null,
    session.durationMinutes,
    session.wallClockMinutes ?? 0,
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
    input.contextSummary ?? null,
    analysis.active_intervals?.length ? JSON.stringify(analysis.active_intervals) : null,
    session.tokenUsage?.input ?? 0,
    session.tokenUsage?.output ?? 0,
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

  // F8: Truncate content per turn to prevent FTS index bloat.
  // Tool outputs (file reads, command output) can be 50KB+ but are low-value for search.
  const MAX_CONTENT_CHARS = 10_000;

  for (const turn of turns) {
    const role = turn.type === 'prompt' ? 'user' : turn.type === 'tool' ? 'tool' : 'assistant';
    const content = turn.content;
    if (content && content.length > 0) {
      const truncated = content.length > MAX_CONTENT_CHARS
        ? content.slice(0, MAX_CONTENT_CHARS)
        : content;
      insert.run(sessionId, role, truncated);
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
      SUM(CASE WHEN is_subagent = 0 THEN 1 ELSE 0 END) as session_count,
      COALESCE(SUM(loc_added + loc_removed), 0) as total_loc,
      COALESCE(SUM(CASE WHEN is_subagent = 0 THEN duration_minutes ELSE 0 END), 0) as total_duration,
      COALESCE(SUM(CASE WHEN is_subagent = 0 THEN turns ELSE 0 END), 0) as total_turns,
      MAX(CASE WHEN is_subagent = 0 THEN start_time END) as latest_date,
      GROUP_CONCAT(DISTINCT source) as sources,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens
    FROM sessions
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
    total_input_tokens: number;
    total_output_tokens: number;
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
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
    };
  });
}

// ── Read: Get File Count Including Children ──────────────────

export function getFileCountWithChildren(db: Database.Database, sessionId: string): number {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT file_path) as c FROM session_files
    WHERE session_id IN (SELECT id FROM sessions WHERE id = ? OR parent_session_id = ?)
  `).get(sessionId, sessionId) as { c: number };
  return row.c;
}

// ── Read: Get Session Row ────────────────────────────────────

export function getSessionRow(db: Database.Database, sessionId: string): SessionRow | null {
  return (db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow) ?? null;
}

// ── Read: Get Context Summary ─────────────────────────────────

export function getContextSummary(db: Database.Database, sessionId: string): string | null {
  const row = db.prepare('SELECT context_summary FROM sessions WHERE id = ?').get(sessionId) as
    | { context_summary: string | null }
    | undefined;
  return row?.context_summary ?? null;
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

// ── Cleanup ──────────────────────────────────────────────────
//
// IMPORTANT: We do NOT delete sessions from the DB when the source file
// is gone. The DB IS the archive — if Claude Code deleted the original
// after 30 days, the DB row is the preserved copy. That's the whole
// point of the product.
//
// The only valid cleanup is removing sessions that the USER explicitly
// chose to delete, which would go through deleteSession() directly.

/** Count sessions whose source file no longer exists (preserved in DB). */
export function countPreservedSessions(db: Database.Database): number {
  const rows = db.prepare(
    "SELECT file_path FROM sessions WHERE file_path IS NOT NULL AND file_path NOT LIKE 'cursor://%'",
  ).all() as Array<{ file_path: string }>;

  let preserved = 0;
  for (const row of rows) {
    try {
      statSync(row.file_path);
    } catch {
      preserved++;
    }
  }
  return preserved;
}

// ── FTS5 Search ──────────────────────────────────────────────

export interface FtsSearchResult {
  sessionId: string;
  snippet: string;
  rank: number;
}

/**
 * Escape a user query for FTS5. Wraps each term in double quotes
 * to prevent FTS5 syntax injection (*, OR, NOT, NEAR, etc.).
 */
function escapeFtsQuery(raw: string): string {
  // Split on whitespace, quote each non-empty term
  const terms = raw.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return '""';
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
}

export function searchFts(
  db: Database.Database,
  query: string,
  limit: number = 50,
): FtsSearchResult[] {
  const safeQuery = escapeFtsQuery(query);

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
  `).all(safeQuery, limit * 10) as Array<{
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
  // Escape LIKE wildcards in user input
  const escaped = filePath.replace(/[%_]/g, (c) => `\\${c}`);
  return db.prepare(`
    SELECT session_id as sessionId, additions, deletions
    FROM session_files
    WHERE file_path LIKE ? ESCAPE '\\'
  `).all(`%${escaped}%`) as Array<{
    sessionId: string;
    additions: number;
    deletions: number;
  }>;
}

// ── Get All Sessions as SessionMeta (for getProjects) ────────

export interface SessionMetaFromDb {
  path: string;
  source: string;
  sessionId: string;
  projectDir: string;
  isSubagent: boolean;
  parentSessionId?: string;
  agentRole?: string;
}

export function getAllSessionMetas(db: Database.Database): SessionMetaFromDb[] {
  const rows = db.prepare(`
    SELECT id, file_path, source, project_dir, is_subagent, parent_session_id, agent_role
    FROM sessions
    ORDER BY project_dir, start_time
  `).all() as Array<{
    id: string;
    file_path: string | null;
    source: string;
    project_dir: string;
    is_subagent: number;
    parent_session_id: string | null;
    agent_role: string | null;
  }>;

  return rows.map((r) => ({
    path: r.file_path ?? '',
    source: r.source,
    sessionId: r.id,
    projectDir: r.project_dir,
    isSubagent: r.is_subagent === 1,
    parentSessionId: r.parent_session_id ?? undefined,
    agentRole: r.agent_role ?? undefined,
  }));
}

// ── Session Count ────────────────────────────────────────────

export function getSessionCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  return row.count;
}

// ── Dashboard Stats (single-query aggregate) ─────────────────

export interface DashboardStats {
  sessionCount: number;
  projectCount: number;
  sourceCount: number;
  projects: Array<{
    projectDir: string;
    projectName: string;
    sessionCount: number;
    totalLoc: number;
    totalDuration: number;
    skills: string[];
    latestDate: string;
  }>;
}

export function getDashboardStats(db: Database.Database): DashboardStats {
  const agg = db.prepare(`
    SELECT
      COUNT(*) as session_count,
      COUNT(DISTINCT project_dir) as project_count,
      COUNT(DISTINCT source) as source_count
    FROM sessions WHERE is_subagent = 0
  `).get() as { session_count: number; project_count: number; source_count: number };

  const projects = getAllProjectStats(db);

  return {
    sessionCount: agg.session_count,
    projectCount: agg.project_count,
    sourceCount: agg.source_count,
    projects: projects.map((p) => ({
      projectDir: p.projectDir,
      projectName: p.projectName,
      sessionCount: p.sessionCount,
      totalLoc: p.totalLoc,
      totalDuration: p.totalDuration,
      skills: p.skills,
      latestDate: p.latestDate,
    })),
  };
}

// ── Project UUIDs ────────────────────────────────────────────

/** Get or create a stable UUID for a project directory. */
export function getProjectUuid(db: Database.Database, projectDir: string): string {
  const row = db.prepare('SELECT uuid FROM project_uuids WHERE project_dir = ?').get(projectDir) as { uuid: string } | undefined;
  if (row) return row.uuid;

  const uuid = crypto.randomUUID();
  db.prepare('INSERT INTO project_uuids (project_dir, uuid) VALUES (?, ?)').run(projectDir, uuid);
  return uuid;
}
