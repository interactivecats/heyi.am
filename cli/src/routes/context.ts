/**
 * Shared context and helper functions used by all route modules.
 * Created during the server.ts refactor to avoid circular dependencies.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { listSessions, parseSession, type SessionMeta } from '../parsers/index.js';
import { bridgeToAnalyzer, mergeActiveIntervals, sumIntervalMs } from '../bridge.js';
import { analyzeSession, type Session, type AgentChild } from '../analyzer.js';
import {
  loadEnhancedData, loadProjectEnhanceResult,
  getUploadedState,
} from '../settings.js';
import { getTemplateCss } from '../render/templates.js';
import { archiveSessionFiles } from '../archive.js';
import {
  getDatabase, openDatabase,
  getSessionStats as dbGetSessionStats,
  getSessionCount,
  getAllSessionMetas,
  getAllProjectStats,
  getSessionsByProject,
  getProjectUuid,
} from '../db.js';
import { ensureSessionIndexed, displayNameFromDir } from '../sync.js';

export { displayNameFromDir };

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
 * Compute merged human-hours duration for a project by reading active_intervals
 * from the DB and merging overlapping intervals across non-subagent sessions.
 * Falls back to the provided naiveSumMinutes when intervals are not available (pre-v4 data).
 */
function computeMergedDurationFromDb(
  db: Database.Database,
  projectDir: string,
  naiveSumMinutes: number,
): number {
  const rows = db.prepare(
    'SELECT active_intervals FROM sessions WHERE project_dir = ? AND is_subagent = 0 AND active_intervals IS NOT NULL',
  ).all(projectDir) as Array<{ active_intervals: string }>;

  if (rows.length === 0) return naiveSumMinutes;

  const allIntervals: [number, number][] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.active_intervals) as [number, number][];
      allIntervals.push(...parsed);
    } catch { /* skip malformed */ }
  }

  if (allIntervals.length === 0) return naiveSumMinutes;

  const merged = mergeActiveIntervals(allIntervals);
  const mergedMinutes = Math.round(sumIntervalMs(merged) / 60_000);
  return mergedMinutes > 0 ? mergedMinutes : naiveSumMinutes;
}

import { escapeHtml } from '../format-utils.js';

/** Look up a project by name or dirName, sending 404 if not found. Returns null on miss. */
export async function requireProject(
  ctx: RouteContext,
  projectParam: string,
  res: import('express').Response,
): Promise<ProjectInfo | null> {
  const projects = await ctx.getProjects();
  const proj = projects.find((p) => p.name === projectParam || p.dirName === projectParam);
  if (!proj) {
    res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
    return null;
  }
  return proj;
}

export interface AgentSummary {
  is_orchestrated: true;
  agents: Array<{ role: string; duration_minutes: number; loc_changed: number }>;
}

/**
 * Build an agent summary from child session metas. Returns null when
 * there are no children (or none produce valid stats).
 *
 * @param childMetas  - Array of child SessionMeta objects
 * @param resolveStats - Async function that returns { duration, loc } for a child meta
 * @param options.deduplicate - When true, only the first occurrence of each role is kept
 */
export async function buildAgentSummary(
  childMetas: SessionMeta[],
  resolveStats: (child: SessionMeta) => Promise<{ duration: number; loc: number }>,
  options?: { deduplicate?: boolean },
): Promise<AgentSummary | null> {
  if (childMetas.length === 0) return null;

  const deduplicate = options?.deduplicate ?? false;
  const seenRoles = new Set<string>();
  const agents: AgentSummary['agents'] = [];

  for (const c of childMetas) {
    if (deduplicate) {
      const key = c.agentRole ?? c.sessionId;
      if (seenRoles.has(key)) continue;
      seenRoles.add(key);
    }
    const childStats = await resolveStats(c);
    agents.push({
      role: c.agentRole ?? 'agent',
      duration_minutes: childStats.duration,
      loc_changed: childStats.loc,
    });
  }

  return agents.length > 0 ? { is_orchestrated: true, agents } : null;
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
  buildPreviewPage: (title: string, bodyHtml: string, banner?: string, templateName?: string) => string;
}

// ── Shared session builder ──────────────────────────────────

/**
 * Build the canonical session list for a project from DB rows + enhanced data.
 * Used by both the dashboard detail endpoint and the export routes so the two
 * never diverge.
 */
