/**
 * Shared context and helper functions used by all route modules.
 * Created during the server.ts refactor to avoid circular dependencies.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { listSessions, parseSession, type SessionMeta } from '../parsers/index.js';
import { bridgeToAnalyzer } from '../bridge.js';
import { analyzeSession, type Session } from '../analyzer.js';
import {
  loadEnhancedData, loadProjectEnhanceResult,
  getUploadedState,
} from '../settings.js';
import { archiveSessionFiles } from '../archive.js';
import {
  getDatabase, openDatabase,
  getSessionStats as dbGetSessionStats,
  getSessionCount,
  getAllSessionMetas,
  getDashboardStats,
  getAllProjectStats,
} from '../db.js';
import { ensureSessionIndexed } from '../sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ────────────────────────────────────────────────────

export interface ProjectInfo {
  name: string;
  dirName: string;
  sessionCount: number;
  sessions: SessionMeta[];
}

export interface SessionStats {
  loc: number;
  duration: number;
  files: number;
  turns: number;
  skills: string[];
  date: string;
  /** End time as ISO string (for interval merging of concurrent sessions) */
  endTime?: string;
}

// ── Pure helpers ─────────────────────────────────────────────

/**
 * Derive a human-readable project name from the encoded directory name.
 * "-Users-ben-Dev-heyi-am" -> "heyi-am"
 */
