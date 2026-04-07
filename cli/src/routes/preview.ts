import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAuthToken } from '../auth.js';
import { loadEnhancedData, loadProjectEnhanceResult, getDefaultTemplate, getPortfolioProfile } from '../settings.js';
import { SCREENSHOTS_DIR } from '../screenshot.js';
import { renderProjectHtml, renderSessionHtml, renderPortfolioHtml } from '../render/index.js';
import { getTemplateCss, isValidTemplate, getTemplateInfo } from '../render/templates.js';
import { getMockPortfolioData, getMockProjectData, getMockProjectArc, getMockFullSessions, getMockSessionData } from '../render/mock-data.js';
import { buildSessionRenderData, buildSessionCard, buildProjectRenderData } from '../render/build-render-data.js';
import type { SessionCard, ProjectRenderData, PortfolioRenderData, PortfolioProject } from '../render/types.js';
import { buildAgentSummary, type RouteContext } from './context.js';
import { displayNameFromDir } from '../sync.js';
import { toSlug } from '../format-utils.js';
import { getSessionsByProject, type SessionRow } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * In-memory cache for expensive buildProjectPreviewData calls.
 * Keyed by project param — the render data is template-agnostic,
 * so we cache once and re-render with different templates cheaply.
 * TTL: 30 seconds (long enough for template browser to load all iframes).
 */
const previewDataCache = new Map<string, { data: { renderData: ProjectRenderData; enhanceResult: any; projName: string }; ts: number }>();
const PREVIEW_CACHE_TTL = 30_000;

/** Clear the preview data cache. Exported for testing. */
export function clearPreviewCache(): void {
  previewDataCache.clear();
  portfolioPreviewCache.clear();
}

/**
 * In-memory cache for the rendered /preview/portfolio HTML response.
 * Keyed by the literal string 'portfolio' (CLI is single-user). Cached value
 * is the full HTML body that the route would otherwise re-render on every
 * iframe reload from the React PreviewPane.
 *
 * TTL: 30 seconds. Invalidated explicitly on profile save, portfolio
 * publish, and project mutations via invalidatePortfolioPreviewCache().
 */
const portfolioPreviewCache = new Map<'portfolio', { html: string; expiresAt: number }>();
const PORTFOLIO_PREVIEW_CACHE_TTL = 30_000;

/**
 * Invalidate the cached /preview/portfolio HTML. Call this from any route
 * that mutates state visible in the portfolio render: profile save,
 * portfolio publish, project enhance-save, screenshot capture/delete, etc.
 */
export function invalidatePortfolioPreviewCache(): void {
  portfolioPreviewCache.delete('portfolio');
}