export function buildSessionList(
  db: Database.Database,
  dirName: string,
  projectName: string,
): Session[] {
  const dbSessions = getSessionsByProject(db, dirName);
  const parentRows = dbSessions.filter((r) => !r.is_subagent);

  // Build child map
  const childMap = new Map<string, AgentChild[]>();
  for (const r of dbSessions) {
    if (r.is_subagent && r.parent_session_id) {
      const children = childMap.get(r.parent_session_id) ?? [];
      children.push({
        sessionId: r.id,
        role: r.agent_role ?? 'agent',
        durationMinutes: r.duration_minutes ?? 0,
        linesOfCode: (r.loc_added ?? 0) + (r.loc_removed ?? 0),
        date: r.start_time ?? '',
      });
      childMap.set(r.parent_session_id, children);
    }
  }

  // Pre-load per-session file changes (parent + children, deduplicated by path)
  const fileStmt = db.prepare(`
    SELECT file_path, SUM(additions) as additions, SUM(deletions) as deletions
    FROM session_files
    WHERE session_id IN (
      SELECT id FROM sessions WHERE id = ? OR parent_session_id = ?
    )
    GROUP BY file_path
    ORDER BY (SUM(additions) + SUM(deletions)) DESC
    LIMIT 20
  `);

  return parentRows.map((r) => {
    const enhanced = loadEnhancedData(r.id);
    const children = childMap.get(r.id);
    const skills: string[] = enhanced?.skills ?? (r.skills ? JSON.parse(r.skills) : []);
    const locAdded = r.loc_added ?? 0;
    const locRemoved = r.loc_removed ?? 0;
    const childLoc = (children ?? []).reduce((s, c) => s + c.linesOfCode, 0);

    // File changes: parent + children, grouped by path
    const fileRows = fileStmt.all(r.id, r.id) as Array<{ file_path: string; additions: number; deletions: number }>;
    const filesChanged = fileRows.length > 0
      ? fileRows.map((f) => ({ path: f.file_path, additions: f.additions, deletions: f.deletions }))
      : (locAdded + childLoc > 0)
        ? [{ path: '(aggregate)', additions: locAdded, deletions: locRemoved }]
        : [];

    return {
      id: r.id,
      title: enhanced?.title ?? r.title ?? 'Untitled session',
      date: r.start_time ?? '',
      endTime: r.end_time ?? undefined,
      durationMinutes: r.duration_minutes ?? 0,
      wallClockMinutes: r.wall_clock_minutes ?? undefined,
      turns: r.turns ?? 0,
      linesOfCode: locAdded + locRemoved + (children ?? []).reduce((s, c) => s + c.linesOfCode, 0),
      filesChanged,
      status: (enhanced?.uploaded ? 'uploaded' : enhanced ? 'enhanced' : 'draft') as Session['status'],
      projectName,
      rawLog: [] as string[],
      skills,
      source: r.source,
      developerTake: enhanced?.developerTake,
      context: enhanced?.context,
      executionPath: enhanced?.executionSteps?.map((s) => ({
        stepNumber: s.stepNumber,
        title: s.title,
        description: s.body,
      })) ?? [],
      qaPairs: enhanced?.qaPairs,
      toolBreakdown: [],
      turnTimeline: [],
      toolCalls: r.tool_calls ?? 0,
      children,
      isOrchestrated: (children?.length ?? 0) > 0,
      childCount: children?.length ?? 0,
      ...(r.active_intervals ? {
        activeIntervals: JSON.parse(r.active_intervals) as [number, number][],
      } : {}),
      ...(r.input_tokens || r.output_tokens ? {
        tokenUsage: { input: r.input_tokens, output: r.output_tokens },
      } : {}),
    } satisfies Session & { childCount: number };
  });
}

/**
 * Build the full project detail response — identical data for both the
 * dashboard API endpoint and the HTML export. Single source of truth.
 */
