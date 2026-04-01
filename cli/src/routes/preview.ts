import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAuthToken } from '../auth.js';
import { loadEnhancedData, loadProjectEnhanceResult, getDefaultTemplate } from '../settings.js';
import { SCREENSHOTS_DIR } from '../screenshot.js';
import { renderProjectHtml, renderSessionHtml } from '../render/index.js';
import { getTemplateCss, isValidTemplate } from '../render/templates.js';
import { buildSessionRenderData, buildSessionCard, buildProjectRenderData } from '../render/build-render-data.js';
import type { SessionCard, ProjectRenderData } from '../render/types.js';
import { buildAgentSummary, type RouteContext } from './context.js';
import { displayNameFromDir } from '../sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build project render data and enhance result from a project parameter.
 * Shared between the full-page preview and the JSON render endpoint.
 */
async function buildProjectPreviewData(
  ctx: RouteContext,
  projectParam: string,
  queryOverrides?: { repoUrl?: string; projectUrl?: string },
): Promise<{
  renderData: ProjectRenderData;
  enhanceResult: NonNullable<ReturnType<typeof loadProjectEnhanceResult>>['result'] | undefined;
  projName: string;
}> {
  const rawProjects = await ctx.getProjects();
  const rawProj = rawProjects.find((p) => p.name === projectParam || p.dirName === projectParam);
  if (!rawProj) {
    throw new ProjectNotFoundError(projectParam);
  }
  const proj = await ctx.getProjectWithStats(rawProj);

  const cached = loadProjectEnhanceResult((proj as { dirName: string }).dirName);
  const auth = getAuthToken();

  // Build session cards from parsed sessions + enhanced data
  const sessionCards: SessionCard[] = [];
  if (cached?.selectedSessionIds) {
    for (const sid of cached.selectedSessionIds) {
      const meta = rawProj.sessions.find((s) => s.sessionId === sid);
      if (!meta) continue;
      try {
        const session = await ctx.loadSession(meta.path, rawProj.name, sid);
        const enhanced = loadEnhancedData(sid);

        const agentSummary = await buildAgentSummary(
          meta.children ?? [],
          (c) => ctx.getSessionStats(c, rawProj.name),
          { deduplicate: true },
        );

        sessionCards.push(buildSessionCard({
          sessionId: sid,
          session,
          enhanced,
          username: auth?.username || 'preview',
          projectSlug: (proj as { dirName: string }).dirName,
          sessionSlug: sid,
          sourceTool: session.source || 'claude',
          agentSummary,
        }));
      } catch { /* skip sessions that fail to parse */ }
    }
  }

  const enhanceResult = cached?.result;

  // Build cards for ALL sessions (for work timeline + growth chart)
  const allSessionCards: SessionCard[] = [];
  const sessionStatsMap = new Map<string, { duration: number; date?: string; skills?: string[]; description?: string }>();
  for (const meta of rawProj.sessions) {
    try {
      const s = await ctx.loadSession(meta.path, rawProj.name, meta.sessionId);
      const enhanced = loadEnhancedData(meta.sessionId);
      sessionStatsMap.set(meta.sessionId, {
        duration: s.durationMinutes ?? 0,
        date: s.date || undefined,
        skills: enhanced?.skills ?? s.skills ?? [],
        description: enhanced?.context || '',
      });

      const allAgentSummary = await buildAgentSummary(
        meta.children ?? [],
        (c) => ctx.getSessionStats(c, rawProj.name),
      );

      allSessionCards.push(buildSessionCard({
        sessionId: meta.sessionId,
        session: s,
        enhanced,
        username: auth?.username || 'preview',
        projectSlug: (proj as { dirName: string }).dirName,
        sessionSlug: meta.sessionId,
        sourceTool: s.source || 'claude',
        agentSummary: allAgentSummary,
      }));
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

  const projAny = proj as Record<string, unknown>;
  const rawName = (projAny.name as string) || displayNameFromDir(projAny.dirName as string);
  const title = (cached as Record<string, unknown> | null)?.title as string | undefined || rawName;
  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Metadata from enhance cache (set in sidebar), with query overrides taking priority
  const cachedAny = cached as Record<string, unknown> | null;
  const metaRepoUrl = queryOverrides?.repoUrl || (cachedAny?.repoUrl as string | undefined);
  const metaProjectUrl = queryOverrides?.projectUrl || (cachedAny?.projectUrl as string | undefined);

  const renderData = buildProjectRenderData({
    username: auth?.username || 'preview',
    slug,
    title,
    narrative: enhanceResult?.narrative || (projAny.description as string) || '',
    repoUrl: metaRepoUrl,
    projectUrl: metaProjectUrl,
    screenshotUrl: (() => {
      return existsSync(path.join(SCREENSHOTS_DIR, `${slug}.png`))
        ? `/screenshots/${slug}.png`
        : undefined;
    })(),
    timeline: enrichedTimeline,
    skills: enhanceResult?.skills || (projAny.skills as string[]) || [],
    totalSessions: projAny.sessionCount as number,
    totalLoc: projAny.totalLoc as number,
    totalDurationMinutes: projAny.totalDuration as number,
    totalAgentDurationMinutes: projAny.totalAgentDuration as number,
    totalFilesChanged: projAny.totalFiles as number,
    totalTokens: ((projAny.totalInputTokens as number) || 0) + ((projAny.totalOutputTokens as number) || 0) || undefined,
    sessionCards,
    allSessionCards,
    sessionBaseUrl: `/preview/project/${encodeURIComponent(projectParam)}/session`,
  });

  return { renderData, enhanceResult, projName: projAny.name as string };
}

/** Sentinel error for project-not-found so callers can return 404. */
class ProjectNotFoundError extends Error {
  constructor(project: string) {
    super(`Project not found: ${project}`);
    this.name = 'ProjectNotFoundError';
  }
}

export function createPreviewRouter(ctx: RouteContext): Router {
  const router = Router();

  // Serve local screenshot files
  router.get('/screenshots/:slug.png', (req: Request, res: Response) => {
    const filePath = path.join(SCREENSHOTS_DIR, `${req.params.slug}.png`);
    if (existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(readFileSync(filePath));
    } else {
      res.status(404).end();
    }
  });

  // Delete a screenshot file
  router.delete('/api/projects/:project/screenshot', (req: Request, res: Response) => {
    const projectParam = String(req.params.project);
    const slug = projectParam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filePath = path.join(SCREENSHOTS_DIR, `${slug}.png`);
    try {
      if (existsSync(filePath)) {
        const { unlinkSync } = require('node:fs');
        unlinkSync(filePath);
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete screenshot' });
    }
  });

  // Project preview -- serves full standalone HTML page identical to heyi.am
  router.get('/preview/project/:project', async (req: Request, res: Response) => {
    try {
      const projectParam = String(req.params.project);
      const templateOverride = req.query.template as string | undefined;
      const { renderData, enhanceResult, projName } = await buildProjectPreviewData(ctx, projectParam, {
        repoUrl: req.query.repoUrl as string | undefined,
        projectUrl: req.query.projectUrl as string | undefined,
      });

      // Use template override if valid, otherwise fall back to user default
      const templateName = (templateOverride && isValidTemplate(templateOverride))
        ? templateOverride
        : (getDefaultTemplate() || 'editorial');

      let bodyHtml: string;
      try {
        bodyHtml = renderProjectHtml(renderData, { arc: enhanceResult?.arc }, templateName);
      } catch {
        bodyHtml = renderProjectHtml(renderData, { arc: enhanceResult?.arc }, 'editorial');
      }

      res.type('html').send(ctx.buildPreviewPage(
        projName,
        bodyHtml,
        'PREVIEW — this is how your project will appear on heyi.am',
      ));
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        res.status(404).send('Project not found');
        return;
      }
      console.error('[preview] Error:', (err as Error).message);
      res.status(500).send('Preview rendering failed');
    }
  });

  // JSON render endpoint -- returns rendered HTML fragment + CSS for embedding in React UI
  router.get('/api/projects/:project/render', async (req: Request, res: Response) => {
    try {
      const projectParam = String(req.params.project);
      const templateOverride = req.query.template as string | undefined;
      const { renderData, enhanceResult } = await buildProjectPreviewData(ctx, projectParam, {
        repoUrl: req.query.repoUrl as string | undefined,
        projectUrl: req.query.projectUrl as string | undefined,
      });

      // Use template override if valid, otherwise fall back to user default
      let templateName = (templateOverride && isValidTemplate(templateOverride))
        ? templateOverride
        : (getDefaultTemplate() || 'editorial');
      let html: string;
      try {
        html = renderProjectHtml(renderData, { arc: enhanceResult?.arc }, templateName);
      } catch {
        // Template files may not exist yet (e.g. showcase) -- fall back to editorial
        templateName = 'editorial';
        html = renderProjectHtml(renderData, { arc: enhanceResult?.arc }, templateName);
      }
      const css = getTemplateCss(templateName);
      const screenshotUrl = renderData.project.screenshotUrl || undefined;

      res.json({ html, css, template: templateName, screenshotUrl });
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      console.error('[api/render] Error:', (err as Error).message);
      res.status(500).json({ error: 'Render failed' });
    }
  });

  // Session preview
  router.get('/preview/project/:project/session/:sessionId', async (req: Request, res: Response) => {
    try {
      const projectParam = String(req.params.project);
      const sessionId = String(req.params.sessionId);
      const rawProjects = await ctx.getProjects();
      const rawProj = rawProjects.find((p) => p.name === projectParam || p.dirName === projectParam);
      if (!rawProj) { res.status(404).send('Project not found'); return; }

      const meta = rawProj.sessions.find((s) => s.sessionId === sessionId);
      if (!meta) { res.status(404).send('Session not found'); return; }

      const auth = getAuthToken();
      const session = await ctx.loadSession(meta.path, rawProj.name, sessionId);
      const enhanced = loadEnhancedData(sessionId);

      const agentSummary = await buildAgentSummary(
        meta.children ?? [],
        (c) => ctx.getSessionStats(c, rawProj.name),
      );

      const renderData = buildSessionRenderData({
        sessionId,
        session,
        enhanced,
        username: auth?.username || 'preview',
        projectSlug: rawProj.dirName,
        sessionSlug: sessionId,
        sourceTool: session.source || 'claude',
        agentSummary,
      });

      const bodyHtml = renderSessionHtml(renderData);
      res.type('html').send(ctx.buildPreviewPage(
        session.title || sessionId,
        bodyHtml,
        'PREVIEW — this is how your session will appear on heyi.am',
      ));
    } catch (err) {
      console.error('[session-preview] Error:', (err as Error).message);
      res.status(500).send('Session preview failed');
    }
  });

  // Serve @heyiam/ui mount script for preview pages
  router.get('/heyiam-mount.js', (_req: Request, res: Response) => {
    // In built dist: dist/mount.js (copied during build)
    // In dev: ../../../packages/ui/dist/mount.js (monorepo layout)
    const builtPath = path.resolve(__dirname, '..', 'mount.js');
    const devPath = path.resolve(__dirname, '..', '..', '..', 'packages', 'ui', 'dist', 'mount.js');
    const mountPath = existsSync(builtPath) ? builtPath : devPath;
    try {
      const js = readFileSync(mountPath, 'utf-8');
      res.type('application/javascript').send(js);
    } catch {
      res.status(404).send('// mount.js not built — run: cd packages/ui && npm run build');
    }
  });

  return router;
}
