import { Router, type Request, type Response } from 'express';
import { statSync } from 'node:fs';
import { toAgentChild, bridgeChildSessions, aggregateChildStats, type AgentChild } from '../bridge.js';
import { getAuthToken } from '../auth.js';
import { API_URL } from '../config.js';
import { loadProjectEnhanceResult, getUploadedState } from '../settings.js';
import { RouteContext, buildSessionList } from './context.js';

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

  // ── Time stats -- rich per-project agent breakdown ──────────
  router.get('/api/time-stats', async (_req: Request, res: Response) => {
    try {
      const projects = await ctx.getProjects();

      const projectStats = await Promise.all(projects.map(async (proj) => {
        const parents = proj.sessions.filter(s => !s.isSubagent);
        let yourMinutes = 0;
        let agentMinutes = 0;
        let orchestratedCount = 0;
        let maxParallelAgents = 0;
        let totalChildAgents = 0;
        const roleSet = new Set<string>();

        for (const meta of parents) {
          const stats = await ctx.getSessionStats(meta, proj.name);
          const dur = stats.duration;
          yourMinutes += dur;
          agentMinutes += dur;

          const children = meta.children ?? [];
          if (children.length > 0) {
            orchestratedCount++;
            maxParallelAgents = Math.max(maxParallelAgents, children.length);
            totalChildAgents += children.length;
          }

          for (const child of children) {
            const childStats = await ctx.getSessionStats(child, proj.name);
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
            ? +((totalChildAgents / parents.length) + 1).toFixed(1)
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
  router.post('/api/upload-time-stats', async (req: Request, res: Response) => {
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

  // Aggregated project detail for the hub screen
  router.get('/api/projects/:project/detail', async (req: Request, res: Response) => {
    try {
      const { project } = req.params;
      const projects = await ctx.getProjects();
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const enhanceCache = loadProjectEnhanceResult(proj.dirName);

      // Build session list from DB (fast) + enhanced data files (small reads)
      const sessionStats = buildSessionList(ctx.db, proj.dirName, proj.name);

      const totalLoc = sessionStats.reduce((sum, s) => sum + (s.linesOfCode || 0), 0);
      const totalDuration = sessionStats.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
      const totalFiles = (ctx.db.prepare(
        'SELECT COUNT(DISTINCT file_path) as c FROM session_files WHERE session_id IN (SELECT id FROM sessions WHERE project_dir = ? AND is_subagent = 0)',
      ).get(proj.dirName) as { c: number }).c;
      // Total agent duration: sum of ALL session durations (parents + subagents)
      const agentDurationRow = ctx.db.prepare(
        'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM sessions WHERE project_dir = ? AND is_subagent = 1',
      ).get(proj.dirName) as { total: number };
      const totalAgentDuration = totalDuration + agentDurationRow.total;
      const allSkills = [...new Set(sessionStats.flatMap((s) => s.skills || []))];

      const uploaded = getUploadedState(proj.dirName);
      const dates = sessionStats.map(s => s.date).filter(Boolean).sort();

      res.json({
        project: {
          name: proj.name,
          dirName: proj.dirName,
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
        },
        sessions: sessionStats.filter((s) => s.date),
        enhanceCache: enhanceCache ?? null,
      });
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
      const { project, id } = req.params;
      const projects = await ctx.getProjects();
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

      const session = await ctx.loadSession(meta.path, proj.name, meta.sessionId);

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

  // Git remote auto-detection
  router.get('/api/projects/:project/git-remote', async (req: Request, res: Response) => {
    const { execFileSync } = await import('node:child_process');
    try {
      const { project } = req.params;
      const projects = await ctx.getProjects();
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
        return;
      }

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
