import { Router, type Request, type Response } from 'express';
import { statSync } from 'node:fs';
import { type AgentChild } from '../bridge.js';
import { loadProjectEnhanceResult, getUploadedState } from '../settings.js';
import { RouteContext, requireProject, buildSessionList, buildProjectDetail } from './context.js';

export function createProjectsRouter(ctx: RouteContext): Router {
  const router = Router();

  router.get('/api/projects', async (_req: Request, res: Response) => {
    try {
      const projects = await ctx.getProjects();
      const projectsWithStats = await Promise.all(
        projects.map((p) => ctx.getProjectWithStats(p)),
      );
      // Sort by most recent session first
      projectsWithStats.sort((a, b) =>
        (b.lastSessionDate as string ?? '').localeCompare(a.lastSessionDate as string ?? ''),
      );
      res.json({ projects: projectsWithStats });
    } catch (err) {
      res.status(500).json({ error: { code: 'SCAN_FAILED', message: (err as Error).message } });
    }
  });

  // Aggregated project detail for the hub screen
  router.get('/api/projects/:project/detail', async (req: Request, res: Response) => {
    try {
      const project = String(req.params.project);
      const proj = await requireProject(ctx, project, res);
      if (!proj) return;

      res.json(buildProjectDetail(ctx.db, proj));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/api/projects/:project/sessions', async (req: Request, res: Response) => {
    try {
      const { project } = req.params;
      const projects = await ctx.getProjects();
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.json({ sessions: [] });
        return;
      }

      const sessions = await Promise.all(
        proj.sessions.map(async (meta) => {
          const seenIds = new Set<string>();
          const children: AgentChild[] = [];
          for (const c of meta.children ?? []) {
            if (seenIds.has(c.sessionId)) continue;
            seenIds.add(c.sessionId);
            const childStats = await ctx.getSessionStats(c, proj.name);
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
            const session = await ctx.loadSession(meta.path, proj.name, meta.sessionId);
            return { ...session, childCount, children: childCount > 0 ? children : undefined };
          } catch {
            const stats = await ctx.getSessionStats(meta, proj.name);
            let fallbackDate = stats.date || '';
            if (!fallbackDate) {
              try {
                fallbackDate = statSync(meta.path).mtime.toISOString();
              } catch { /* file gone -- will be filtered */ }
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

  router.get('/api/projects/:project/sessions/:id', async (req: Request, res: Response) => {
    try {
      const project = String(req.params.project);
      const id = String(req.params.id);
      const proj = await requireProject(ctx, project, res);
      if (!proj) return;

      const meta = proj.sessions.find((s) => s.sessionId === id);
      if (!meta) {
        res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
        return;
      }

      // DB-backed session data (includes children LOC/files, single source of truth)
      const sessionList = buildSessionList(ctx.db, proj.dirName, proj.name);
      const dbSession = sessionList.find((s) => s.id === id);

      // Parse from file only for rich content not stored in DB
      const parsed = await ctx.loadSession(meta.path, proj.name, meta.sessionId);

      const base = dbSession ?? parsed;
      const children = base.children;
      const aggregatedStats = children && children.length > 0
        ? {
            agentCount: children.length,
            totalLoc: children.reduce((s, c) => s + c.linesOfCode, 0),
            totalDurationMinutes: children.reduce((s, c) => s + c.durationMinutes, 0),
          }
        : undefined;

      res.json({
        session: {
          ...base,
          // Layer in rich content from parse that DB doesn't store
          toolBreakdown: parsed.toolBreakdown,
          turnTimeline: parsed.turnTimeline,
          rawLog: parsed.rawLog,
          ...(aggregatedStats ? { aggregatedStats } : {}),
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'PARSE_FAILED', message: (err as Error).message } });
    }
  });

  // Git remote auto-detection
  router.get('/api/projects/:project/git-remote', async (req: Request, res: Response) => {
    const { execFileSync } = await import('node:child_process');
    try {
      const project = String(req.params.project);
      const proj = await requireProject(ctx, project, res);
      if (!proj) return;

      let projectPath: string | null = null;
      for (const meta of proj.sessions) {
        try {
          const parsed = await ctx.loadSession(meta.path, proj.name, meta.sessionId);
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
          // No git remote or not a git repo -- return null
        }
      }

      res.json({ url: remoteUrl });
    } catch (err) {
      res.status(500).json({ error: { code: 'GIT_REMOTE_FAILED', message: (err as Error).message } });
    }
  });

  // ── Boundaries ────────────────────────────────────────────────
  router.get('/api/projects/:project/boundaries', (_req: Request, res: Response) => {
    res.json({ selectedSessionIds: [], skippedSessions: [] });
  });

  router.put('/api/projects/:project/boundaries', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  return router;
}
