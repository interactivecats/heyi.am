import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import { listSessions, parseSession, type SessionMeta } from './parsers/index.js';
import { bridgeToAnalyzer, bridgeChildSessions, aggregateChildStats, toAgentChild, type AgentChild } from './bridge.js';
import { analyzeSession, type Session } from './analyzer.js';
import { checkAuthStatus, getAuthToken, saveAuthToken } from './auth.js';
import { API_URL } from './config.js';
import { getProvider, getEnhanceMode } from './llm/index.js';
import { triageSessions, type SessionMetaWithStats } from './llm/triage.js';
import { enhanceProject, refineNarrative, type SessionSummary, type SkippedSessionMeta, type ProjectEnhanceResult } from './llm/project-enhance.js';
import { saveAnthropicApiKey, clearAnthropicApiKey, getAnthropicApiKey, saveEnhancedData, loadEnhancedData, deleteEnhancedData, loadFreshProjectEnhanceResult, saveProjectEnhanceResult, loadProjectEnhanceResult, buildProjectFingerprint, savePublishedState, getPublishedState } from './settings.js';
import { captureScreenshot } from './screenshot.js';
import { redactSession, redactText, scanTextSync, formatFindings, stripHomePathsInText } from './redact.js';
import { renderProjectHtml, renderSessionHtml, renderPortfolioHtml } from './render/index.js';
import { buildSessionRenderData, buildSessionCard, buildProjectRenderData } from './render/build-render-data.js';
import type { SessionCard } from './render/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Derive a human-readable project name from the encoded directory name.
// "-Users-ben-Dev-heyi-am" → "heyi-am"
// "-Users-ben-Dev-agent-sync" → "agent-sync"
// Heuristic: find "Dev-" prefix and take everything after it.
// Falls back to last path-like segment.
function displayNameFromDir(dirName: string): string {
  // Try to find a Dev- boundary (common pattern)
  const devIdx = dirName.indexOf('-Dev-');
  if (devIdx !== -1) {
    return dirName.slice(devIdx + 5); // everything after "-Dev-"
  }
  // Fallback: last hyphen-separated segment
  const segments = dirName.split('-').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : dirName;
}

interface ProjectInfo {
  name: string;
  dirName: string;
  sessionCount: number;
  sessions: SessionMeta[];
}

async function getProjects(basePath?: string): Promise<ProjectInfo[]> {
  const allSessions = await listSessions(basePath);

  // Group by projectDir (set by the scanner)
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

async function loadSession(sessionPath: string, projectName: string, sessionId: string): Promise<Session> {
  const parsed = await parseSession(sessionPath);
  const analyzerInput = bridgeToAnalyzer(parsed, { sessionId, projectName });
  const session = analyzeSession(analyzerInput);
  return mergeEnhancedData(session);
}

/** Merge locally-saved enhanced data into a session if it exists. */
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
    status: enhanced.uploaded ? 'published' : 'enhanced',
    quickEnhanced: enhanced.quickEnhanced ?? false,
  };
}

interface SessionStats {
  loc: number;
  duration: number;
  files: number;
  turns: number;
  skills: string[];
  date: string;
  /** End time as ISO string (for interval merging of concurrent sessions) */
  endTime?: string;
}

// ── Persistent stats cache ────────────────────────────────────
// Survives server restarts by writing to disk.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const STATS_CACHE_PATH = join(homedir(), '.config', 'heyiam', 'stats-cache.json');

// Bump this when parser logic changes to auto-invalidate stale cache entries.
const STATS_CACHE_VERSION = 7;

interface StatsCacheFile {
  version: number;
  entries: Record<string, SessionStats>;
}

function loadStatsCache(): Map<string, SessionStats> {
  try {
    if (!existsSync(STATS_CACHE_PATH)) return new Map();
    const raw = JSON.parse(readFileSync(STATS_CACHE_PATH, 'utf-8'));

    // Versioned format
    if (raw && typeof raw === 'object' && 'version' in raw) {
      const file = raw as StatsCacheFile;
      if (file.version !== STATS_CACHE_VERSION) return new Map(); // stale — rebuild
      return new Map(Object.entries(file.entries));
    }

    // Legacy unversioned format — discard
    return new Map();
  } catch {
    return new Map();
  }
}

function saveStatsCache(cache: Map<string, SessionStats>): void {
  try {
    const dir = join(homedir(), '.config', 'heyiam');
    mkdirSync(dir, { recursive: true });
    const file: StatsCacheFile = {
      version: STATS_CACHE_VERSION,
      entries: Object.fromEntries(cache),
    };
    writeFileSync(STATS_CACHE_PATH, JSON.stringify(file), { mode: 0o600 });
  } catch {
    // Non-critical — cache miss just means a slower first load
  }
}