/** Test helper: read current cache entry without mutating. */
export function _getPortfolioPreviewCacheEntry(): { html: string; expiresAt: number } | undefined {
  return portfolioPreviewCache.get('portfolio');
}

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
  // Check cache (only when no query overrides, which are rare)
  if (!queryOverrides?.repoUrl && !queryOverrides?.projectUrl) {
    const cached = previewDataCache.get(projectParam);
    if (cached && Date.now() - cached.ts < PREVIEW_CACHE_TTL) {
      return cached.data;
    }
  }
  const rawProjects = await ctx.getProjects();
  const rawProj = rawProjects.find((p) => p.name === projectParam || p.dirName === projectParam);
  if (!rawProj) {
    throw new ProjectNotFoundError(projectParam);
  }
  const proj = await ctx.getProjectWithStats(rawProj);

  const cached = loadProjectEnhanceResult((proj as { dirName: string }).dirName);
  const auth = getAuthToken();
  const enhanceResult = cached?.result;

  // ── Fast path: read ALL session data from SQLite (single query, no JSONL parsing) ──
  const dbSessions = getSessionsByProject(ctx.db, rawProj.dirName);
  const dbById = new Map(dbSessions.map((r) => [r.id, r]));

  /** Convert a SQLite SessionRow + optional enhanced data into a SessionCard */
  function rowToCard(row: SessionRow, sid: string): SessionCard {
    const enhanced = loadEnhancedData(sid);
    const skills: string[] = enhanced?.skills ?? (row.skills ? JSON.parse(row.skills) : []);
    const title = enhanced?.title ?? row.title ?? sid;
    const devTake = (enhanced?.developerTake ?? '').slice(0, 2000);
    const slug = toSlug(title, 80);

    // Check for child sessions (subagents) in DB
    const children = dbSessions.filter((r) => r.parent_session_id === sid);
    let agentSummary: SessionCard['agentSummary'];
    if (children.length > 0) {
      agentSummary = {
        is_orchestrated: true as const,
        agents: children.map((c) => ({
          role: c.agent_role ?? 'agent',
          duration_minutes: c.duration_minutes ?? 0,
          loc_changed: (c.loc_added ?? 0) + (c.loc_removed ?? 0),
        })),
      };
    }

    return {
      token: sid,
      slug,
      title,
      devTake,
      durationMinutes: row.duration_minutes ?? 0,
      turns: row.turns ?? 0,
      locChanged: (row.loc_added ?? 0) + (row.loc_removed ?? 0),
      linesAdded: row.loc_added ?? 0,
      linesDeleted: row.loc_removed ?? 0,
      filesChanged: row.files_changed ?? 0,
      skills,
      recordedAt: row.start_time ?? new Date().toISOString(),
      sourceTool: row.source ?? 'claude',
      agentSummary,
    };
  }

  // Build selected session cards from DB
  const sessionCards: SessionCard[] = [];
  if (cached?.selectedSessionIds) {
    for (const sid of cached.selectedSessionIds) {
      const row = dbById.get(sid);
      if (!row) continue;
      sessionCards.push(rowToCard(row, sid));
    }
  }

  // Build ALL session cards from DB (for work timeline + growth chart)
  // Only parent sessions (not subagents) — subagents are included via agentSummary
  const allSessionCards: SessionCard[] = [];
  const sessionStatsMap = new Map<string, { duration: number; date?: string; skills?: string[]; description?: string }>();
  for (const row of dbSessions) {
    if (row.is_subagent) continue;
    const enhanced = loadEnhancedData(row.id);
    const skills: string[] = enhanced?.skills ?? (row.skills ? JSON.parse(row.skills) : []);
    sessionStatsMap.set(row.id, {
      duration: row.duration_minutes ?? 0,
      date: row.start_time || undefined,
      skills,
      description: enhanced?.context || '',
    });
    allSessionCards.push(rowToCard(row, row.id));
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
  const slug = toSlug(title);

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

  const result = { renderData, enhanceResult, projName: projAny.name as string };

  // Cache the result (template-agnostic data, re-rendered cheaply per template)
  previewDataCache.set(projectParam, { data: result, ts: Date.now() });

  return result;
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

  // Serve template previews with mock data.
  // Tries static mockup HTML first (fast), falls back to Liquid rendering.
  router.get('/preview/template/:name', (req: Request, res: Response) => {
    const name = String(req.params.name);
    if (!isValidTemplate(name)) {
      res.status(404).send('Template not found');
      return;
    }
    const page = (req.query.page as string) || 'project';

    // 1. Try static mockup HTML (instant, from docs/mockups/)
    const mockupPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'mockups', name, `${page}.html`);
    if (existsSync(mockupPath)) {
      let html = readFileSync(mockupPath, 'utf-8');
      html = html.replace(/\.\.\/assets\//g, '/preview/template-assets/');
      html = html.replace(/\.\/portfolio\.html/g, `/preview/template/${name}?page=portfolio`);
      html = html.replace(/\.\/project\.html/g, `/preview/template/${name}?page=project`);
      html = html.replace(/\.\/session\.html/g, `/preview/template/${name}?page=session`);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.send(html);
      return;
    }

    // 2. Fall back to Liquid rendering with mock data
    try {
      let bodyHtml: string;
      if (page === 'portfolio') {
        bodyHtml = renderPortfolioHtml(getMockPortfolioData(), name);
      } else if (page === 'session') {
        bodyHtml = renderSessionHtml(getMockSessionData(), name);
      } else {
        bodyHtml = renderProjectHtml(getMockProjectData(), { arc: getMockProjectArc(), fullSessions: getMockFullSessions() }, name);
      }
      const css = getTemplateCss(name);
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="heyiam-api-base" content="/api" />
  <title>${name} — ${page} preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Newsreader:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
  <style>${css}
/* Preview override */
body { overflow: auto !important; min-height: auto !important; }
#root { min-height: auto !important; }
</style>
</head>
<body>
  ${bodyHtml}
  <script src="/heyiam-mount.js"></script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.send(fullHtml);
    } catch (err) {
      console.error(`[preview/template] Liquid render failed for ${name}/${page}:`, (err as Error).message);
      res.status(500).send('Template render failed');
    }
  });

  // Serve mockup assets (headshots, etc.)
  router.get('/preview/template-assets/:filename', (req: Request, res: Response) => {
    const filename = String(req.params.filename);
    // Only allow expected image files
    if (!/^[\w-]+\.(jpg|png)$/.test(filename)) {
      res.status(400).end();
      return;
    }
    const assetPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'mockups', 'assets', filename);
    if (existsSync(assetPath)) {
      const ext = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
      res.setHeader('Content-Type', ext);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(readFileSync(assetPath));
    } else {
      res.status(404).end();
    }
  });

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
    const slug = toSlug(projectParam);
    const filePath = path.join(SCREENSHOTS_DIR, `${slug}.png`);
    try {
      if (existsSync(filePath)) {
        const { unlinkSync } = require('node:fs');
        unlinkSync(filePath);
      }
      // Portfolio listing shows project screenshots — bust the cache.
      invalidatePortfolioPreviewCache();
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
        templateName,
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

      // Override sessionBaseUrl so Liquid generates SPA-friendly /session/:id links
      // (the cached renderData uses /preview/project/... URLs for the standalone preview)
      const spaRenderData = { ...renderData, sessionBaseUrl: '/session' };

      // Use template override if valid, otherwise fall back to user default
      let templateName = (templateOverride && isValidTemplate(templateOverride))
        ? templateOverride
        : (getDefaultTemplate() || 'editorial');
      let html: string;
      try {
        html = renderProjectHtml(spaRenderData, { arc: enhanceResult?.arc }, templateName);
      } catch {
        // Template files may not exist yet (e.g. showcase) -- fall back to editorial
        templateName = 'editorial';
        html = renderProjectHtml(spaRenderData, { arc: enhanceResult?.arc }, templateName);
      }
      const css = getTemplateCss(templateName);
      const screenshotUrl = spaRenderData.project.screenshotUrl || undefined;
      const templateInfo = getTemplateInfo(templateName);

      res.json({
        html, css, template: templateName, screenshotUrl,
        accent: templateInfo?.accent ?? '#084471',
        mode: templateInfo?.mode ?? 'light',
      });
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

      const templateName = (req.query.template as string | undefined) && isValidTemplate(req.query.template as string)
        ? (req.query.template as string)
        : (getDefaultTemplate() || 'editorial');

      const renderData = buildSessionRenderData({
        sessionId,
        session,
        enhanced,
        username: auth?.username || 'preview',
        projectSlug: rawProj.dirName,
        sessionSlug: sessionId,
        sourceTool: session.source || 'claude',
        agentSummary,
        template: templateName,
      });

      const bodyHtml = renderSessionHtml(renderData, templateName);
      res.type('html').send(ctx.buildPreviewPage(
        session.title || sessionId,
        bodyHtml,
        'PREVIEW — this is how your session will appear on heyi.am',
        templateName,
      ));
    } catch (err) {
      console.error('[session-preview] Error:', (err as Error).message);
      res.status(500).send('Session preview failed');
    }
  });

  // JSON render endpoint for sessions — returns HTML fragment + CSS for embedding in React UI
  router.get('/api/sessions/:sessionId/render', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const templateOverride = req.query.template as string | undefined;

      // Find the session across all projects
      const rawProjects = await ctx.getProjects();
      let foundMeta: (typeof rawProjects[number]['sessions'][number]) | undefined;
      let foundProj: (typeof rawProjects[number]) | undefined;
      for (const proj of rawProjects) {
        const meta = proj.sessions.find((s) => s.sessionId === sessionId);
        if (meta) {
          foundMeta = meta;
          foundProj = proj;
          break;
        }
      }
      if (!foundMeta || !foundProj) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const auth = getAuthToken();
      const session = await ctx.loadSession(foundMeta.path, foundProj.name, sessionId);
      const enhanced = loadEnhancedData(sessionId);

      const agentSummary = await buildAgentSummary(
        foundMeta.children ?? [],
        (c) => ctx.getSessionStats(c, foundProj!.name),
      );

      let templateName = (templateOverride && isValidTemplate(templateOverride))
        ? templateOverride
        : (getDefaultTemplate() || 'editorial');

      const renderData = buildSessionRenderData({
        sessionId,
        session,
        enhanced,
        username: auth?.username || 'preview',
        projectSlug: foundProj.dirName,
        sessionSlug: sessionId,
        sourceTool: session.source || 'claude',
        agentSummary,
        template: templateName,
      });

      let html: string;
      try {
        html = renderSessionHtml(renderData, templateName);
      } catch {
        templateName = 'editorial';
        html = renderSessionHtml(renderData, templateName);
      }
      const css = getTemplateCss(templateName);
      const templateInfo = getTemplateInfo(templateName);

      res.json({
        html, css, template: templateName,
        accent: templateInfo?.accent ?? '#084471',
        mode: templateInfo?.mode ?? 'light',
      });
    } catch (err) {
      console.error('[api/session/render] Error:', (err as Error).message);
      res.status(500).json({ error: 'Session render failed' });
    }
  });

  // Portfolio preview -- serves full standalone HTML page with real user data.
  // Cached for PORTFOLIO_PREVIEW_CACHE_TTL ms; the React PreviewPane reloads
  // the iframe on every keystroke (post-debounce), and re-rendering every
  // project's Liquid template on each hit is expensive.
  router.get('/preview/portfolio', async (_req: Request, res: Response) => {
    const cached = portfolioPreviewCache.get('portfolio');
    if (cached && cached.expiresAt > Date.now()) {
      res.type('html').send(cached.html);
      return;
    }
    try {
      const profile = getPortfolioProfile();
      const auth = getAuthToken();
      const templateName = getDefaultTemplate() || 'editorial';

      // Build portfolio projects from real project data
      const rawProjects = await ctx.getProjects();
      const portfolioProjects: PortfolioProject[] = [];
      let totalDuration = 0;
      let totalAgentDuration = 0;
      let totalLoc = 0;
      let totalSessions = 0;

      for (const rawProj of rawProjects) {
        try {
          const proj = await ctx.getProjectWithStats(rawProj) as Record<string, unknown>;
          const cached = loadProjectEnhanceResult(rawProj.dirName);
          const projDuration = (proj.totalDuration as number) || 0;
          const projAgentDuration = (proj.totalAgentDuration as number) || 0;
          const projLoc = (proj.totalLoc as number) || 0;
          const projSessions = (proj.sessionCount as number) || 0;

          totalDuration += projDuration;
          totalAgentDuration += projAgentDuration;
          totalLoc += projLoc;
          totalSessions += projSessions;

          const title = (cached as Record<string, unknown> | null)?.title as string | undefined
            || (proj.name as string) || displayNameFromDir(rawProj.dirName);

          // Session activity for charts
          const dbSessions = getSessionsByProject(ctx.db, rawProj.dirName);
          const sessionActivity = dbSessions
            .filter(s => !s.is_subagent)
            .map(s => ({
              date: s.start_time || '',
              loc: (s.loc_added || 0) + (s.loc_removed || 0),
              durationMinutes: s.duration_minutes || 0,
            }));

          portfolioProjects.push({
            slug: toSlug(title),
            title,
            narrative: cached?.result?.narrative || (proj.description as string) || '',
            totalSessions: projSessions,
            totalLoc: projLoc,
            totalDurationMinutes: projDuration,
            totalAgentDurationMinutes: projAgentDuration,
            totalFilesChanged: (proj.totalFiles as number) || 0,
            skills: cached?.result?.skills || (proj.skills as string[]) || [],
            publishedCount: 0,
            sessions: sessionActivity,
          });
        } catch { /* skip projects that fail */ }
      }

      // Always use real project data; fall back gracefully for missing profile fields
      const username = auth?.username || 'preview';
      const renderData: PortfolioRenderData = {
        user: {
          username,
          accent: '#084471',
          displayName: profile.displayName || '',
          bio: profile.bio || '',
          location: profile.location || '',
          status: 'active',
          email: profile.email,
          phone: profile.phone,
          photoUrl: profile.photoBase64 || undefined,
          linkedinUrl: profile.linkedinUrl,
          githubUrl: profile.githubUrl,
          twitterHandle: profile.twitterHandle,
          websiteUrl: profile.websiteUrl,
          resumeUrl: profile.resumeBase64 ? '#' : undefined,
        },
        projects: portfolioProjects,
        totalDurationMinutes: totalDuration,
        totalAgentDurationMinutes: totalAgentDuration || undefined,
        totalLoc,
        totalSessions,
      };

      const bodyHtml = renderPortfolioHtml(renderData, templateName);
      const fullHtml = ctx.buildPreviewPage(
        renderData.user.displayName ? `${renderData.user.displayName}'s Portfolio` : 'Portfolio Preview',
        bodyHtml,
        'PREVIEW — this is how your portfolio will appear on heyi.am',
        templateName,
      );
      portfolioPreviewCache.set('portfolio', {
        html: fullHtml,
        expiresAt: Date.now() + PORTFOLIO_PREVIEW_CACHE_TTL,
      });
      res.type('html').send(fullHtml);
    } catch (err) {
      console.error('[portfolio-preview] Error:', (err as Error).message);
      res.status(500).send('Portfolio preview failed');
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
