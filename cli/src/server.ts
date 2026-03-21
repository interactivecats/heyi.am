import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { listSessions, parseSession, type SessionMeta } from './parsers/index.js';
import { bridgeToAnalyzer, bridgeChildSessions, aggregateChildStats, type ChildSessionSummary } from './bridge.js';
import { analyzeSession, type Session } from './analyzer.js';
import { checkAuthStatus, getAuthToken, saveAuthToken } from './auth.js';
import { API_URL } from './config.js';
import { summarizeSession, createSSEHandler } from './summarize.js';
import { getProvider, getEnhanceMode } from './llm/index.js';

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
  return analyzeSession(analyzerInput);
}

export function createApp(sessionsBasePath?: string) {
  const app = express();

  app.use(cors({ origin: ['http://localhost:17845', 'http://127.0.0.1:17845'] }));
  app.use(express.json({ limit: '50mb' }));

  // API routes — wired to real parser pipeline
  app.get('/api/projects', async (_req: Request, res: Response) => {
    try {
      const projects = await getProjects(sessionsBasePath);
      res.json({
        projects: projects.map((p) => ({
          name: p.name,
          dirName: p.dirName,
          sessionCount: p.sessionCount,
          description: '',
        })),
      });
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

      // Return parent sessions only — children are lightweight summaries (no full parse).
      // Deduplicate worktree clones: multiple agents with same role are counted once.
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
              children.push({ sessionId: c.sessionId, role: c.agentRole });
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

  app.get('/api/projects/:project/sessions/:id/enhance/stream', async (req: Request, res: Response) => {
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
      const handler = createSSEHandler(session);
      await handler(req, res);
    } catch (err) {
      res.status(500).json({ error: { code: 'STREAM_FAILED', message: (err as Error).message } });
    }
  });

  app.post('/api/publish', async (req: Request, res: Response) => {
    try {
      const { session, sessionId, projectDir } = req.body;
      if (!session) {
        console.log('[publish] ERROR: Missing session data in request body');
        res.status(400).json({ error: 'Missing session data' });
        return;
      }

      const auth = getAuthToken();
      if (!auth?.token) {
        console.log('[publish] ERROR: Not authenticated (no token in ~/.config/heyiam/auth.json)');
        res.status(401).json({ error: 'Not authenticated. Run: heyiam login' });
        return;
      }

      console.log(`[publish] Sending to ${API_URL}/api/sessions (title: "${session.title}", keys: ${Object.keys(session).join(', ')})`);

      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ session }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.log(`[publish] FAILED ${response.status}:`, JSON.stringify(data));
        res.status(response.status).json(data);
        return;
      }

      console.log(`[publish] SUCCESS: ${data.url}`);

      // Best-effort upload of raw data to object storage
      if (data.upload_urls) {
        uploadRawData(data.upload_urls, sessionId, projectDir, session.raw_log, sessionsBasePath).catch((err) => {
          console.error('[publish] Raw data upload failed (non-fatal):', err);
        });
      }

      res.json(data);
    } catch (err) {
      console.error('[publish] EXCEPTION:', err);
      res.status(500).json({ error: 'Publish failed' });
    }
  });

  // Enhancement status — returns current mode and remaining quota
  app.get('/api/enhance/status', async (_req: Request, res: Response) => {
    try {
      const mode = getEnhanceMode();
      if (mode === 'local') {
        res.json({ mode: 'local', remaining: null });
        return;
      }

      // Proxy mode — check quota from Phoenix
      const auth = getAuthToken();
      if (!auth?.token) {
        res.json({ mode: 'none', remaining: 0, message: 'Not configured' });
        return;
      }

      // We don't have a dedicated quota endpoint yet, so report proxy mode
      res.json({ mode: 'proxy', remaining: null });
    } catch {
      res.json({ mode: 'unknown', remaining: null });
    }
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

  // Serve React app static files
  const staticDir = path.resolve(__dirname, '..', 'app', 'dist');
  app.use(express.static(staticDir));

  // SPA fallback — serve index.html for non-API routes
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  return app;
}

async function uploadRawData(
  uploadUrls: { raw?: string; log?: string },
  sessionId?: string,
  projectDir?: string,
  rawLog?: string[],
  basePath?: string,
): Promise<void> {
  // Upload rawLog as JSON
  if (uploadUrls.log && rawLog && rawLog.length > 0) {
    const logRes = await fetch(uploadUrls.log, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rawLog),
    });
    if (logRes.ok) {
      console.log('[publish] Uploaded raw log to object storage');
    } else {
      console.error(`[publish] Log upload failed: ${logRes.status}`);
    }
  }

  // Upload raw JSONL file from disk
  if (uploadUrls.raw && sessionId && projectDir) {
    try {
      const projects = await getProjects(basePath);
      const project = projects.find((p) => p.dirName === projectDir);
      const meta = project?.sessions.find((s) => s.sessionId === sessionId);
      if (meta?.path) {
        const fileData = await fs.promises.readFile(meta.path);
        const rawRes = await fetch(uploadUrls.raw, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: fileData,
        });
        if (rawRes.ok) {
          console.log(`[publish] Uploaded raw JSONL (${(fileData.length / 1024).toFixed(0)} KB) to object storage`);
        } else {
          console.error(`[publish] JSONL upload failed: ${rawRes.status}`);
        }
      }
    } catch (err) {
      console.error('[publish] Failed to read/upload JSONL:', err);
    }
  }
}

export function startServer(port: number = 17845): Promise<Server> {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