export function buildProjectDetail(
  db: Database.Database,
  proj: ProjectInfo,
): { project: Record<string, unknown>; sessions: Session[]; enhanceCache: unknown } {
  const enhanceCache = loadProjectEnhanceResult(proj.dirName);
  const sessionStats = buildSessionList(db, proj.dirName, proj.name);

  const totalLoc = sessionStats.reduce((sum, s) => sum + (s.linesOfCode || 0), 0);
  // Merge overlapping active intervals for true human hours
  const naiveDuration = sessionStats.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalDuration = computeMergedDurationFromDb(db, proj.dirName, naiveDuration);
  const totalFiles = (db.prepare(
    'SELECT COUNT(DISTINCT file_path) as c FROM session_files WHERE session_id IN (SELECT id FROM sessions WHERE project_dir = ?)',
  ).get(proj.dirName) as { c: number }).c;
  const agentDurationRow = db.prepare(
    'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM sessions WHERE project_dir = ? AND is_subagent = 1',
  ).get(proj.dirName) as { total: number };
  const totalAgentDuration = totalDuration + agentDurationRow.total;
  const tokenRow = db.prepare(
    'SELECT COALESCE(SUM(input_tokens), 0) as input, COALESCE(SUM(output_tokens), 0) as output FROM sessions WHERE project_dir = ?',
  ).get(proj.dirName) as { input: number; output: number };
  const allSkills = [...new Set(sessionStats.flatMap((s) => s.skills || []))];

  const uploaded = getUploadedState(proj.dirName);
  const dates = sessionStats.map((s) => s.date).filter(Boolean).sort();

  return {
    project: {
      name: proj.name,
      dirName: proj.dirName,
      uuid: getProjectUuid(db, proj.dirName),
      sessionCount: proj.sessionCount,
      description: enhanceCache?.result?.narrative ?? '',
      totalLoc,
      totalDuration,
      totalFiles,
      totalAgentDuration: totalAgentDuration > totalDuration ? totalAgentDuration : undefined,
      skills: allSkills,
      dateRange: dates.length ? `${dates[0]}|${dates[dates.length - 1]}` : '',
      lastSessionDate: dates[dates.length - 1] || null,
      isUploaded: !!uploaded,
      uploadedSessionCount: uploaded?.uploadedSessions?.length || 0,
      enhancedAt: enhanceCache?.enhancedAt ?? null,
      totalInputTokens: tokenRow.input,
      totalOutputTokens: tokenRow.output,
    },
    sessions: sessionStats.filter((s) => s.date),
    enhanceCache: enhanceCache ?? null,
  };
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
        console.log(`Preserved ${archiveResult.archived} sessions → ~/.local/share/heyiam/sessions/`);
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
      sessionCount: sessions.filter((s) => !s.isSubagent).length,
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
      sessionCount: sessions.filter(s => !s.isSubagent).length,
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

      // Merge overlapping intervals for true human hours
      const mergedDuration = computeMergedDurationFromDb(db, proj.dirName, dbStats.totalDuration);

      return {
        name: proj.name,
        dirName: proj.dirName,
        sessionCount: dbStats.sessionCount,
        description: '',
        totalLoc: dbStats.totalLoc,
        totalDuration: mergedDuration,
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
        totalInputTokens: dbStats.totalInputTokens,
        totalOutputTokens: dbStats.totalOutputTokens,
      };
    }

    // Fallback: per-session stats (only if DB has no data for this project)
    const parentMetas = proj.sessions.filter(s => !s.isSubagent);
    const allStats = await Promise.all(
      parentMetas.map((m) => getSessionStats(m, proj.name)),
    );

    const totalLoc = allStats.reduce((s, st) => s + st.loc, 0);
    const totalFiles = (db.prepare(
      'SELECT COUNT(DISTINCT file_path) as c FROM session_files WHERE session_id IN (SELECT id FROM sessions WHERE project_dir = ?)',
    ).get(proj.dirName) as { c: number })?.c ?? allStats.reduce((s, st) => s + st.files, 0);
    const naiveDuration = allStats.reduce((s, st) => s + st.duration, 0);
    const totalDuration = computeMergedDurationFromDb(db, proj.dirName, naiveDuration);

    let totalAgentDuration = totalDuration;
    for (const meta of parentMetas) {
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
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  // ── buildPreviewPage ─────────────────────────────────────
  function buildPreviewPage(title: string, bodyHtml: string, banner?: string, templateName?: string): string {
    // Load full template CSS (base + template-specific) via the same path as the React embed
    const inlineCss = getTemplateCss(templateName || 'editorial');
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
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Newsreader:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
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