export function displayNameFromDir(dirName: string): string {
  const devIdx = dirName.indexOf('-Dev-');
  if (devIdx !== -1) {
    return dirName.slice(devIdx + 5);
  }
  const segments = dirName.split('-').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : dirName;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Route context factory ────────────────────────────────────

/**
 * RouteContext bundles the database handle and helper closures that
 * every router needs. Created once in createApp() and passed to each
 * router factory.
 */
export interface RouteContext {
  db: Database.Database;
  sessionsBasePath: string | undefined;
  getProjects: () => Promise<ProjectInfo[]>;
  loadSession: (sessionPath: string, projectName: string, sessionId: string) => Promise<Session>;
  getSessionStats: (meta: SessionMeta, projectName: string) => Promise<SessionStats>;
  mergeSessionIntervals: (stats: SessionStats[]) => number;
  getProjectWithStats: (proj: ProjectInfo) => Promise<Record<string, unknown>>;
  buildPreviewPage: (title: string, bodyHtml: string, banner?: string) => string;
}

export function createRouteContext(sessionsBasePath?: string, dbPath?: string): RouteContext {
  const db = dbPath ? openDatabase(dbPath) : getDatabase();

  // ── getProjects ──────────────────────────────────────────
  async function getProjects(basePath?: string): Promise<ProjectInfo[]> {
    // Fast path: read from SQLite when the DB is populated
    if (!basePath && getSessionCount(db) > 0) {
      return getProjectsFromDb();
    }

    // Slow path: filesystem scan (first run or custom basePath)
    const allSessions = await listSessions(basePath);

    if (!basePath) {
      const archiveResult = await archiveSessionFiles(allSessions);
      if (archiveResult.archived > 0) {
        console.log(`Preserved ${archiveResult.archived} sessions → ~/.config/heyiam/sessions/`);
      }
    }

    const byDir = new Map<string, SessionMeta[]>();
    for (const s of allSessions) {
      const existing = byDir.get(s.projectDir) ?? [];
      existing.push(s);
      byDir.set(s.projectDir, existing);
    }

    return [...byDir.entries()].map(([dirName, sessions]) => ({
      name: displayNameFromDir(dirName),
      dirName,
      sessionCount: sessions.length,
      sessions,
    }));
  }

  function getProjectsFromDb(): ProjectInfo[] {
    const metas = getAllSessionMetas(db);

    // Group by project, reconstruct children
    const byDir = new Map<string, SessionMeta[]>();
    const childrenMap = new Map<string, SessionMeta[]>();

    for (const m of metas) {
      const meta: SessionMeta = {
        path: m.path,
        source: m.source,
        sessionId: m.sessionId,
        projectDir: m.projectDir,
        isSubagent: m.isSubagent,
        parentSessionId: m.parentSessionId,
        agentRole: m.agentRole,
      };

      if (m.isSubagent && m.parentSessionId) {
        const children = childrenMap.get(m.parentSessionId) ?? [];
        children.push(meta);
        childrenMap.set(m.parentSessionId, children);
      }

      const existing = byDir.get(m.projectDir) ?? [];
      existing.push(meta);
      byDir.set(m.projectDir, existing);
    }

    // Attach children to parents
    for (const sessions of byDir.values()) {
      for (const s of sessions) {
        const children = childrenMap.get(s.sessionId);
        if (children) s.children = children;
      }
    }

    return [...byDir.entries()].map(([dirName, sessions]) => ({
      name: displayNameFromDir(dirName),
      dirName,
      sessionCount: sessions.length,
      sessions,
    }));
  }

  // ── loadSession ──────────────────────────────────────────
  function mergeEnhancedData(session: Session): Session {
    const enhanced = loadEnhancedData(session.id);
    if (!enhanced) return session;

    return {
      ...session,
      title: enhanced.title,
      developerTake: enhanced.developerTake,
      context: enhanced.context,
      skills: enhanced.skills,
      executionPath: enhanced.executionSteps.map((s) => ({
        stepNumber: s.stepNumber,
        title: s.title,
        description: s.body,
      })),
      qaPairs: enhanced.qaPairs,
      status: enhanced.uploaded ? 'uploaded' : 'enhanced',
      quickEnhanced: enhanced.quickEnhanced ?? false,
    };
  }

  async function loadSession(sessionPath: string, projectName: string, sessionId: string): Promise<Session> {
    const parsed = await parseSession(sessionPath);
    const analyzerInput = bridgeToAnalyzer(parsed, { sessionId, projectName });
    const session = analyzeSession(analyzerInput);
    return mergeEnhancedData(session);
  }

  // ── getSessionStats ──────────────────────────────────────
  async function getSessionStats(meta: SessionMeta, projectName: string): Promise<SessionStats> {
    try {
      await ensureSessionIndexed(db, meta, projectName);
    } catch { /* index failed -- fall through to fallback */ }

    const dbStats = dbGetSessionStats(db, meta.sessionId);
    if (dbStats) {
      let endTime = dbStats.endTime;
      if (!endTime && dbStats.date) {
        const mins = dbStats.duration ?? 0;
        if (mins > 0) {
          endTime = new Date(new Date(dbStats.date).getTime() + mins * 60_000).toISOString();
        }
      }
      return {
        loc: dbStats.loc,
        duration: dbStats.duration,
        files: dbStats.files,
        turns: dbStats.turns,
        skills: dbStats.skills,
        date: dbStats.date,
        endTime,
      };
    }

    // Fallback: parse on demand (shouldn't happen after ensureIndexed)
    try {
      const session = await loadSession(meta.path, projectName, meta.sessionId);
      let endTime = session.endTime;
      if (!endTime && session.date) {
        const mins = session.wallClockMinutes ?? session.durationMinutes ?? 0;
        if (mins > 0) {
          endTime = new Date(new Date(session.date).getTime() + mins * 60_000).toISOString();
        }
      }
      return {
        loc: session.linesOfCode ?? 0,
        duration: session.durationMinutes ?? 0,
        files: session.filesChanged?.length ?? 0,
        turns: session.turns ?? 0,
        skills: session.skills ?? [],
        date: session.date ?? '',
        endTime,
      };
    } catch {
      return { loc: 0, duration: 0, files: 0, turns: 0, skills: [], date: '' };
    }
  }

  // ── mergeSessionIntervals ────────────────────────────────
  function mergeSessionIntervals(stats: SessionStats[]): number {
    const intervals: Array<[number, number]> = [];
    let fallbackSum = 0;

    for (const st of stats) {
      if (st.date && st.endTime) {
        const start = new Date(st.date).getTime();
        const end = new Date(st.endTime).getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
          intervals.push([start, end]);
          continue;
        }
      }
      fallbackSum += st.duration;
    }

    if (intervals.length === 0) return fallbackSum;

    intervals.sort((a, b) => a[0] - b[0]);

    let totalMs = 0;
    let [curStart, curEnd] = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
      const [start, end] = intervals[i];
      if (start <= curEnd) {
        curEnd = Math.max(curEnd, end);
      } else {
        totalMs += curEnd - curStart;
        curStart = start;
        curEnd = end;
      }
    }
    totalMs += curEnd - curStart;

    return Math.round(totalMs / 60_000) + fallbackSum;
  }

  // ── getProjectWithStats ──────────────────────────────────

  // Cache of DB project stats, invalidated per request cycle
  let _dbProjectStatsCache: Map<string, ReturnType<typeof getAllProjectStats>[0]> | null = null;

  function getDbProjectStatsMap(): Map<string, ReturnType<typeof getAllProjectStats>[0]> {
    if (!_dbProjectStatsCache) {
      const stats = getAllProjectStats(db);
      _dbProjectStatsCache = new Map(stats.map((s) => [s.projectDir, s]));
      // Clear cache after this tick to avoid stale data across requests
      setTimeout(() => { _dbProjectStatsCache = null; }, 0);
    }
    return _dbProjectStatsCache;
  }

  async function getProjectWithStats(proj: ProjectInfo) {
    // Fast path: read aggregates from SQLite (single query, no per-session I/O)
    const statsMap = getDbProjectStatsMap();
    const dbStats = statsMap.get(proj.dirName);

    const published = getUploadedState(proj.dirName);
    const enhanceCache = loadProjectEnhanceResult(proj.dirName);

    if (dbStats) {
      // Compute agent duration from DB: sum of all session durations including subagents
      const agentRow = db.prepare(
        'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM sessions WHERE project_dir = ?',
      ).get(proj.dirName) as { total: number };

      return {
        name: proj.name,
        dirName: proj.dirName,
        sessionCount: dbStats.sessionCount,
        description: '',
        totalLoc: dbStats.totalLoc,
        totalDuration: dbStats.totalDuration,
        totalFiles: (db.prepare(
          'SELECT COUNT(DISTINCT file_path) as c FROM session_files WHERE session_id IN (SELECT id FROM sessions WHERE project_dir = ?)',
        ).get(proj.dirName) as { c: number }).c,
        skills: dbStats.skills,
        dateRange: (() => {
          const row = db.prepare(
            'SELECT MIN(start_time) as earliest, MAX(start_time) as latest FROM sessions WHERE project_dir = ? AND is_subagent = 0',
          ).get(proj.dirName) as { earliest: string | null; latest: string | null };
          return row?.earliest && row?.latest ? `${row.earliest}|${row.latest}` : '';
        })(),
        lastSessionDate: dbStats.latestDate,
        isUploaded: !!published,
        uploadedSessionCount: published?.uploadedSessions?.length ?? 0,
        uploadedSessions: published?.uploadedSessions ?? [],
        enhancedAt: enhanceCache?.enhancedAt ?? null,
        totalAgentDuration: agentRow.total,
      };
    }

    // Fallback: per-session stats (only if DB has no data for this project)
    const allStats = await Promise.all(
      proj.sessions.map((m) => getSessionStats(m, proj.name)),
    );

    const totalLoc = allStats.reduce((s, st) => s + st.loc, 0);
    const totalFiles = allStats.reduce((s, st) => s + st.files, 0);
    const totalDuration = allStats.reduce((s, st) => s + st.duration, 0);

    let totalAgentDuration = totalDuration;
    for (const meta of proj.sessions) {
      for (const child of meta.children ?? []) {
        const childStats = await getSessionStats(child, proj.name);
        totalAgentDuration += childStats.duration;
      }
    }

    const skillSet = new Set<string>();
    for (const st of allStats) {
      for (const sk of st.skills) skillSet.add(sk);
    }

    const dates = allStats.map((st) => st.date).filter(Boolean).sort();
    const firstDate = dates[0] ?? '';
    const lastDate = dates[dates.length - 1] ?? '';

    return {
      name: proj.name,
      dirName: proj.dirName,
      sessionCount: proj.sessionCount,
      description: '',
      totalLoc,
      totalDuration,
      totalFiles,
      skills: [...skillSet],
      dateRange: firstDate && lastDate ? `${firstDate}|${lastDate}` : '',
      lastSessionDate: lastDate,
      isUploaded: !!published,
      uploadedSessionCount: published?.uploadedSessions?.length ?? 0,
      uploadedSessions: published?.uploadedSessions ?? [],
      enhancedAt: enhanceCache?.enhancedAt ?? null,
      totalAgentDuration,
    };
  }

  // ── buildPreviewPage ─────────────────────────────────────
  function buildPreviewPage(title: string, bodyHtml: string, banner?: string): string {
    const appCssPath = path.resolve(__dirname, '..', '..', 'app', 'src', 'App.css');
    const indexCssPath = path.resolve(__dirname, '..', '..', 'app', 'src', 'index.css');
    let inlineCss = '';
    try { inlineCss += readFileSync(indexCssPath, 'utf-8'); } catch { /* */ }
    try { inlineCss += readFileSync(appCssPath, 'utf-8'); } catch { /* */ }
    const cssTag = `<style>${inlineCss}\n/* Preview override */\nbody { overflow: auto !important; min-height: auto !important; }\n#root { min-height: auto !important; }</style>`;
    const bannerHtml = banner
      ? `<div style="background: var(--primary, #084471); color: white; text-align: center; padding: 0.5rem; font-family: 'Inter', sans-serif; font-size: 0.75rem; letter-spacing: 0.05em;">${escapeHtml(banner)}</div>`
      : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="heyiam-api-base" content="/api" />
  <title>${escapeHtml(title)} — Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ${cssTag}
</head>
<body>
  ${bannerHtml}
  ${bodyHtml}
  <script src="/heyiam-mount.js"></script>
</body>
</html>`;
  }

  return {
    db,
    sessionsBasePath,
    getProjects: () => getProjects(sessionsBasePath),
    loadSession,
    getSessionStats,
    mergeSessionIntervals,
    getProjectWithStats,
    buildPreviewPage,
  };
}
