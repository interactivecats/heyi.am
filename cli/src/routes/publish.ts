import { Router, type Request, type Response } from 'express';
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuthToken } from '../auth.js';
import { API_URL, PUBLIC_URL, warnIfNonDefaultApiUrl } from '../config.js';
import {
  loadEnhancedData,
  saveEnhancedData,
  saveUploadedState,
  getDefaultTemplate,
  getPortfolioProfile,
  hashPortfolioProfile,
  updatePortfolioPublishTarget,
  getPortfolioPublishState,
  DEFAULT_PORTFOLIO_TARGET,
} from '../settings.js';
import { generatePortfolioHtmlFragment, generateProjectHtmlFragment, generatePortfolioSite, createZipBuffer, type PortfolioSiteProjectInput, type HtmlFile } from '../export.js';
import { buildPortfolioRenderData } from './portfolio-render-data.js';
import { buildProjectDetail } from './context.js';
import type { ProjectEnhanceCache } from '../settings.js';
import { captureScreenshot } from '../screenshot.js';
import { redactSession, redactText, scanTextSync, formatFindings, stripHomePathsInText } from '../redact.js';
import { renderProjectHtml, renderSessionHtml } from '../render/index.js';
import { buildSessionRenderData, buildSessionCard, buildProjectRenderData } from '../render/build-render-data.js';
import type { SessionCard } from '../render/types.js';
import type { ProjectEnhanceResult } from '../llm/project-enhance.js';
import { buildAgentSummary, type RouteContext } from './context.js';
import { invalidatePortfolioPreviewCache } from './preview.js';
import { startSSE } from './sse.js';
import { displayNameFromDir } from '../sync.js';
import { toSlug } from '../format-utils.js';
import { getProjectUuid, getFileCountWithChildren } from '../db.js';

const IMAGE_KEY_PREFIX = 'images/';

