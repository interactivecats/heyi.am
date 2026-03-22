import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import { listSessions, parseSession, type SessionMeta } from './parsers/index.js';
import { bridgeToAnalyzer, bridgeChildSessions, aggregateChildStats, type ChildSessionSummary } from './bridge.js';
import { analyzeSession, type Session } from './analyzer.js';
import { checkAuthStatus, getAuthToken, saveAuthToken } from './auth.js';
import { API_URL } from './config.js';
import { getProvider, getEnhanceMode } from './llm/index.js';
import { triageSessions, type SessionMetaWithStats } from './llm/triage.js';
import { enhanceProject, refineNarrative, type SessionSummary, type SkippedSessionMeta, type ProjectEnhanceResult } from './llm/project-enhance.js';
import { saveAnthropicApiKey, clearAnthropicApiKey, getAnthropicApiKey, saveEnhancedData, loadEnhancedData, deleteEnhancedData, loadFreshProjectEnhanceResult, saveProjectEnhanceResult, loadProjectEnhanceResult, buildProjectFingerprint, savePublishedState, getPublishedState } from './settings.js';

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
}

// ── Persistent stats cache ────────────────────────────────────
// Survives server restarts by writing to disk.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const STATS_CACHE_PATH = join(homedir(), '.config', 'heyiam', 'stats-cache.json');

// Bump this when parser logic changes to auto-invalidate stale cache entries.
const STATS_CACHE_VERSION = 2;

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
      const stats: SessionStats = {
        loc: session.linesOfCode ?? 0,
        duration: session.durationMinutes ?? 0,
        files: session.filesChanged?.length ?? 0,
        turns: session.turns ?? 0,
        skills: session.skills ?? [],
        date: session.date ?? '',
      };
      statsCache.set(meta.sessionId, stats);
      statsCacheDirty = true;
      return stats;
    } catch {
      return { loc: 0, duration: 0, files: 0, turns: 0, skills: [], date: '' };
    }
  }

  async function getProjectWithStats(proj: ProjectInfo) {
    const allStats = await Promise.all(
      proj.sessions.map((m) => getSessionStats(m, proj.name)),
    );

    const totalLoc = allStats.reduce((s, st) => s + st.loc, 0);
    const totalDuration = allStats.reduce((s, st) => s + st.duration, 0);
    const totalFiles = allStats.reduce((s, st) => s + st.files, 0);

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
      const sessions = await Promise.all(
        proj.sessions.map(async (meta) => {
          try {
            const session = await loadSession(meta.path, proj.name, meta.sessionId);
            // Deduplicate children by role (worktree agents create duplicates)
            const seenRoles = new Set<string>();
            const children: ChildSessionSummary[] = [];
            for (const c of meta.children ?? []) {
              const role = c.agentRole ?? c.sessionId;
              if (seenRoles.has(role)) continue;
              seenRoles.add(role);
              const childStats = await getSessionStats(c, proj.name);
              children.push({
                sessionId: c.sessionId,
                role: c.agentRole,
                durationMinutes: childStats.duration,
                linesOfCode: childStats.loc,
                date: childStats.date,
              });
            }
            const childCount = children.length;
            return { ...session, childCount, children: childCount > 0 ? children : undefined };
          } catch {
            return null;
          }
        }),
      );

      res.json({ sessions: sessions.filter(Boolean) });
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

      // Fully parse and attach child sessions
      const childSessions = await bridgeChildSessions(meta, proj.name);
      const aggregated = childSessions.length > 0 ? aggregateChildStats(childSessions) : undefined;

      res.json({
        session: {
          ...session,
          ...(childSessions.length > 0 ? { childSessions, isOrchestrated: true } : {}),
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

      // Derive the project filesystem path from the dirName.
      // Claude Code encodes "/Users/ben/Dev/heyi-am" as "-Users-ben-Dev-heyi-am"
      // (replaces "/" with "-"). Reverse: replace leading "-" with "/".
      const projectPath = proj.dirName.replace(/^-/, '/').replace(/-/g, '/');

      let remoteUrl: string | null = null;
      try {
        // Use execFileSync to avoid shell injection — fixed args, no interpolation
        const raw = execFileSync('git', ['-C', projectPath, 'remote', 'get-url', 'origin'], {
          timeout: 5000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        // Clean the URL:
        // git@github.com:user/repo.git → github.com/user/repo
        // https://github.com/user/repo.git → github.com/user/repo
        remoteUrl = raw
          .replace(/\.git$/, '')
          .replace(/^git@([^:]+):/, '$1/')
          .replace(/^https?:\/\//, '');
      } catch {
        // No git remote or not a git repo — return null
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
      totalDurationMinutes, totalFilesChanged,
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

      // Step 2: Publish selected sessions (non-fatal per session)
      const projects = await getProjects(sessionsBasePath);
      const proj = projects.find((p) => p.dirName === project);
      let uploadedCount = 0;
      const failedSessions: Array<{ sessionId: string; error: string }> = [];

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

            const sessionPayload = {
              session: {
                title: enhanced?.title ?? session.title,
                dev_take: enhanced?.developerTake ?? session.developerTake ?? '',
                context: enhanced?.context ?? '',
                duration_minutes: session.durationMinutes ?? 0,
                turns: session.turns ?? 0,
                files_changed: session.filesChanged?.length ?? 0,
                loc_changed: session.linesOfCode ?? 0,
                recorded_at: session.date ? new Date(session.date).toISOString() : new Date().toISOString(),
                template: 'editorial',
                language: null,
                tools: session.toolBreakdown?.map((t) => t.tool) ?? [],
                skills: enhanced?.skills ?? session.skills ?? [],
                beats: (enhanced?.executionSteps ?? session.executionPath ?? []).map((s, i) => ({
                  label: s.title,
                  description: 'body' in s ? (s as { body: string }).body : ('description' in s ? (s as { description: string }).description : ''),
                  position: i,
                })),
                qa_pairs: enhanced?.qaPairs ?? session.qaPairs ?? [],
                highlights: [],
                tool_breakdown: (session.toolBreakdown ?? []).map((t) => ({ name: t.tool, count: t.count })),
                top_files: (session.filesChanged ?? []).slice(0, 20).map((f) => (typeof f === 'string' ? { path: f } : f)),
                narrative: enhanced?.developerTake ?? '',
                project_name: proj.name,
                project_id: projectData.project_id,
                slug: sessionSlug,
                status: 'listed',
                source_tool: session.source ?? meta.source ?? 'claude',
              },
            };

            const sessionRes = await fetch(`${API_URL}/api/sessions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
              },
              body: JSON.stringify(sessionPayload),
            });

            if (sessionRes.ok) {
              uploadedCount++;

              // Upload raw JSONL and log JSON to S3 (best-effort, non-fatal)
              try {
                const sesData = await sessionRes.json() as { upload_urls?: { raw?: string; log?: string } };
                if (sesData.upload_urls) {
                  const { raw: rawUrl, log: logUrl } = sesData.upload_urls;
                  if (rawUrl && meta.path) {
                    try {
                      const rawBody = readFileSync(meta.path);
                      await fetch(rawUrl, { method: 'PUT', body: rawBody, headers: { 'Content-Type': 'application/octet-stream' } });
                    } catch { /* S3 upload is best-effort */ }
                  }
                  if (logUrl && session.rawLog && session.rawLog.length > 0) {
                    try {
                      await fetch(logUrl, { method: 'PUT', body: JSON.stringify(session.rawLog), headers: { 'Content-Type': 'application/json' } });
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
