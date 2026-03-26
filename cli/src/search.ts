// Search logic combining FTS5 content search with metadata filters

import type Database from 'better-sqlite3';
import { searchFts, type SessionRow, type FtsSearchResult } from './db.js';

// ── Types ────────────────────────────────────────────────────

export interface SearchFilters {
  project?: string;      // projectDir substring match
  source?: string;       // exact match: claude, cursor, codex, gemini
  after?: string;        // ISO date string
  before?: string;       // ISO date string
  skill?: string;        // skill name (checked against JSON array in skills column)
  file?: string;         // file path substring (uses session_files table)
  minDuration?: number;  // minimum duration in minutes
}

export interface SearchResult {
  sessionId: string;
  title: string;
  projectDir: string;
  projectName: string;   // decoded from projectDir
  source: string;
  date: string;
  durationMinutes: number;
  turns: number;
  linesOfCode: number;
  skills: string[];
  snippet: string;       // FTS5 highlighted snippet (empty if no text query)
  score: number;         // relevance rank
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Decode projectDir to a human-readable project name.
 * e.g. "-Users-test-Dev-myapp" → "Users/test/Dev/myapp"
 */
export function decodeProjectName(projectDir: string): string {
  return projectDir.replace(/^-/, '').replace(/-/g, '/');
}

function rowToResult(row: SessionRow, snippet: string, score: number): SearchResult {
  const skills: string[] = row.skills ? JSON.parse(row.skills) : [];
  return {
    sessionId: row.id,
    title: row.title ?? '',
    projectDir: row.project_dir,
    projectName: decodeProjectName(row.project_dir),
    source: row.source,
    date: row.start_time ?? '',
    durationMinutes: row.duration_minutes ?? 0,
    turns: row.turns ?? 0,
    linesOfCode: (row.loc_added ?? 0) + (row.loc_removed ?? 0),
    skills,
    snippet,
    score,
  };
}

// ── Main Search Function ─────────────────────────────────────

const MAX_RESULTS = 50;

export function searchSessions(
  db: Database.Database,
  query?: string,
  filters?: SearchFilters,
): SearchResult[] {
  if (query) {
    return searchWithFts(db, query, filters);
  }
  return searchWithFilters(db, filters);
}

// ── FTS path: query provided ─────────────────────────────────

function searchWithFts(
  db: Database.Database,
  query: string,
  filters?: SearchFilters,
): SearchResult[] {
  // FTS now returns deduplicated results (one per session, best rank)
  const ftsResults = searchFts(db, query, MAX_RESULTS * 3);

  if (ftsResults.length === 0) return [];

  // Fetch session rows for all matched IDs and apply metadata filters
  const results: SearchResult[] = [];
  const fileSessionIds = filters?.file ? getFileFilteredSessionIds(db, filters.file) : null;

  for (const fts of ftsResults) {
    if (fileSessionIds && !fileSessionIds.has(fts.sessionId)) continue;

    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(fts.sessionId) as SessionRow | undefined;
    if (!row) continue;

    if (!matchesFilters(row, filters)) continue;

    results.push(rowToResult(row, fts.snippet, fts.rank));
    if (results.length >= MAX_RESULTS) break;
  }

  // FTS results are already sorted by rank (lower = more relevant)
  return results;
}

// ── Filter-only path: no text query ──────────────────────────

function searchWithFilters(
  db: Database.Database,
  filters?: SearchFilters,
): SearchResult[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.project) {
    conditions.push('s.project_dir LIKE ?');
    params.push(`%${filters.project}%`);
  }

  if (filters?.source) {
    conditions.push('s.source = ?');
    params.push(filters.source);
  }

  if (filters?.after) {
    conditions.push('s.start_time >= ?');
    params.push(filters.after);
  }

  if (filters?.before) {
    conditions.push('s.start_time <= ?');
    params.push(filters.before);
  }

  if (filters?.minDuration) {
    conditions.push('s.duration_minutes >= ?');
    params.push(filters.minDuration);
  }

  if (filters?.skill) {
    // JSON array search — skills column stores e.g. '["TypeScript","Node.js"]'
    conditions.push('s.skills LIKE ?');
    params.push(`%"${filters.skill}"%`);
  }

  let sql: string;
  if (filters?.file) {
    sql = `
      SELECT DISTINCT s.*
      FROM sessions s
      JOIN session_files sf ON sf.session_id = s.id
      WHERE sf.file_path LIKE ?
      ${conditions.length ? 'AND ' + conditions.join(' AND ') : ''}
      ORDER BY s.start_time DESC
      LIMIT ?
    `;
    params.unshift(`%${filters.file}%`);
    params.push(MAX_RESULTS);
  } else {
    sql = `
      SELECT s.*
      FROM sessions s
      ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
      ORDER BY s.start_time DESC
      LIMIT ?
    `;
    params.push(MAX_RESULTS);
  }

  const rows = db.prepare(sql).all(...params) as SessionRow[];
  return rows.map((row, i) => rowToResult(row, '', i));
}

// ── Filter helpers ───────────────────────────────────────────

function matchesFilters(row: SessionRow, filters?: SearchFilters): boolean {
  if (!filters) return true;

  if (filters.project && !row.project_dir.includes(filters.project)) {
    return false;
  }

  if (filters.source && row.source !== filters.source) {
    return false;
  }

  if (filters.after && (row.start_time ?? '') < filters.after) {
    return false;
  }

  if (filters.before && (row.start_time ?? '') > filters.before) {
    return false;
  }

  if (filters.minDuration && (row.duration_minutes ?? 0) < filters.minDuration) {
    return false;
  }

  if (filters.skill) {
    const skills: string[] = row.skills ? JSON.parse(row.skills) : [];
    if (!skills.includes(filters.skill)) {
      return false;
    }
  }

  return true;
}

function getFileFilteredSessionIds(db: Database.Database, filePath: string): Set<string> {
  const rows = db.prepare(
    'SELECT DISTINCT session_id FROM session_files WHERE file_path LIKE ?',
  ).all(`%${filePath}%`) as Array<{ session_id: string }>;
  return new Set(rows.map((r) => r.session_id));
}