export function createPublishRouter(ctx: RouteContext): Router {
  const router = Router();

  // Render project preview HTML
  router.post('/api/projects/:project/render-preview', async (req: Request, res: Response) => {
    try {
      const {
        username, slug, title, narrative, repoUrl, projectUrl, screenshotUrl,
        timeline, skills, totalSessions, totalLoc,
        totalDurationMinutes, totalAgentDurationMinutes, totalFilesChanged,
        totalTokens,
        sessionCards,
      } = req.body as {
        username: string;
        slug: string;
        title: string;
        narrative: string;
        repoUrl?: string;
        projectUrl?: string;
        screenshotUrl?: string;
        timeline: Array<{ period: string; label: string; sessions: Array<Record<string, unknown>> }>;
        skills: string[];
        totalSessions: number;
        totalLoc: number;
        totalDurationMinutes: number;
        totalAgentDurationMinutes?: number;
        totalFilesChanged: number;
        totalTokens?: number;
        sessionCards: SessionCard[];
      };

      const renderData = buildProjectRenderData({
        username: username || 'preview',
        slug, title, narrative,
        repoUrl, projectUrl, screenshotUrl,
        timeline: timeline || [],
        skills: skills || [],
        totalSessions: totalSessions || 0,
        totalLoc: totalLoc || 0,
        totalDurationMinutes: totalDurationMinutes || 0,
        totalAgentDurationMinutes,
        totalFilesChanged: totalFilesChanged || 0,
        totalTokens,
        sessionCards: sessionCards || [],
      });

      const templateName = getDefaultTemplate() || 'editorial';
      const html = renderProjectHtml(renderData, undefined, templateName);
      res.json({ html });
    } catch (err) {
      res.status(500).json({ error: { code: 'RENDER_FAILED', message: (err as Error).message } });
    }
  });

  // Auto-capture screenshot
  router.post('/api/projects/:project/screenshot-capture', async (req: Request, res: Response) => {
    const { url, slug } = req.body as { url: string; slug: string };
    if (!url) { res.status(400).json({ error: 'No URL provided' }); return; }

    const projectSlug = slug || String(req.params.project);
    try {
      const screenshotPath = await captureScreenshot(url, projectSlug);
      if (!screenshotPath) {
        res.status(422).json({ error: 'Chrome not available or capture failed' });
        return;
      }

      const imageData = readFileSync(screenshotPath);
      const base64 = imageData.toString('base64');
      // Portfolio listing shows project screenshots — bust the cache.
      invalidatePortfolioPreviewCache();
      res.json({ ok: true, preview: `data:image/png;base64,${base64}` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Publish project -- SSE stream with per-session progress
  router.post('/api/projects/:project/upload', async (req: Request, res: Response) => {
    const { project } = req.params;
    const auth = getAuthToken();
    warnIfNonDefaultApiUrl();

    if (!auth) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }

    const {
      title: rawTitle, slug: rawSlug, narrative, repoUrl, projectUrl,
      timeline, skills, totalSessions, totalLoc,
      totalDurationMinutes, totalAgentDurationMinutes,
      totalFilesChanged,
      skippedSessions, selectedSessionIds,
      screenshotBase64,
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
      screenshotBase64?: string;
    };

    // Ensure slug is the short project name, not the full encoded directory path
    const shortName = displayNameFromDir(String(project));
    const baseSlug = toSlug(shortName);
    const title = rawTitle === rawSlug ? shortName : rawTitle;

    // Get stable project UUID from CLI database
    const clientProjectId = getProjectUuid(ctx.db, String(project));

    const send = startSSE(res);

    try {
      // Step 1: Upsert project on Phoenix (with slug conflict retry)
      send({ type: 'project', status: 'creating' });

      let slug = baseSlug;
      let projectRes: globalThis.Response | null = null;
      const MAX_SLUG_RETRIES = 10;

      for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
        projectRes = await fetch(`${API_URL}/api/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            project: {
              client_project_id: clientProjectId,
              title, slug, narrative,
              repo_url: repoUrl || null,
              project_url: projectUrl || null,
              timeline, skills,
              total_sessions: totalSessions,
              total_loc: totalLoc,
              total_duration_minutes: totalDurationMinutes,
              total_agent_duration_minutes: totalAgentDurationMinutes || null,
              total_files_changed: totalFilesChanged,
              total_input_tokens: (req.body as Record<string, unknown>).totalInputTokens || null,
              total_output_tokens: (req.body as Record<string, unknown>).totalOutputTokens || null,
              skipped_sessions: skippedSessions,
            },
          }),
        });

        if (projectRes.status === 409) {
          // Slug conflict — try with suffix
          slug = `${baseSlug}-${attempt + 1}`;
          send({ type: 'project', status: 'slug_conflict', slug, retry: attempt + 1 });
          continue;
        }
        break;
      }

      if (!projectRes!.ok) {
        const errBody = await projectRes!.json().catch(() => ({ error: 'Project creation failed' }));
        const rawErr = (errBody as { error?: unknown }).error;
        const errMsg = typeof rawErr === 'string' ? rawErr
          : (rawErr && typeof rawErr === 'object' && 'details' in rawErr) ? JSON.stringify((rawErr as { details: unknown }).details)
          : (rawErr && typeof rawErr === 'object' && 'message' in rawErr) ? (rawErr as { message: string }).message
          : `HTTP ${projectRes!.status}`;
        send({ type: 'project', status: 'failed', error: errMsg, fatal: true });
        res.end();
        return;
      }

      const projectData = await projectRes!.json() as { project_id: number; slug: string };
      send({ type: 'project', status: 'created', projectId: projectData.project_id, slug: projectData.slug });

      // Step 1b: Upload screenshot (non-fatal)
      let uploadedImageKey: string | null = null;
      if (screenshotBase64 || projectUrl) {
        try {
          let imageBuffer: Buffer | null = null;
          let ext = 'png';

          if (screenshotBase64) {
            send({ type: 'screenshot', status: 'capturing' });
            const raw = screenshotBase64.includes(',') ? screenshotBase64.split(',')[1] : screenshotBase64;
            imageBuffer = Buffer.from(raw, 'base64');
            ext = screenshotBase64.startsWith('data:image/jpeg') || screenshotBase64.startsWith('data:image/jpg') ? 'jpg' : 'png';
          } else if (projectUrl) {
            send({ type: 'screenshot', status: 'capturing' });
            const screenshotPath = await captureScreenshot(projectUrl, projectData.slug);
            if (screenshotPath) {
              imageBuffer = readFileSync(screenshotPath) as unknown as Buffer;
            }
          }

          if (imageBuffer) {
            const imageKey = `${IMAGE_KEY_PREFIX}${randomUUID()}.${ext}`;
            const ssUrlRes = await fetch(`${API_URL}/api/projects/${projectData.slug}/screenshot-url`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
              },
              body: JSON.stringify({ key: imageKey }),
            });
            if (ssUrlRes.ok) {
              const { upload_url, key } = await ssUrlRes.json() as { upload_url: string; key: string };
              const putRes = await fetch(upload_url, {
                method: 'PUT',
                body: new Uint8Array(imageBuffer),
                headers: { 'Content-Type': `image/${ext}` },
              });
              if (!putRes.ok) {
                send({ type: 'screenshot', status: 'skipped', reason: `S3 upload failed: ${putRes.status}` });
              } else {
                await fetch(`${API_URL}/api/projects/${projectData.slug}/screenshot-key`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${auth.token}`,
                  },
                  body: JSON.stringify({ key }),
                });
                uploadedImageKey = key;
                send({ type: 'screenshot', status: 'uploaded' });
              }
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

      // Step 2: Publish selected sessions
      const projects = await ctx.getProjects();
      const proj = projects.find((p) => p.dirName === project);
      let uploadedCount = 0;
      const failedSessions: Array<{ sessionId: string; error: string }> = [];
      const uploadedSessionCards: SessionCard[] = [];

      if (proj) {
        const selectedTemplate = getDefaultTemplate() || 'editorial';
        for (const sessionId of selectedSessionIds) {
          const meta = proj.sessions.find((s) => s.sessionId === sessionId);
          if (!meta) continue;

          send({ type: 'session', sessionId, status: 'uploading' });

          try {
            const session = await ctx.loadSession(meta.path, proj.name, sessionId);
            const enhanced = loadEnhancedData(sessionId);
            const sessionSlug = toSlug(enhanced?.title ?? session.title ?? sessionId, 80);

            const agentSummary = await buildAgentSummary(
              meta.children ?? [],
              (c) => ctx.getSessionStats(c, proj.name),
              { deduplicate: true },
            );

            const devTake = (enhanced?.developerTake ?? session.developerTake ?? '').slice(0, 2000);
            const sessionNarrative = (enhanced as { narrative?: string })?.narrative ?? '';
            const sessionTitle = enhanced?.title ?? session.title;
            const sessionSkills = enhanced?.skills ?? session.skills ?? [];
            const sessionSourceTool = session.source ?? meta.source ?? 'claude';
            const sessionRecordedAt = session.date ? new Date(session.date).toISOString() : new Date().toISOString();
            const renderOpts = {
              sessionId,
              session,
              enhanced,
              username: auth.username,
              projectSlug: projectData.slug,
              sessionSlug,
              sourceTool: sessionSourceTool,
              agentSummary,
              template: selectedTemplate,
            };

            let sessionRenderedHtml: string | null = null;
            try {
              const sessionRenderData = buildSessionRenderData(renderOpts);
              sessionRenderedHtml = renderSessionHtml(sessionRenderData, selectedTemplate);
            } catch (renderErr) {
              console.error(`[upload] Session render failed for ${sessionId}:`, (renderErr as Error).message);
            }

            uploadedSessionCards.push(buildSessionCard(renderOpts));

            const childLoc = agentSummary?.agents?.reduce(
              (s: number, a: { loc_changed?: number }) => s + (a.loc_changed ?? 0), 0,
            ) ?? 0;
            const totalLocChanged = (session.linesOfCode ?? 0) + childLoc;
            const totalFilesChanged = getFileCountWithChildren(ctx.db, sessionId) || session.filesChanged?.length || 0;

            const sessionPayload = {
              session: {
                title: sessionTitle,
                dev_take: devTake,
                context: enhanced?.context ?? '',
                duration_minutes: session.durationMinutes ?? 0,
                turns: session.turns ?? 0,
                files_changed: totalFilesChanged,
                loc_changed: totalLocChanged,
                recorded_at: sessionRecordedAt,
                end_time: session.endTime ? new Date(session.endTime).toISOString() : null,
                cwd: session.cwd ?? null,
                wall_clock_minutes: session.wallClockMinutes ?? null,
                template: selectedTemplate,
                language: null,
                tools: session.toolBreakdown?.map((t) => t.tool) ?? [],
                skills: sessionSkills,
                narrative: sessionNarrative,
                project_name: proj.name,
                project_id: projectData.project_id,
                slug: sessionSlug,
                status: 'unlisted',
                source_tool: sessionSourceTool,
                agent_summary: agentSummary,
                rendered_html: sessionRenderedHtml,
              },
            };

            const sessionData = {
              version: 1,
              id: sessionId,
              title: sessionTitle,
              dev_take: devTake,
              context: enhanced?.context ?? '',
              duration_minutes: session.durationMinutes ?? 0,
              turns: session.turns ?? 0,
              files_changed: (session.filesChanged ?? []).slice(0, 20).map((f) => (typeof f === 'string' ? { path: f, additions: 0, deletions: 0 } : f)),
              loc_changed: totalLocChanged,
              date: sessionRecordedAt,
              end_time: (() => {
                if (!session.endTime || !session.date) return null;
                const wallMs = new Date(session.endTime).getTime() - new Date(session.date).getTime();
                const activeMs = (session.durationMinutes ?? 0) * 60_000;
                return wallMs <= activeMs * 3 ? new Date(session.endTime).toISOString() : null;
              })(),
              cwd: session.cwd ?? null,
              wall_clock_minutes: session.wallClockMinutes ?? null,
              template: selectedTemplate,
              skills: sessionSkills,
              tools: session.toolBreakdown?.map((t) => t.tool) ?? [],
              source: sessionSourceTool,
              slug: sessionSlug,
              project_name: proj.name,
              narrative: sessionNarrative,
              status: 'unlisted' as const,
              raw_log: [] as string[],
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

            const sessionCwd = session.cwd ?? undefined;
            const redactedPayload = redactSession(sessionPayload, 'high', sessionCwd);
            const redactedData = redactSession(sessionData as Record<string, unknown>, 'high', sessionCwd);

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
              } catch { /* Response already consumed or no upload_urls -- not fatal */ }

              if (enhanced) {
                saveEnhancedData(sessionId, { ...enhanced, uploaded: true });
              }
              send({ type: 'session', sessionId, status: 'uploaded' });
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

      // Step 3: Render project HTML using the same path as HTML export
      if (uploadedSessionCards.length > 0) {
        try {
          send({ type: 'project', status: 'rendering' });

          const { buildProjectDetail } = await import('./context.js');
          const { generateProjectHtmlFragment } = await import('../export.js');
          const detail = buildProjectDetail(ctx.db, proj!);
          const cache = (detail.enhanceCache as import('../settings.js').ProjectEnhanceCache)
            ?? { fingerprint: 'upload', enhancedAt: new Date().toISOString(), selectedSessionIds, result: { narrative, arc: [], skills, timeline, questions: [] } };
          const totalFiles = (detail.project as Record<string, unknown>).totalFiles as number;

          const enrichedCache = {
            ...cache,
            ...(repoUrl && { repoUrl }),
            ...(projectUrl && { projectUrl }),
          };

          // Use unguessable UUID URL — only set if S3 upload actually succeeded
          const screenshotUrl = uploadedImageKey
            ? `${PUBLIC_URL}/_img/${uploadedImageKey.replace(IMAGE_KEY_PREFIX, '')}`
            : undefined;

          const detailProj = detail.project as Record<string, unknown>;
          const projectHtml = generateProjectHtmlFragment(
            String(project), enrichedCache, detail.sessions,
            auth.username, {
              totalFilesChanged: totalFiles,
              title,
              screenshotUrl,
              totalInputTokens: detailProj.totalInputTokens as number | undefined,
              totalOutputTokens: detailProj.totalOutputTokens as number | undefined,
            },
          );

          const renderRes = await fetch(`${API_URL}/api/projects`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              project: {
                client_project_id: clientProjectId,
                title, slug, narrative,
                repo_url: repoUrl || null,
                project_url: projectUrl || null,
                timeline, skills,
                total_sessions: totalSessions,
                total_loc: totalLoc,
                total_duration_minutes: totalDurationMinutes,
                total_agent_duration_minutes: totalAgentDurationMinutes || null,
                total_files_changed: totalFilesChanged,
                total_input_tokens: (req.body as Record<string, unknown>).totalInputTokens || null,
                total_output_tokens: (req.body as Record<string, unknown>).totalOutputTokens || null,
                skipped_sessions: skippedSessions,
                rendered_html: projectHtml,
              },
            }),
          });
          if (renderRes.ok) {
            send({ type: 'project', status: 'rendered' });
          } else {
            console.error('[upload] Project render update failed:', renderRes.status);
          }
        } catch (renderErr) {
          console.error('[upload] Project render failed:', (renderErr as Error).message);
        }
      }

      // Step 4: Track published state locally
      const uploadedSessionIds = selectedSessionIds.filter((sid: string) => {
        const enhanced = loadEnhancedData(sid);
        return enhanced?.uploaded;
      });
      if (proj) {
        saveUploadedState(proj.dirName, {
          slug: projectData.slug,
          projectId: projectData.project_id,
          uploadedSessions: uploadedSessionIds,
        });
      }

      const dashboardUrl = `${API_URL}/dashboard`;
      send({
        type: 'done',
        projectUrl: dashboardUrl,
        projectId: projectData.project_id,
        slug: projectData.slug,
        uploaded: uploadedCount,
        failed: failedSessions.length,
        failedSessions,
      });
      res.end();
    } catch (err) {
      console.error('[upload] Error:', (err as Error).message);
      send({ type: 'error', code: 'UPLOAD_FAILED', message: (err as Error).message });
      res.end();
    }
  });

  // Read the current portfolio publish state (per-target snapshots, hashes,
  // last errors, visibility). Authenticated via the same Bearer pattern as
  // the upload route — the state file lives in the user's local config dir
  // but it still references the signed-in identity, so don't leak it to
  // unauthenticated callers.
  router.get('/api/portfolio/state', async (_req: Request, res: Response) => {
    const auth = getAuthToken();
    if (!auth) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
      return;
    }
    try {
      const state = getPortfolioPublishState();
      res.json(state);
    } catch (err) {
      const message = (err as Error).message;
      console.error('[portfolio-state] Error:', message);
      res.status(500).json({
        error: { code: 'PORTFOLIO_STATE_READ_FAILED', message },
      });
    }
  });

  // Publish portfolio landing page to heyi.am
  // Renders the portfolio HTML fragment locally, POSTs it to Phoenix,
  // and persists the published snapshot + hash to settings on success.
  router.post('/api/portfolio/upload', async (req: Request, res: Response) => {
    const auth = getAuthToken();
    warnIfNonDefaultApiUrl();

    if (!auth) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
      return;
    }

    try {
      const profile = getPortfolioProfile();
      const templateName = getDefaultTemplate() || 'editorial';

      const { renderData, filteredProjects } = await buildPortfolioRenderData(ctx, auth);
      const renderedHtml = generatePortfolioHtmlFragment(renderData, templateName);

      // Upload individual project pages for every project included in the
      // portfolio. This ensures project detail pages exist on heyi.am even
      // if the user never published them individually.
      for (const rawProj of filteredProjects) {
        try {
          const detail = buildProjectDetail(ctx.db, rawProj);
          const proj = detail.project as Record<string, unknown>;
          const cache = (detail.enhanceCache as ProjectEnhanceCache | null)
            ?? { fingerprint: 'portfolio-upload', enhancedAt: new Date().toISOString(), selectedSessionIds: detail.sessions.map((s) => s.id), result: { narrative: '', arc: [], skills: [], timeline: [], questions: [] } };
          const title = cache.title
            || (proj.name as string) || displayNameFromDir(rawProj.dirName);
          const slug = toSlug(title);
          const clientProjectId = getProjectUuid(ctx.db, rawProj.dirName);

          const projectHtml = generateProjectHtmlFragment(
            rawProj.dirName, cache, detail.sessions,
            auth.username, {
              totalFilesChanged: proj.totalFiles as number | undefined,
              totalAgentDurationMinutes: proj.totalAgentDuration as number | undefined,
              totalInputTokens: proj.totalInputTokens as number | undefined,
              totalOutputTokens: proj.totalOutputTokens as number | undefined,
            },
          );

          await fetch(`${API_URL}/api/projects`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              project: {
                client_project_id: clientProjectId,
                title, slug,
                narrative: cache.result?.narrative ?? '',
                skills: cache.result?.skills ?? [],
                total_sessions: proj.sessionCount as number,
                total_loc: proj.totalLoc as number,
                total_duration_minutes: proj.totalDuration as number,
                total_agent_duration_minutes: proj.totalAgentDuration || null,
                total_files_changed: proj.totalFiles as number,
                total_input_tokens: proj.totalInputTokens as number | null,
                total_output_tokens: proj.totalOutputTokens as number | null,
                rendered_html: projectHtml,
              },
            }),
          });
        } catch (projErr) {
          console.warn(`[portfolio-upload] skipping project ${rawProj.dirName}:`, (projErr as Error).message);
        }
      }

      // POST portfolio landing page to Phoenix.
      // Phoenix sanitizes the HTML, persists to users.rendered_portfolio_html,
      // and applies the optional profile snapshot via Accounts.update_user_profile.
      const phoenixRes = await fetch(`${API_URL}/api/portfolio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          html: renderedHtml,
          profile,
        }),
      });

      if (!phoenixRes.ok) {
        const errBody = await phoenixRes.json().catch(() => null);
        const rawErr = errBody && typeof errBody === 'object'
          ? (errBody as { error?: unknown }).error
          : null;
        const errMsg = typeof rawErr === 'string'
          ? rawErr
          : (rawErr && typeof rawErr === 'object' && 'message' in rawErr)
            ? (rawErr as { message: string }).message
            : `HTTP ${phoenixRes.status}`;

        updatePortfolioPublishTarget(DEFAULT_PORTFOLIO_TARGET, {
          lastError: errMsg,
          lastErrorAt: new Date().toISOString(),
        });

        res.status(phoenixRes.status >= 500 ? 502 : phoenixRes.status).json({
          error: { code: 'PORTFOLIO_UPLOAD_FAILED', message: errMsg },
        });
        return;
      }

      const okBody = await phoenixRes.json().catch(() => ({})) as { username?: string };
      const publishedUrl = okBody.username ? `${API_URL}/${okBody.username}` : undefined;
      const publishedAt = new Date().toISOString();
      const hash = hashPortfolioProfile(profile);

      updatePortfolioPublishTarget(DEFAULT_PORTFOLIO_TARGET, {
        lastPublishedAt: publishedAt,
        lastPublishedProfileHash: hash,
        lastPublishedProfile: profile,
        config: {},
        url: publishedUrl,
        lastError: undefined,
        lastErrorAt: undefined,
      });

      // Published version of the portfolio just changed — drop any cached
      // /preview/portfolio HTML so the next preview reflects reality.
      invalidatePortfolioPreviewCache();

      res.json({
        ok: true,
        url: publishedUrl ?? `${API_URL}/${auth.username}`,
        publishedAt,
        hash,
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error('[portfolio-upload] Error:', errMsg);
      try {
        updatePortfolioPublishTarget(DEFAULT_PORTFOLIO_TARGET, {
          lastError: errMsg,
          lastErrorAt: new Date().toISOString(),
        });
      } catch { /* don't mask the original error */ }
      res.status(500).json({
        error: { code: 'PORTFOLIO_UPLOAD_FAILED', message: errMsg },
      });
    }
  });

  // Export the portfolio as a downloadable .zip file.
  //
  // No path arg from the client. We render the portfolio site into a temp
  // directory, zip it via createZipBuffer, stream the zip back as an
  // attachment, then clean up the temp dir. Mirrors the existing
  // single-project HTML download pattern (cli/src/routes/export.ts).
  router.post('/api/portfolio/export', async (_req: Request, res: Response) => {
    const auth = getAuthToken();
    if (!auth) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
      return;
    }

    let tmpDir: string | null = null;
    try {
      const templateName = getDefaultTemplate() || 'editorial';
      const { renderData } = await buildPortfolioRenderData(ctx, auth);

      // Build per-project inputs for generatePortfolioSite. Each project
      // needs its full session list + enhance cache — use the same
      // buildProjectDetail path the single-project HTML export uses so
      // there's exactly one "load everything about a project" helper.
      const rawProjects = await ctx.getProjects();
      const projectInputs: PortfolioSiteProjectInput[] = [];
      for (const rawProj of rawProjects) {
        try {
          const detail = buildProjectDetail(ctx.db, rawProj);
          const cache = (detail.enhanceCache as ProjectEnhanceCache | null) ?? {
            fingerprint: 'export',
            enhancedAt: new Date().toISOString(),
            selectedSessionIds: detail.sessions.map((s) => s.id),
            result: {
              narrative: '',
              arc: [],
              skills: [],
              timeline: [],
              questions: [],
            },
          };
          const proj = detail.project as Record<string, unknown>;
          projectInputs.push({
            dirName: rawProj.dirName,
            cache,
            sessions: detail.sessions,
            opts: {
              totalFilesChanged: proj.totalFiles as number | undefined,
              totalAgentDurationMinutes: proj.totalAgentDuration as number | undefined,
              totalInputTokens: proj.totalInputTokens as number | undefined,
              totalOutputTokens: proj.totalOutputTokens as number | undefined,
            },
          });
        } catch (projErr) {
          console.warn(`[portfolio-export] skipping project ${rawProj.dirName}:`, (projErr as Error).message);
        }
      }

      tmpDir = mkdtempSync(path.join(tmpdir(), 'heyiam-portfolio-'));
      const result = await generatePortfolioSite(
        renderData,
        projectInputs,
        tmpDir,
        templateName,
      );

      // Read every file generated into memory keyed by its path relative
      // to the temp dir, then zip. Skip non-files defensively (the result
      // list is files-only, but stat lets us catch directories that snuck
      // in via a future code path).
      const entries: HtmlFile[] = [];
      for (const filePath of result.files) {
        try {
          if (!statSync(filePath).isFile()) continue;
          entries.push({
            path: path.relative(tmpDir, filePath),
            content: readFileSync(filePath, 'utf-8'),
          });
        } catch (readErr) {
          console.warn(`[portfolio-export] skipping unreadable file ${filePath}:`, (readErr as Error).message);
        }
      }

      const zipBuffer = createZipBuffer(entries);
      const datestamp = new Date().toISOString().slice(0, 10);
      const safeUsername = auth.username.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `portfolio-${safeUsername}-${datestamp}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error('[portfolio-export] Error:', errMsg);
      if (!res.headersSent) {
        res.status(500).json({
          error: { code: 'PORTFOLIO_EXPORT_FAILED', message: errMsg },
        });
      }
    } finally {
      if (tmpDir) {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  });

  return router;
}