export function createApp(sessionsBasePath?: string) {
  const app = express();

  // Stats cache — loaded from disk on startup, written back periodically
  const statsCache = loadStatsCache();
  let statsCacheDirty = false;

  // Flush dirty cache to disk every 10 seconds
  const flushInterval = setInterval(() => {
    if (statsCacheDirty) {
      saveStatsCache(statsCache);
      statsCacheDirty = false;
    }
  }, 10_000);
  // Don't let this interval keep the process alive
  flushInterval.unref?.();

  async function getSessionStats(meta: SessionMeta, projectName: string): Promise<SessionStats> {
    const cached = statsCache.get(meta.sessionId);
    if (cached) return cached;

    try {
      const session = await loadSession(meta.path, projectName, meta.sessionId);
      // Compute end time: prefer endTime, fall back to date + wallClock or duration
      let endTime = session.endTime;
      if (!endTime && session.date) {
        const mins = session.wallClockMinutes ?? session.durationMinutes ?? 0;
        if (mins > 0) {
          endTime = new Date(new Date(session.date).getTime() + mins * 60_000).toISOString();
        }
      }

      const stats: SessionStats = {
        loc: session.linesOfCode ?? 0,
        duration: session.durationMinutes ?? 0,
        files: session.filesChanged?.length ?? 0,
        turns: session.turns ?? 0,
        skills: session.skills ?? [],
        date: session.date ?? '',
        endTime,
      };
      statsCache.set(meta.sessionId, stats);
      statsCacheDirty = true;
      return stats;
    } catch {
      return { loc: 0, duration: 0, files: 0, turns: 0, skills: [], date: '' };
    }
  }

  /**
   * Merge overlapping session time intervals to compute real wall-clock developer time.
   * If two sessions overlap (running concurrently), that time is counted once.
   * Falls back to simple sum if timestamps are missing.
   */
  function mergeSessionIntervals(stats: SessionStats[]): number {
    // Build [start, end] intervals from sessions that have timestamps
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
      // No valid interval — add duration to fallback sum
      fallbackSum += st.duration;
    }

    if (intervals.length === 0) return fallbackSum;

    // Sort by start time
    intervals.sort((a, b) => a[0] - b[0]);

    // Merge overlapping intervals
    let totalMs = 0;
    let [curStart, curEnd] = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
      const [start, end] = intervals[i];
      if (start <= curEnd) {
        // Overlapping — extend current interval
        curEnd = Math.max(curEnd, end);
      } else {
        // Gap — flush current interval
        totalMs += curEnd - curStart;
        curStart = start;
        curEnd = end;
      }
    }
    totalMs += curEnd - curStart;

    return Math.round(totalMs / 60_000) + fallbackSum;
  }

  async function getProjectWithStats(proj: ProjectInfo) {
    const allStats = await Promise.all(
      proj.sessions.map((m) => getSessionStats(m, proj.name)),
    );

    const totalLoc = allStats.reduce((s, st) => s + st.loc, 0);
    const totalFiles = allStats.reduce((s, st) => s + st.files, 0);

    // Developer active time: sum of durationMinutes (already excludes idle gaps >5min).
    // We don't merge overlapping intervals here because durationMinutes is active time,
    // not wall-clock — if you're actively working two sessions concurrently, both count.
    const totalDuration = allStats.reduce((s, st) => s + st.duration, 0);

    // Agent time = every session's duration (the AI was working the whole time)
    // + child/subagent durations on top (additional parallel agent work).
    // Use raw sum, not merged intervals — each agent's work is real work.
    let totalAgentDuration = allStats.reduce((s, st) => s + st.duration, 0);
    for (const meta of proj.sessions) {
      for (const child of meta.children ?? []) {
        const childStats = await getSessionStats(child, proj.name);
        totalAgentDuration += childStats.duration;
      }
    }

    // Deduplicated skills across all sessions
    const skillSet = new Set<string>();
    for (const st of allStats) {
      for (const sk of st.skills) skillSet.add(sk);
    }

    // Date range
    const dates = allStats.map((st) => st.date).filter(Boolean).sort();
    const firstDate = dates[0] ?? '';
    const lastDate = dates[dates.length - 1] ?? '';

    const published = getPublishedState(proj.dirName);
    const enhanceCache = loadProjectEnhanceResult(proj.dirName);

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
      isPublished: !!published,
      publishedSessionCount: published?.publishedSessions.length ?? 0,
      publishedSessions: published?.publishedSessions ?? [],
      enhancedAt: enhanceCache?.enhancedAt ?? null,
      totalAgentDuration,
    };
  }

  app.use(cors({ origin: ['http://localhost:17845', 'http://127.0.0.1:17845'] }));
  app.use(express.json({ limit: '50mb' }));

  // API routes — wired to real parser pipeline
  app.get('/api/projects', async (_req: Request, res: Response) => {
    try {
      const projects = await getProjects(sessionsBasePath);
      const projectsWithStats = await Promise.all(
        projects.map((p) => getProjectWithStats(p)),
      );
      res.json({ projects: projectsWithStats });
    } catch (err) {
      res.status(500).json({ error: { code: 'SCAN_FAILED', message: (err as Error).message } });
    }
  });

  // ── Time stats — rich per-project agent breakdown ──────────
  app.get('/api/time-stats', async (_req: Request, res: Response) => {
    try {
      const projects = await getProjects(sessionsBasePath);

      const projectStats = await Promise.all(projects.map(async (proj) => {
        const parents = proj.sessions.filter(s => !s.isSubagent);
        let yourMinutes = 0;
        let agentMinutes = 0;
        let orchestratedCount = 0;
        let maxParallelAgents = 0;
        let totalChildAgents = 0;
        const roleSet = new Set<string>();

        for (const meta of parents) {
          const stats = await getSessionStats(meta, proj.name);
          const dur = stats.duration;
          yourMinutes += dur;
          agentMinutes += dur; // primary agent present every session

          const children = meta.children ?? [];
          if (children.length > 0) {
            orchestratedCount++;
            maxParallelAgents = Math.max(maxParallelAgents, children.length);
            totalChildAgents += children.length;
          }

          for (const child of children) {
            const childStats = await getSessionStats(child, proj.name);
            agentMinutes += childStats.duration;
            if (child.agentRole) roleSet.add(child.agentRole);
          }
        }

        if (yourMinutes === 0) return null;

        return {
          name: proj.name,
          dirName: proj.dirName,
          sessions: parents.length,
          yourMinutes,
          agentMinutes,
          orchestratedSessions: orchestratedCount,
          maxParallelAgents,
          avgAgentsPerSession: parents.length > 0
            ? +((totalChildAgents / parents.length) + 1).toFixed(1) // +1 for primary agent
            : 1,
          uniqueRoles: [...roleSet],
        };
      }));

      const results = projectStats.filter(Boolean);
      results.sort((a, b) => b!.agentMinutes - a!.agentMinutes);

      const totalYou = results.reduce((s, p) => s + p!.yourMinutes, 0);
      const totalAgent = results.reduce((s, p) => s + p!.agentMinutes, 0);
      const totalSessions = results.reduce((s, p) => s + p!.sessions, 0);

      res.json({
        projects: results,
        totals: {
          yourMinutes: totalYou,
          agentMinutes: totalAgent,
          sessions: totalSessions,
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'STATS_FAILED', message: (err as Error).message } });
    }
  });

  // Proxy publish time stats to Phoenix
  app.post('/api/publish-time-stats', async (req: Request, res: Response) => {
    const auth = getAuthToken();
    if (!auth) {
      res.status(401).json({ error: 'Authentication required. Run heyiam login first.' });
      return;
    }

    try {
      const phoenixRes = await fetch(`${API_URL}/api/time-stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify(req.body),
      });

      const result = await phoenixRes.json();
      res.status(phoenixRes.status).json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/projects/:project/sessions', async (req: Request, res: Response) => {
    try {
      const { project } = req.params;
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.json({ sessions: [] });
        return;
      }

      // Return parent sessions with enriched child summaries.
      // Children get stats via the cached getSessionStats — no redundant parsing.
      // If full parsing fails, fall back to a minimal session from stats.
      const sessions = await Promise.all(
        proj.sessions.map(async (meta) => {
          // Build child summaries (used by both full and fallback paths)
          // Deduplicate by sessionId (true duplicates), not by role
          const seenIds = new Set<string>();
          const children: AgentChild[] = [];
          for (const c of meta.children ?? []) {
            if (seenIds.has(c.sessionId)) continue;
            seenIds.add(c.sessionId);
            const childStats = await getSessionStats(c, proj.name);
            children.push({
              sessionId: c.sessionId,
              role: c.agentRole ?? 'agent',
              durationMinutes: childStats.duration,
              linesOfCode: childStats.loc,
              date: childStats.date,
            });
          }
          const childCount = children.length;

          try {
            const session = await loadSession(meta.path, proj.name, meta.sessionId);
            return { ...session, childCount, children: childCount > 0 ? children : undefined };
          } catch {
            // Full parse failed — build minimal session from stats so it still appears.
            // Use file mtime as fallback date so the session isn't filtered out.
            const stats = await getSessionStats(meta, proj.name);
            let fallbackDate = stats.date || '';
            if (!fallbackDate) {
              try {
                fallbackDate = statSync(meta.path).mtime.toISOString();
              } catch { /* file gone — will be filtered */ }
            }
            return {
              id: meta.sessionId,
              title: 'Untitled session',
              date: fallbackDate,
              durationMinutes: stats.duration,
              turns: stats.turns,
              linesOfCode: stats.loc,
              status: 'draft' as const,
              projectName: proj.name,
              rawLog: [] as string[],
              skills: stats.skills,
              source: meta.source,
              childCount,
              children: childCount > 0 ? children : undefined,
            };
          }
        }),
      );

      res.json({ sessions: sessions.filter((s) => s.date) });
    } catch (err) {
      res.status(500).json({ error: { code: 'LIST_FAILED', message: (err as Error).message } });
    }
  });

  app.get('/api/projects/:project/sessions/:id', async (req: Request, res: Response) => {
    try {
      const { project, id } = req.params;
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
        return;
      }

      const meta = proj.sessions.find((s) => s.sessionId === id);
      if (!meta) {
        res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const session = await loadSession(meta.path, proj.name, meta.sessionId);

      // Fully parse child sessions and map to canonical AgentChild shape
      const parsedChildren = await bridgeChildSessions(meta, proj.name);
      const children = parsedChildren.map(toAgentChild);
      const aggregated = children.length > 0 ? aggregateChildStats(parsedChildren) : undefined;

      res.json({
        session: {
          ...session,
          ...(children.length > 0 ? { children, isOrchestrated: true } : {}),
          ...(aggregated ? { aggregatedStats: aggregated } : {}),
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'PARSE_FAILED', message: (err as Error).message } });
    }
  });

  // Triage endpoint — AI selects which sessions are worth showcasing (SSE stream)
  app.post('/api/projects/:project/triage', async (req: Request, res: Response) => {
    if (!getAnthropicApiKey()) {
      res.status(400).json({ error: { code: 'NO_API_KEY', message: 'No Anthropic API key configured. Add one in Settings or set ANTHROPIC_API_KEY.' } });
      return;
    }

    const { project } = req.params;
    const projects = await getProjects(sessionsBasePath);
    const proj = projects.find((p) => p.name === project || p.dirName === project);
    if (!proj) {
      res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
      return;
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      // Build session metadata with stats for triage (sequential for progress)
      const total = proj.sessions.length;
      const sessionsWithStats: SessionMetaWithStats[] = [];
      for (let i = 0; i < proj.sessions.length; i++) {
        const meta = proj.sessions[i];
        send({ type: 'loading_stats', sessionId: meta.sessionId, index: i, total });
        const stats = await getSessionStats(meta, proj.name);
        sessionsWithStats.push({
          sessionId: meta.sessionId,
          path: meta.path,
          title: stats.date ? `Session ${meta.sessionId.slice(0, 8)}` : meta.sessionId,
          duration: stats.duration,
          loc: stats.loc,
          turns: stats.turns,
          files: stats.files,
          skills: stats.skills,
          date: stats.date,
        });
      }

      const useLLM = req.body?.useLLM !== false;
      const result = await triageSessions(sessionsWithStats, useLLM, (event) => {
        send(event as unknown as Record<string, unknown>);
      });

      // Include already-published sessions so frontend can pre-check them
      const published = getPublishedState(proj.dirName);
      const alreadyPublished = published?.publishedSessions ?? [];

      send({ type: 'result', ...result, alreadyPublished });
      res.end();
    } catch (err) {
      send({ type: 'error', code: 'TRIAGE_FAILED', message: (err as Error).message });
      res.end();
    }
  });

  // Git remote auto-detection — derives repo URL from project path
  app.get('/api/projects/:project/git-remote', async (req: Request, res: Response) => {
    try {
      const { project } = req.params;
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
        return;
      }

      // C2: The dirName encoding is lossy (both / and . become -), so we
      // can't decode it back to the original path. Instead, find the real
      // path by checking session cwd fields from parsed sessions.
      let projectPath: string | null = null;
      for (const meta of proj.sessions) {
        try {
          const parsed = await loadSession(meta.path, proj.name, meta.sessionId);
          if (parsed.cwd) {
            projectPath = parsed.cwd;
            break;
          }
        } catch { /* skip unparseable sessions */ }
      }

      let remoteUrl: string | null = null;
      if (projectPath) {
        try {
          const raw = execFileSync('git', ['-C', projectPath, 'remote', 'get-url', 'origin'], {
            timeout: 5000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();

          remoteUrl = raw
            .replace(/\.git$/, '')
            .replace(/^git@([^:]+):/, '$1/')
            .replace(/^https?:\/\//, '');
        } catch {
          // No git remote or not a git repo — return null
        }
      }

      res.json({ url: remoteUrl });
    } catch (err) {
      res.status(500).json({ error: { code: 'GIT_REMOTE_FAILED', message: (err as Error).message } });
    }
  });

  // Enhance endpoints — AI-powered session summarization
  // Uses provider abstraction: BYOK (local Anthropic SDK) or proxy (Phoenix backend)
  app.post('/api/projects/:project/sessions/:id/enhance', async (req: Request, res: Response) => {
    try {
      const { project, id } = req.params;
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
        return;
      }

      const meta = proj.sessions.find((s) => s.sessionId === id);
      if (!meta) {
        res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const session = await loadSession(meta.path, proj.name, meta.sessionId);
      const provider = getProvider();
      const result = await provider.enhance(session);

      // Auto-save enhanced data locally
      saveEnhancedData(id as string, result);
      console.log(`[enhance] Saved enhanced data for ${id}`);

      res.json({ result, provider: provider.name });
    } catch (err) {
      const error = err as Error & { code?: string };
      res.status(500).json({
        error: {
          code: error.code ?? 'ENHANCE_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Delete locally-saved enhanced data (allows re-enhancing)
  app.delete('/api/sessions/:id/enhanced', (_req: Request, res: Response) => {
    const { id } = _req.params;
    deleteEnhancedData(id as string);
    console.log(`[enhance] Deleted enhanced data for ${id}`);
    res.json({ ok: true });
  });

  // Enhancement status — returns current mode and remaining quota
  app.get('/api/enhance/status', async (_req: Request, res: Response) => {
    try {
      if (getAnthropicApiKey()) {
        res.json({ mode: 'local', remaining: null });
      } else {
        res.json({ mode: 'none', remaining: 0, message: 'No API key configured' });
      }
    } catch {
      res.json({ mode: 'unknown', remaining: null });
    }
  });

  // Save or clear the Anthropic API key
  app.post('/api/settings/api-key', express.json(), (req: Request, res: Response) => {
    const { apiKey } = req.body as { apiKey?: string };
    if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      saveAnthropicApiKey(apiKey.trim());
      console.log('[settings] API key saved');
      res.json({ ok: true, mode: getEnhanceMode() });
    } else {
      clearAnthropicApiKey();
      console.log('[settings] API key cleared');
      res.json({ ok: true, mode: getEnhanceMode() });
    }
  });

  // Get current API key status (masked)
  app.get('/api/settings/api-key', (_req: Request, res: Response) => {
    const key = getAnthropicApiKey();
    res.json({
      hasKey: !!key,
      maskedKey: key ? `${key.slice(0, 7)}...${key.slice(-4)}` : null,
    });
  });

  app.get('/api/auth/status', async (_req: Request, res: Response) => {
    try {
      const status = await checkAuthStatus(API_URL);
      console.log(`[auth/status] ${status.authenticated ? `authenticated as ${status.username}` : 'not authenticated'}`);
      res.json(status);
    } catch (err) {
      console.log(`[auth/status] check failed: ${err}`);
      res.json({ authenticated: false });
    }
  });

  // Start device auth flow — proxy to Phoenix
  app.post('/api/auth/login', async (_req: Request, res: Response) => {
    try {
      console.log(`[auth/login] Starting device auth via ${API_URL}/api/device/code`);
      const response = await fetch(`${API_URL}/api/device/code`, { method: 'POST' });
      if (!response.ok) {
        console.log(`[auth/login] FAILED ${response.status}`);
        res.status(response.status).json({ error: 'Failed to start device auth' });
        return;
      }
      const data = await response.json() as Record<string, unknown>;
      console.log(`[auth/login] Got code: ${data.user_code}, uri: ${data.verification_uri}`);
      res.json(data);
    } catch (err) {
      console.error('[auth/login] EXCEPTION:', err);
      res.status(500).json({ error: 'Device auth request failed' });
    }
  });

  // Poll for device authorization completion — client passes device_code
  app.post('/api/auth/poll', async (req: Request, res: Response) => {
    try {
      const deviceCode = req.body?.device_code as string | undefined;
      if (!deviceCode) {
        res.status(400).json({ error: 'Missing device_code' });
        return;
      }

      const response = await fetch(`${API_URL}/api/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });

      const data = await response.json() as Record<string, unknown>;

      if (response.ok && data.access_token) {
        saveAuthToken(data.access_token as string, data.username as string);
        res.json({ authenticated: true, username: data.username });
      } else {
        res.status(response.status).json(data);
      }
    } catch {
      res.status(500).json({ error: 'Poll failed' });
    }
  });

  // Project enhance — enhance selected sessions + generate project narrative
  // SSE streaming: session_progress, project_enhance, done events
  app.post('/api/projects/:project/enhance-project', async (req: Request, res: Response) => {
    const { project } = req.params;
    const { selectedSessionIds, skippedSessions, force } = req.body as {
      selectedSessionIds: string[];
      skippedSessions: SkippedSessionMeta[];
      force?: boolean;
    };

    if (!Array.isArray(selectedSessionIds) || selectedSessionIds.length === 0) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'selectedSessionIds must be a non-empty array' } });
      return;
    }

    if (!getAnthropicApiKey()) {
      res.status(400).json({ error: { code: 'NO_API_KEY', message: 'No Anthropic API key configured. Add one in Settings or set ANTHROPIC_API_KEY.' } });
      return;
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        send({ type: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
        res.end();
        return;
      }

      // Check for cached project enhance result (unless force re-enhance)
      if (!force) {
        const cached = loadFreshProjectEnhanceResult(proj.dirName, selectedSessionIds);
        if (cached) {
          send({ type: 'cached', enhancedAt: cached.enhancedAt });
          send({ type: 'done', result: cached.result });
          res.end();
          return;
        }
      }

      // Check if there's a stale cache (different fingerprint) — inform frontend
      const staleCache = loadProjectEnhanceResult(proj.dirName);
      if (staleCache) {
        const currentFp = buildProjectFingerprint(selectedSessionIds);
        if (staleCache.fingerprint !== currentFp) {
          send({ type: 'stale_cache', previousEnhancedAt: staleCache.enhancedAt });
        }
      }

      const provider = getProvider();

      // Step 1: Enhance each selected session (skip already-enhanced)
      const sessionSummaries: SessionSummary[] = [];
      const CONCURRENCY = 3;

      // Process sessions in batches of CONCURRENCY
      for (let i = 0; i < selectedSessionIds.length; i += CONCURRENCY) {
        const batch = selectedSessionIds.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (sessionId) => {
          const meta = proj.sessions.find((s) => s.sessionId === sessionId);
          if (!meta) return;

          // Check if already enhanced
          const existing = loadEnhancedData(sessionId);
          if (existing) {
            send({ type: 'session_progress', sessionId, status: 'skipped', title: existing.title, skills: existing.skills });
            sessionSummaries.push({
              sessionId,
              title: existing.title,
              developerTake: existing.developerTake,
              skills: existing.skills,
              executionSteps: existing.executionSteps.map((s) => ({ title: s.title, body: s.body })),
              duration: 0,
              loc: 0,
              turns: 0,
              files: 0,
              date: existing.enhancedAt,
            });
            return;
          }

          send({ type: 'session_progress', sessionId, status: 'enhancing' });

          try {
            const session = await loadSession(meta.path, proj.name, sessionId);
            const result = await provider.enhance(session);
            saveEnhancedData(sessionId, result);

            send({ type: 'session_progress', sessionId, status: 'done', title: result.title, skills: result.skills });

            sessionSummaries.push({
              sessionId,
              title: result.title,
              developerTake: result.developerTake,
              skills: result.skills,
              executionSteps: result.executionSteps.map((s) => ({ title: s.title, body: s.body })),
              duration: session.durationMinutes ?? 0,
              loc: session.linesOfCode ?? 0,
              turns: session.turns ?? 0,
              files: session.filesChanged?.length ?? 0,
              date: session.date ?? '',
            });
          } catch (err) {
            console.error(`[enhance-project] Session ${sessionId} failed:`, (err as Error).message);
            send({ type: 'session_progress', sessionId, status: 'failed', error: (err as Error).message });
          }
        }));
      }

      // Fill in stats for already-enhanced sessions that had zeroed stats
      for (const summary of sessionSummaries) {
        if (summary.duration === 0) {
          const meta = proj.sessions.find((s) => s.sessionId === summary.sessionId);
          if (meta) {
            const stats = await getSessionStats(meta, proj.name);
            summary.duration = stats.duration;
            summary.loc = stats.loc;
            summary.turns = stats.turns;
            summary.files = stats.files;
            summary.date = stats.date || summary.date;
            summary.correctionCount = undefined; // signals not available for cached
          }
        }
      }

      // Step 2: Generate project narrative (streaming narrative chunks)
      send({ type: 'project_enhance', status: 'generating' });

      const projectResult = await enhanceProject(sessionSummaries, skippedSessions ?? [], (event) => {
        send({ type: event.type, text: event.text });
      });

      // Save to cache for next time
      saveProjectEnhanceResult(proj.dirName, selectedSessionIds, projectResult);

      send({ type: 'done', result: projectResult });
      res.end();
    } catch (err) {
      console.error('[enhance-project] Failed:', (err as Error).message);
      send({ type: 'error', code: 'ENHANCE_FAILED', message: (err as Error).message });
      res.end();
    }
  });

  // Save project enhance result explicitly
  app.post('/api/projects/:project/enhance-save', async (req: Request, res: Response) => {
    const { project } = req.params;
    const { selectedSessionIds, result } = req.body as {
      selectedSessionIds: string[];
      result: ProjectEnhanceResult;
    };

    if (!Array.isArray(selectedSessionIds) || !result?.narrative) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'selectedSessionIds and result are required' } });
      return;
    }

    try {
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
        return;
      }

      saveProjectEnhanceResult(proj.dirName, selectedSessionIds, result);
      res.json({ saved: true, enhancedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: { code: 'SAVE_FAILED', message: (err as Error).message } });
    }
  });

  // Get cached project enhance result (if any)
  app.get('/api/projects/:project/enhance-cache', async (req: Request, res: Response) => {
    const { project } = req.params;
    try {
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
        return;
      }

      const cached = loadProjectEnhanceResult(proj.dirName);
      if (!cached) {
        res.status(404).json({ error: { code: 'NO_CACHE', message: 'No cached enhance result' } });
        return;
      }

      // Check freshness against current session set
      const currentFp = buildProjectFingerprint(cached.selectedSessionIds);
      const isFresh = cached.fingerprint === currentFp;

      res.json({
        ...cached,
        isFresh,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'CACHE_READ_FAILED', message: (err as Error).message } });
    }
  });

  // Render project preview HTML — returns the same body HTML that gets uploaded
  app.post('/api/projects/:project/render-preview', express.json(), async (req: Request, res: Response) => {
    try {
      const {
        username, slug, title, narrative, repoUrl, projectUrl,
        timeline, skills, totalSessions, totalLoc,
        totalDurationMinutes, totalAgentDurationMinutes, totalFilesChanged,
        sessionCards,
      } = req.body as {
        username: string;
        slug: string;
        title: string;
        narrative: string;
        repoUrl?: string;
        projectUrl?: string;
        timeline: Array<{ period: string; label: string; sessions: Array<Record<string, unknown>> }>;
        skills: string[];
        totalSessions: number;
        totalLoc: number;
        totalDurationMinutes: number;
        totalAgentDurationMinutes?: number;
        totalFilesChanged: number;
        sessionCards: SessionCard[];
      };

      const renderData = buildProjectRenderData({
        username: username || 'preview',
        slug, title, narrative,
        repoUrl, projectUrl,
        timeline: timeline || [],
        skills: skills || [],
        totalSessions: totalSessions || 0,
        totalLoc: totalLoc || 0,
        totalDurationMinutes: totalDurationMinutes || 0,
        totalAgentDurationMinutes,
        totalFilesChanged: totalFilesChanged || 0,
        sessionCards: sessionCards || [],
      });

      const html = renderProjectHtml(renderData);
      res.json({ html });
    } catch (err) {
      res.status(500).json({ error: { code: 'RENDER_FAILED', message: (err as Error).message } });
    }
  });

  // Upload screenshot manually (base64 image from browser)
  app.post('/api/projects/:project/screenshot-upload', async (req: Request, res: Response) => {
    const { project } = req.params;
    const auth = getAuthToken();
    if (!auth) { res.status(401).json({ error: 'Auth required' }); return; }

    const { image, slug } = req.body as { image: string; slug: string };
    if (!image) { res.status(400).json({ error: 'No image data' }); return; }

    const projectSlug = slug || String(project);
    try {
      // image is "data:image/png;base64,..." or raw base64
      const base64 = image.includes(',') ? image.split(',')[1] : image;
      const buffer = Buffer.from(base64, 'base64');
      const ext = image.startsWith('data:image/jpeg') || image.startsWith('data:image/jpg') ? 'jpg' : 'png';

      // Get presigned PUT URL
      const ssUrlRes = await fetch(`${API_URL}/api/projects/${projectSlug}/screenshot-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ ext }),
      });
      if (!ssUrlRes.ok) { res.status(502).json({ error: 'Presign failed' }); return; }

      const { upload_url, key } = await ssUrlRes.json() as { upload_url: string; key: string };

      // Upload to S3
      await fetch(upload_url, {
        method: 'PUT',
        body: buffer,
        headers: { 'Content-Type': `image/${ext}` },
      });

      // Update screenshot key in DB
      await fetch(`${API_URL}/api/projects/${projectSlug}/screenshot-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ key }),
      });

      res.json({ ok: true, key });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Auto-capture screenshot from URL using headless Chrome
  app.post('/api/projects/:project/screenshot-capture', async (req: Request, res: Response) => {
    const { project } = req.params;
    const auth = getAuthToken();
    if (!auth) { res.status(401).json({ error: 'Auth required' }); return; }

    const { url, slug } = req.body as { url: string; slug: string };
    if (!url) { res.status(400).json({ error: 'No URL provided' }); return; }

    const projectSlug = slug || String(project);
    try {
      const screenshotPath = await captureScreenshot(url, projectSlug);
      if (!screenshotPath) {
        res.status(422).json({ error: 'Chrome not available or capture failed' });
        return;
      }

      // Get presigned PUT URL
      const ssUrlRes = await fetch(`${API_URL}/api/projects/${projectSlug}/screenshot-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ ext: 'png' }),
      });
      if (!ssUrlRes.ok) { res.status(502).json({ error: 'Presign failed' }); return; }

      const { upload_url, key } = await ssUrlRes.json() as { upload_url: string; key: string };
      const imageData = readFileSync(screenshotPath);
      await fetch(upload_url, {
        method: 'PUT',
        body: imageData,
        headers: { 'Content-Type': 'image/png' },
      });

      // Update screenshot key
      await fetch(`${API_URL}/api/projects/${projectSlug}/screenshot-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ key }),
      });

      // Return the screenshot as base64 for preview
      const base64 = imageData.toString('base64');
      res.json({ ok: true, key, preview: `data:image/png;base64,${base64}` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Publish project — SSE stream with per-session progress
  app.post('/api/projects/:project/publish', async (req: Request, res: Response) => {
    const { project } = req.params;
    const auth = getAuthToken();

    if (!auth) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }

    const {
      title, slug, narrative, repoUrl, projectUrl,
      timeline, skills, totalSessions, totalLoc,
      totalDurationMinutes, totalAgentDurationMinutes,
      totalFilesChanged,
      skippedSessions, selectedSessionIds,
    } = req.body as {
      title: string;
      slug: string;
      narrative: string;
      repoUrl: string;
      projectUrl: string;
      timeline: ProjectEnhanceResult['timeline'];
      skills: string[];
      totalSessions: number;
      totalLoc: number;
      totalDurationMinutes: number;
      totalAgentDurationMinutes?: number;
      totalFilesChanged: number;
      skippedSessions: Array<{ title: string; duration: number; loc: number; reason: string }>;
      selectedSessionIds: string[];
    };

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Step 1: Upsert project on Phoenix (fatal if this fails)
      send({ type: 'project', status: 'creating' });

      const projectRes = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          project: {
            title, slug, narrative,
            repo_url: repoUrl || null,
            project_url: projectUrl || null,
            timeline, skills,
            total_sessions: totalSessions,
            total_loc: totalLoc,
            total_duration_minutes: totalDurationMinutes,
            total_agent_duration_minutes: totalAgentDurationMinutes || null,
            total_files_changed: totalFilesChanged,
            skipped_sessions: skippedSessions,
          },
        }),
      });

      if (!projectRes.ok) {
        const errBody = await projectRes.json().catch(() => ({ error: 'Project creation failed' }));
        const rawErr = (errBody as { error?: unknown }).error;
        const errMsg = typeof rawErr === 'string' ? rawErr
          : (rawErr && typeof rawErr === 'object' && 'message' in rawErr) ? (rawErr as { message: string }).message
          : `HTTP ${projectRes.status}`;
        send({ type: 'project', status: 'failed', error: errMsg, fatal: true });
        res.end();
        return;
      }

      const projectData = await projectRes.json() as { project_id: number; slug: string };
      send({ type: 'project', status: 'created', projectId: projectData.project_id, slug: projectData.slug });

      // Step 1b: Auto-capture and upload screenshot from project URL (non-fatal)
      if (projectUrl) {
        try {
          send({ type: 'screenshot', status: 'capturing' });
          const screenshotPath = await captureScreenshot(projectUrl, projectData.slug);
          if (screenshotPath) {
            // Get presigned PUT URL from Phoenix
            const ssUrlRes = await fetch(`${API_URL}/api/projects/${projectData.slug}/screenshot-url`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
              },
              body: JSON.stringify({ ext: 'png' }),
            });
            if (ssUrlRes.ok) {
              const { upload_url, key } = await ssUrlRes.json() as { upload_url: string; key: string };
              const imageData = readFileSync(screenshotPath);
              await fetch(upload_url, {
                method: 'PUT',
                body: imageData,
                headers: { 'Content-Type': 'image/png' },
              });
              // Update the project's screenshot_key
              await fetch(`${API_URL}/api/projects/${projectData.slug}/screenshot-key`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${auth.token}`,
                },
                body: JSON.stringify({ key }),
              });
              send({ type: 'screenshot', status: 'uploaded' });
            } else {
              send({ type: 'screenshot', status: 'skipped', reason: 'presign failed' });
            }
          } else {
            send({ type: 'screenshot', status: 'skipped', reason: 'Chrome not available' });
          }
        } catch {
          send({ type: 'screenshot', status: 'skipped', reason: 'capture failed' });
        }
      }

      // Step 2: Publish selected sessions (non-fatal per session)
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.dirName === project);
      let uploadedCount = 0;
      const failedSessions: Array<{ sessionId: string; error: string }> = [];
      const publishedSessionCards: SessionCard[] = [];

      if (proj) {
        for (const sessionId of selectedSessionIds) {
          const meta = proj.sessions.find((s) => s.sessionId === sessionId);
          if (!meta) continue;

          send({ type: 'session', sessionId, status: 'publishing' });

          try {
            const session = await loadSession(meta.path, proj.name, sessionId);
            const enhanced = loadEnhancedData(sessionId);
            const sessionSlug = (enhanced?.title ?? session.title ?? sessionId)
              .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

            // Build agent summary (shared between POST body and session.json)
            const agentSummary = await (async () => {
              const childMetas = meta.children ?? [];
              if (childMetas.length === 0) return null;

              const seenRoles = new Set<string>();
              const agents: Array<{ role: string; duration_minutes: number; loc_changed: number }> = [];
              for (const c of childMetas) {
                const role = c.agentRole ?? c.sessionId;
                if (seenRoles.has(role)) continue;
                seenRoles.add(role);
                const childStats = await getSessionStats(c, proj.name);
                agents.push({
                  role: c.agentRole ?? 'agent',
                  duration_minutes: childStats.duration,
                  loc_changed: childStats.loc,
                });
              }
              return agents.length > 0 ? { is_orchestrated: true, agents } : null;
            })();

            // M3: narrative and dev_take are distinct values
            // M4: truncate dev_take to Phoenix's 2000-char limit
            const devTake = (enhanced?.developerTake ?? session.developerTake ?? '').slice(0, 2000);
            const sessionNarrative = (enhanced as { narrative?: string })?.narrative ?? '';
            const sessionTitle = enhanced?.title ?? session.title;
            const sessionSkills = enhanced?.skills ?? session.skills ?? [];
            const sessionSourceTool = session.source ?? meta.source ?? 'claude';
            const sessionRecordedAt = session.date ? new Date(session.date).toISOString() : new Date().toISOString();

            // Build render data for this session
            const renderOpts = {
              sessionId,
              session,
              enhanced,
              username: auth.username,
              projectSlug: projectData.slug,
              sessionSlug,
              sourceTool: sessionSourceTool,
              agentSummary,
            };

            // Render static HTML for the session page (non-fatal)
            let sessionRenderedHtml: string | null = null;
            try {
              const sessionRenderData = buildSessionRenderData(renderOpts);
              sessionRenderedHtml = renderSessionHtml(sessionRenderData);
            } catch (renderErr) {
              console.error(`[publish] Session render failed for ${sessionId}:`, (renderErr as Error).message);
            }

            // Collect session card for project render
            publishedSessionCards.push(buildSessionCard(renderOpts));

            // POST body: scalar/aggregate fields only
            const sessionPayload = {
              session: {
                title: sessionTitle,
                dev_take: devTake,
                context: enhanced?.context ?? '',
                duration_minutes: session.durationMinutes ?? 0,
                turns: session.turns ?? 0,
                files_changed: session.filesChanged?.length ?? 0,
                loc_changed: session.linesOfCode ?? 0,
                recorded_at: sessionRecordedAt,
                end_time: session.endTime ? new Date(session.endTime).toISOString() : null,
                cwd: session.cwd ?? null,
                wall_clock_minutes: session.wallClockMinutes ?? null,
                template: 'editorial',
                language: null,
                tools: session.toolBreakdown?.map((t) => t.tool) ?? [],
                skills: sessionSkills,
                narrative: sessionNarrative,
                project_name: proj.name,
                project_id: projectData.project_id,
                slug: sessionSlug,
                status: 'listed',
                source_tool: sessionSourceTool,
                agent_summary: agentSummary,
                rendered_html: sessionRenderedHtml,
              },
            };

            // session.json: full data including visualization fields for S3
            // M1: Use consistent snake_case keys so Phoenix doesn't need dual-variant normalization
            // M5: Use sessionId (CLI's local UUID), not the slug
            const sessionData = {
              version: 1,
              id: sessionId,
              title: sessionTitle,
              dev_take: devTake,
              context: enhanced?.context ?? '',
              duration_minutes: session.durationMinutes ?? 0,
              turns: session.turns ?? 0,
              files_changed: (session.filesChanged ?? []).slice(0, 20).map((f) => (typeof f === 'string' ? { path: f, additions: 0, deletions: 0 } : f)),
              loc_changed: session.linesOfCode ?? 0,
              date: sessionRecordedAt,
              end_time: (() => {
                if (!session.endTime || !session.date) return null;
                const wallMs = new Date(session.endTime).getTime() - new Date(session.date).getTime();
                const activeMs = (session.durationMinutes ?? 0) * 60_000;
                return wallMs <= activeMs * 3 ? new Date(session.endTime).toISOString() : null;
              })(),
              cwd: session.cwd ?? null,
              wall_clock_minutes: session.wallClockMinutes ?? null,
              template: 'editorial',
              skills: sessionSkills,
              tools: session.toolBreakdown?.map((t) => t.tool) ?? [],
              source: sessionSourceTool,
              slug: sessionSlug,
              project_name: proj.name,
              narrative: sessionNarrative,
              status: 'listed' as const,
              raw_log: [] as string[],
              // M2: normalize execution_path steps to {label, description}
              execution_path: (enhanced?.executionSteps ?? session.executionPath ?? []).map((s, i) => ({
                label: s.title ?? `Step ${i + 1}`,
                description: (s as { description?: string }).description ?? (s as { body?: string }).body ?? '',
              })),
              qa_pairs: enhanced?.qaPairs ?? session.qaPairs ?? [],
              highlights: [],
              tool_breakdown: (session.toolBreakdown ?? []).map((t) => ({ tool: t.tool, count: t.count })),
              top_files: (session.filesChanged ?? []).slice(0, 20).map((f) => (typeof f === 'string' ? { path: f, additions: 0, deletions: 0 } : f)),
              turn_timeline: (session.turnTimeline ?? []).map((t) => ({
                timestamp: t.timestamp,
                type: t.type,
                content: (t.content ?? '').slice(0, 200),
                tools: (t as { tools?: string[] }).tools ?? [],
              })),
              // M6: Keep tool prefixes in transcript — they're informative
              transcript_excerpt: (session.rawLog ?? []).slice(0, 10).map((line, i) => {
                const role = line.startsWith('> ') ? 'dev' : 'ai';
                const text = role === 'dev' ? line.slice(2) : line;
                return { role, id: `Turn ${i + 1}`, text, timestamp: null };
              }),
              agent_summary: agentSummary,
              children: agentSummary?.agents?.map((a: { role: string; duration_minutes: number; loc_changed: number }) => ({
                sessionId: a.role,
                role: a.role,
                durationMinutes: a.duration_minutes,
                linesOfCode: a.loc_changed,
              })) ?? [],
            };

            // Redact secrets & PII, strip home directory paths before publishing
            const sessionCwd = session.cwd ?? undefined;
            const redactedPayload = redactSession(sessionPayload, 'high', sessionCwd);
            const redactedData = redactSession(sessionData as Record<string, unknown>, 'high', sessionCwd);

            // Warn about redacted content in CLI output
            const payloadFindings = scanTextSync(JSON.stringify(sessionPayload));
            if (payloadFindings.length > 0) {
              const summary = formatFindings(payloadFindings);
              send({ type: 'redaction', sessionId, message: summary });
            }

            const sessionRes = await fetch(`${API_URL}/api/sessions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
              },
              body: JSON.stringify(redactedPayload),
            });

            if (sessionRes.ok) {
              uploadedCount++;

              // Upload raw JSONL and log JSON to S3 (best-effort, non-fatal)
              try {
                const sesData = await sessionRes.json() as { upload_urls?: { raw?: string; log?: string; session?: string } };
                if (sesData.upload_urls) {
                  const { raw: rawUrl, log: logUrl } = sesData.upload_urls;
                  if (rawUrl && meta.path && !meta.path.startsWith('cursor://')) {
                    try {
                      const rawText = readFileSync(meta.path, 'utf-8');
                      let redactedRaw = redactText(rawText);
                      redactedRaw = stripHomePathsInText(redactedRaw, sessionCwd);
                      await fetch(rawUrl, { method: 'PUT', body: Buffer.from(redactedRaw, 'utf-8'), headers: { 'Content-Type': 'application/octet-stream' } });
                    } catch { /* S3 upload is best-effort */ }
                  }
                  if (logUrl && session.rawLog && session.rawLog.length > 0) {
                    try {
                      const redactedLog = session.rawLog.map((line: string) => {
                        let cleaned = redactText(line);
                        cleaned = stripHomePathsInText(cleaned, sessionCwd);
                        return cleaned;
                      });
                      await fetch(logUrl, { method: 'PUT', body: JSON.stringify(redactedLog), headers: { 'Content-Type': 'application/json' } });
                    } catch { /* S3 upload is best-effort */ }
                  }
                  if (sesData.upload_urls.session) {
                    try {
                      await fetch(sesData.upload_urls.session, {
                        method: 'PUT',
                        body: JSON.stringify(redactedData),
                        headers: { 'Content-Type': 'application/json' },
                      });
                    } catch { /* S3 upload is best-effort */ }
                  }
                }
              } catch { /* Response already consumed or no upload_urls — not fatal */ }

              if (enhanced) {
                saveEnhancedData(sessionId, { ...enhanced, uploaded: true });
              }
              send({ type: 'session', sessionId, status: 'published' });
            } else {
              const sesErrBody = await sessionRes.json().catch(() => null);
              const rawSesErr = sesErrBody && typeof sesErrBody === 'object' ? (sesErrBody as { error?: unknown }).error : null;
              const errMsg = typeof rawSesErr === 'string' ? rawSesErr
                : (rawSesErr && typeof rawSesErr === 'object' && 'message' in rawSesErr) ? (rawSesErr as { message: string }).message
                : `HTTP ${sessionRes.status}`;
              failedSessions.push({ sessionId, error: errMsg });
              send({ type: 'session', sessionId, status: 'failed', error: errMsg });
            }
          } catch (err) {
            const errMsg = (err as Error).message;
            failedSessions.push({ sessionId, error: errMsg });
            send({ type: 'session', sessionId, status: 'failed', error: errMsg });
          }
        }
      }

      // Step 3: Render project HTML and update on Phoenix (non-fatal)
      if (publishedSessionCards.length > 0) {
        try {
          const projectRenderData = buildProjectRenderData({
            username: auth.username,
            slug: projectData.slug,
            title,
            narrative,
            repoUrl: repoUrl || undefined,
            projectUrl: projectUrl || undefined,
            timeline: (timeline ?? []).map((t) => ({
              period: t.period,
              label: t.label,
              sessions: t.sessions as Array<Record<string, unknown>>,
            })),
            skills,
            totalSessions,
            totalLoc,
            totalDurationMinutes,
            totalAgentDurationMinutes: totalAgentDurationMinutes ?? undefined,
            totalFilesChanged,
            sessionCards: publishedSessionCards,
          });
          const projectHtml = renderProjectHtml(projectRenderData);

          // Re-POST the project with rendered_html (upsert updates existing record)
          send({ type: 'project', status: 'rendering' });
          const renderRes = await fetch(`${API_URL}/api/projects`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              project: {
                title, slug, narrative,
                repo_url: repoUrl || null,
                project_url: projectUrl || null,
                timeline, skills,
                total_sessions: totalSessions,
                total_loc: totalLoc,
                total_duration_minutes: totalDurationMinutes,
                total_agent_duration_minutes: totalAgentDurationMinutes || null,
                total_files_changed: totalFilesChanged,
                skipped_sessions: skippedSessions,
                rendered_html: projectHtml,
              },
            }),
          });
          if (renderRes.ok) {
            send({ type: 'project', status: 'rendered' });
          } else {
            console.error('[publish] Project render update failed:', renderRes.status);
          }
        } catch (renderErr) {
          console.error('[publish] Project render failed:', (renderErr as Error).message);
        }
      }

      // Step 4: Render portfolio HTML and update profile (non-fatal)
      // TODO: Fetch user's full project list from Phoenix (GET /api/projects returns local projects, not Phoenix data).
      // For now, we only have the current project's data. Portfolio render is skipped until
      // a Phoenix endpoint exists to list the user's published projects with stats.

      // Track published state locally
      const publishedSessionIds = selectedSessionIds.filter((sid: string) => {
        const enhanced = loadEnhancedData(sid);
        return enhanced?.uploaded;
      });
      if (proj) {
        savePublishedState(proj.dirName, {
          slug: projectData.slug,
          projectId: projectData.project_id,
          publishedSessions: publishedSessionIds,
        });
      }

      const projectUrl2 = `/${auth.username}/${projectData.slug}`;
      send({
        type: 'done',
        projectUrl: projectUrl2,
        projectId: projectData.project_id,
        slug: projectData.slug,
        uploaded: uploadedCount,
        failed: failedSessions.length,
        failedSessions,
      });
      res.end();
    } catch (err) {
      console.error('[publish] Error:', (err as Error).message);
      send({ type: 'error', code: 'PUBLISH_FAILED', message: (err as Error).message });
      res.end();
    }
  });

  // Narrative refinement — weave developer's answers into the draft narrative
  app.post('/api/projects/:project/refine-narrative', async (req: Request, res: Response) => {
    try {
      const { draftNarrative, draftTimeline, answers } = req.body as {
        draftNarrative: string;
        draftTimeline: ProjectEnhanceResult['timeline'];
        answers: Array<{ questionId: string; question: string; answer: string }>;
      };

      if (!draftNarrative || typeof draftNarrative !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'draftNarrative is required' } });
        return;
      }

      const refined = await refineNarrative(draftNarrative, draftTimeline ?? [], answers ?? []);
      res.json(refined);
    } catch (err) {
      res.status(500).json({
        error: { code: 'REFINE_FAILED', message: (err as Error).message },
      });
    }
  });

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Preview route — serves full standalone HTML page identical to heyi.am
  app.get('/preview/project/:project', async (req: Request, res: Response) => {
    try {
      const { project: projectParam } = req.params;
      const rawProjects = await getProjects(sessionsBasePath);
      const rawProj = rawProjects.find((p) => p.name === projectParam || p.dirName === projectParam);
      if (!rawProj) {
        res.status(404).send('Project not found');
        return;
      }
      const proj = await getProjectWithStats(rawProj);

      // Load cached enhance result for narrative, timeline, skills, session cards
      const cached = loadProjectEnhanceResult(proj.dirName);
      const auth = getAuthToken();

      // Build session cards from parsed sessions + enhanced data
      const sessionCards: SessionCard[] = [];
      if (cached?.selectedSessionIds) {
        for (const sid of cached.selectedSessionIds) {
          const meta = rawProj.sessions.find((s) => s.sessionId === sid);
          if (!meta) continue;
          try {
            const session = await loadSession(meta.path, rawProj.name, sid);
            const enhanced = loadEnhancedData(sid);
            sessionCards.push(buildSessionCard({
              sessionId: sid,
              session,
              enhanced,
              username: auth?.username || 'preview',
              projectSlug: proj.dirName,
              sessionSlug: sid,
              sourceTool: session.source || 'claude',
            }));
          } catch { /* skip sessions that fail to parse */ }
        }
      }

      const enhanceResult = cached?.result;

      // Build a lookup of session stats by ID for enriching timeline entries
      const sessionStatsMap = new Map<string, { duration: number; date?: string; skills?: string[]; description?: string }>();
      for (const meta of rawProj.sessions) {
        try {
          const s = await loadSession(meta.path, rawProj.name, meta.sessionId);
          const enhanced = loadEnhancedData(meta.sessionId);
          sessionStatsMap.set(meta.sessionId, {
            duration: s.durationMinutes ?? 0,
            date: s.date || undefined,
            skills: enhanced?.skills ?? s.skills ?? [],
            description: enhanced?.context || '',
          });
        } catch { /* skip */ }
      }

      // Enrich timeline sessions with real stats
      const enrichedTimeline = (enhanceResult?.timeline || []).map((period) => ({
        period: period.period,
        label: period.label,
        sessions: period.sessions.map((s) => {
          const stats = sessionStatsMap.get(s.sessionId);
          return {
            ...s,
            duration: stats?.duration ?? 0,
            date: stats?.date,
            skills: stats?.skills,
            description: stats?.description,
          };
        }),
      }));

      const renderData = buildProjectRenderData({
        username: auth?.username || 'preview',
        slug: proj.dirName,
        title: proj.name,
        narrative: enhanceResult?.narrative || proj.description || '',
        repoUrl: undefined,
        projectUrl: undefined,
        timeline: enrichedTimeline,
        skills: enhanceResult?.skills || proj.skills || [],
        totalSessions: proj.sessionCount,
        totalLoc: proj.totalLoc,
        totalDurationMinutes: proj.totalDuration,
        totalAgentDurationMinutes: proj.totalAgentDuration,
        totalFilesChanged: proj.totalFiles,
        sessionCards,
      });

      const bodyHtml = renderProjectHtml(renderData);

      // Always inline CSS so the preview works regardless of how it's accessed
      const appCssPath = path.resolve(__dirname, '..', 'app', 'src', 'App.css');
      const indexCssPath = path.resolve(__dirname, '..', 'app', 'src', 'index.css');
      let inlineCss = '';
      try { inlineCss += readFileSync(indexCssPath, 'utf-8'); } catch { /* */ }
      try { inlineCss += readFileSync(appCssPath, 'utf-8'); } catch { /* */ }
      const cssTag = `<style>${inlineCss}\n/* Preview override */\nbody { overflow: auto !important; min-height: auto !important; }\n#root { min-height: auto !important; }</style>`;

      const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="heyiam-api-base" content="/api" />
  <title>${escapeHtml(proj.name)} — Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ${cssTag}
</head>
<body>
  <div style="background: var(--primary, #084471); color: white; text-align: center; padding: 0.5rem; font-family: 'Inter', sans-serif; font-size: 0.75rem; letter-spacing: 0.05em;">
    PREVIEW — this is how your project will appear on heyi.am
  </div>
  ${bodyHtml}
</body>
</html>`;

      res.type('html').send(pageHtml);
    } catch (err) {
      console.error('[preview] Error:', (err as Error).message);
      res.status(500).send('Preview rendering failed');
    }
  });

  // Serve React app static files
  const staticDir = path.resolve(__dirname, '..', 'app', 'dist');
  app.use(express.static(staticDir));

  // SPA fallback — serve index.html for non-API routes
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  return app;
}

export function startServer(port: number = 17845): Promise<Server> {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
