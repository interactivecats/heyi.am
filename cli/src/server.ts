import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { listSessions, parseSession, type SessionMeta } from './parsers/index.js';
import { bridgeToAnalyzer, bridgeChildSessions, aggregateChildStats, type ChildSessionSummary } from './bridge.js';
import { analyzeSession, type Session } from './analyzer.js';
import { checkAuthStatus, getAuthToken } from './auth.js';
import { API_URL } from './config.js';
import { summarizeSession, createSSEHandler } from './summarize.js';

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
  app.use(express.json());

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
      const result = await summarizeSession(session);
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: { code: 'ENHANCE_FAILED', message: (err as Error).message } });
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
      const { session } = req.body;
      if (!session) {
        res.status(400).json({ error: 'Missing session data' });
        return;
      }

      const auth = getAuthToken();
      if (!auth?.token) {
        res.status(401).json({ error: 'Not authenticated. Run: heyiam login' });
        return;
      }

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
        res.status(response.status).json(data);
        return;
      }

      res.json(data);
    } catch {
      res.status(500).json({ error: 'Publish failed' });
    }
  });

  app.get('/api/auth/status', async (_req: Request, res: Response) => {
    try {
      const status = await checkAuthStatus(
        API_URL,
      );
      res.json(status);
    } catch {
      res.json({ authenticated: false });
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
