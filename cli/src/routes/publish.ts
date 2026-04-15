import { Router, type Request, type Response } from 'express';
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuthToken } from '../auth.js';
import { API_URL, PUBLIC_URL, warnIfNonDefaultApiUrl } from '../config.js';
import {
  loadEnhancedData,
  saveUploadedState,
  getDefaultTemplate,
  getPortfolioProfile,
  hashPortfolioProfile,
  updatePortfolioPublishTarget,
  getPortfolioPublishState,
  listUploadedProjects,
  DEFAULT_PORTFOLIO_TARGET,
} from '../settings.js';
import { generatePortfolioHtmlFragment, generateProjectHtmlFragment, generatePortfolioSite, createZipBuffer, type PortfolioSiteProjectInput, type HtmlFile } from '../export.js';
import { buildPortfolioRenderData } from './portfolio-render-data.js';
import { buildProjectDetail } from './context.js';
import type { ProjectEnhanceCache } from '../settings.js';
import { captureScreenshot } from '../screenshot.js';
import { renderProjectHtml } from '../render/index.js';
import { buildProjectRenderData } from '../render/build-render-data.js';
import type { SessionCard } from '../render/types.js';
import type { ProjectEnhanceResult } from '../llm/project-enhance.js';
import { type RouteContext } from './context.js';
import { uploadSelectedSessions } from './project-session-upload.js';
import { invalidatePortfolioPreviewCache } from './preview.js';
import { startSSE } from './sse.js';
import { displayNameFromDir } from '../sync.js';
import { toSlug } from '../format-utils.js';
import { getProjectUuid } from '../db.js';

const IMAGE_KEY_PREFIX = 'images/';

/**
 * Upload the user's base64-encoded profile photo to S3 via the Phoenix
 * presign endpoints, then save the resulting key on the user record.
 * Returns the public `/_img/:uuid` URL suitable for og:image / <img src>,
 * or `null` if the upload failed (publish still proceeds without a photo).
 */
async function uploadProfilePhoto(
  photoBase64: string,
  auth: { token: string },
): Promise<string | null> {
  try {
    const match = photoBase64.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
    if (!match) return null;
    const mimeExt = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    // Hard-cap at 10 MB (same limit the `/_img/:uuid` route enforces when serving).
    if (buffer.length > 10_000_000) return null;

    const key = `${IMAGE_KEY_PREFIX}${randomUUID()}.${mimeExt}`;
    const presignRes = await fetch(`${API_URL}/api/portfolio/profile-photo-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ key }),
    });
    if (!presignRes.ok) return null;
    const { upload_url } = await presignRes.json() as { upload_url: string; key: string };

    const putRes = await fetch(upload_url, {
      method: 'PUT',
      body: new Uint8Array(buffer),
      headers: { 'Content-Type': `image/${mimeExt === 'jpg' ? 'jpeg' : mimeExt}` },
    });
    if (!putRes.ok) return null;

    const patchRes = await fetch(`${API_URL}/api/portfolio/profile-photo-key`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ key }),
    });
    if (!patchRes.ok) return null;

    return `${PUBLIC_URL}/_img/${key.replace(IMAGE_KEY_PREFIX, '')}`;
  } catch {
    return null;
  }
}

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
      let uploadedSessionCards: SessionCard[] = [];

      if (proj) {
        const sessionResult = await uploadSelectedSessions(ctx, auth, {
          proj,
          projectData,
          selectedSessionIds,
          send,
        });
        uploadedCount = sessionResult.uploadedCount;
        failedSessions.push(...sessionResult.failedSessions);
        uploadedSessionCards = sessionResult.uploadedSessionCards;
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

    const send = startSSE(res);

    try {
      send({ type: 'progress', message: 'Preparing portfolio…' });
      const profile = getPortfolioProfile();
      const templateName = getDefaultTemplate() || 'editorial';

      // Upload profile photo to S3 (if present) so og:image has a fetchable
      // URL. Failure is non-fatal — publish still proceeds with no photo.
      let photoUrlOverride: string | undefined;
      if (profile.photoBase64) {
        send({ type: 'progress', message: 'Uploading profile photo…' });
        const uploadedUrl = await uploadProfilePhoto(profile.photoBase64, auth);
        if (uploadedUrl) photoUrlOverride = uploadedUrl;
      } else {
        // No photo in current profile — clear any prior uploaded photo on
        // the server so deleted photos actually disappear.
        await fetch(`${API_URL}/api/portfolio/profile-photo`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${auth.token}` },
        }).catch(() => {});
      }

      const { renderData, filteredProjects } = await buildPortfolioRenderData(ctx, auth, { photoUrlOverride });
      send({ type: 'progress', message: 'Rendering portfolio HTML…' });
      const renderedHtml = generatePortfolioHtmlFragment(renderData, templateName);

      // Upload individual project pages for every project included in the
      // portfolio. This ensures project detail pages exist on heyi.am even
      // if the user never published them individually.
      const MAX_SLUG_RETRIES = 10;
      const slugMap = new Map<string, string>();

      send({ type: 'progress', message: `Publishing ${filteredProjects.length} project${filteredProjects.length === 1 ? '' : 's'}…` });

      let projectIndex = 0;
      for (const rawProj of filteredProjects) {
        projectIndex++;
        try {
          const allProjectsList = await ctx.getProjects();
          const projInfo = allProjectsList.find((p) => p.dirName === rawProj.dirName);
          if (!projInfo) {
            console.warn(`[portfolio-upload] project not found: ${rawProj.dirName}`);
            continue;
          }

          const detail = buildProjectDetail(ctx.db, rawProj);
          const enhance = detail.enhanceCache as ProjectEnhanceCache | null;
          const cache = enhance ?? {
            fingerprint: 'portfolio-upload',
            enhancedAt: new Date().toISOString(),
            selectedSessionIds: detail.sessions.map((s) => s.id),
            result: { narrative: '', arc: [], skills: [], timeline: [], questions: [] },
          };
          const selectedSessionIds = enhance !== null && enhance.selectedSessionIds !== undefined
            ? enhance.selectedSessionIds
            : detail.sessions.map((s) => s.id);

          const projRecord = detail.project as Record<string, unknown>;
          const title = cache.title
            || (projRecord.name as string) || displayNameFromDir(rawProj.dirName);
          const baseSlug = toSlug(title);
          const clientProjectId = getProjectUuid(ctx.db, rawProj.dirName);

          send({ type: 'project', project: title, index: projectIndex, total: filteredProjects.length, status: 'creating' });

          const projectHtmlPreview = generateProjectHtmlFragment(
            rawProj.dirName, cache, detail.sessions,
            auth.username, {
              totalFilesChanged: projRecord.totalFiles as number | undefined,
              totalAgentDurationMinutes: projRecord.totalAgentDuration as number | undefined,
              totalInputTokens: projRecord.totalInputTokens as number | undefined,
              totalOutputTokens: projRecord.totalOutputTokens as number | undefined,
            },
          );

          const projectBodyBase = {
            client_project_id: clientProjectId,
            title,
            narrative: cache.result?.narrative ?? '',
            repo_url: cache.repoUrl || null,
            project_url: cache.projectUrl || null,
            timeline: cache.result?.timeline ?? [],
            skills: cache.result?.skills ?? [],
            total_sessions: projRecord.sessionCount as number,
            total_loc: projRecord.totalLoc as number,
            total_duration_minutes: projRecord.totalDuration as number,
            total_agent_duration_minutes: projRecord.totalAgentDuration || null,
            total_files_changed: projRecord.totalFiles as number,
            total_input_tokens: projRecord.totalInputTokens as number | null,
            total_output_tokens: projRecord.totalOutputTokens as number | null,
            skipped_sessions: [] as Array<{ title: string; duration: number; loc: number; reason: string }>,
          };

          let slug = baseSlug;
          let projectRes: globalThis.Response | null = null;

          if (selectedSessionIds.length === 0) {
            for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
              projectRes = await fetch(`${API_URL}/api/projects`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${auth.token}`,
                },
                body: JSON.stringify({
                  project: {
                    ...projectBodyBase,
                    slug,
                    rendered_html: projectHtmlPreview,
                  },
                }),
              });
              if (projectRes.status === 409) {
                slug = `${baseSlug}-${attempt + 1}`;
                continue;
              }
              break;
            }
            if (projectRes?.ok) {
              const data = await projectRes.json().catch(() => null) as { slug?: string } | null;
              if (data?.slug && data.slug !== baseSlug) {
                slugMap.set(baseSlug, data.slug);
              }
            } else {
              const errText = await projectRes?.text().catch(() => '');
              console.warn(`[portfolio-upload] project ${rawProj.dirName} create failed:`, projectRes?.status, errText);
            }
            continue;
          }

          for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
            projectRes = await fetch(`${API_URL}/api/projects`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
              },
              body: JSON.stringify({
                project: {
                  ...projectBodyBase,
                  slug,
                },
              }),
            });
            if (projectRes.status === 409) {
              slug = `${baseSlug}-${attempt + 1}`;
              continue;
            }
            break;
          }

          if (!projectRes || !projectRes.ok) {
            const errText = await projectRes?.text().catch(() => '') ?? '';
            console.warn(`[portfolio-upload] project ${rawProj.dirName} create failed:`, projectRes?.status, errText);
            continue;
          }

          const projectData = await projectRes.json() as { project_id: number; slug: string };
          if (projectData.slug !== baseSlug) {
            slugMap.set(baseSlug, projectData.slug);
          }
          send({ type: 'project', project: title, index: projectIndex, total: filteredProjects.length, status: 'created' });

          send({ type: 'progress', message: `Uploading ${selectedSessionIds.length} session${selectedSessionIds.length === 1 ? '' : 's'} for ${title}…` });
          const { uploadedSessionCards } = await uploadSelectedSessions(ctx, auth, {
            proj: projInfo,
            projectData,
            selectedSessionIds,
            sessionStatus: 'listed',
            send: (evt) => send({ ...evt, project: title }),
          });

          // Ensure all existing sessions for this project are listed
          await fetch(`${API_URL}/api/sessions/bulk-status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({ project_id: projectData.project_id, status: 'listed' }),
          }).catch((e) => console.warn(`[portfolio-upload] bulk-status failed for ${title}:`, (e as Error).message));

          if (uploadedSessionCards.length === 0) {
            continue;
          }

          try {
            const detailAfter = buildProjectDetail(ctx.db, rawProj);
            const cacheAfter = (detailAfter.enhanceCache as ProjectEnhanceCache | null) ?? cache;
            const totalFiles = (detailAfter.project as Record<string, unknown>).totalFiles as number;
            const projectHtmlFinal = generateProjectHtmlFragment(
              rawProj.dirName, cacheAfter, detailAfter.sessions,
              auth.username, {
                totalFilesChanged: totalFiles,
                totalInputTokens: (detailAfter.project as Record<string, unknown>).totalInputTokens as number | undefined,
                totalOutputTokens: (detailAfter.project as Record<string, unknown>).totalOutputTokens as number | undefined,
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
                  ...projectBodyBase,
                  slug: projectData.slug,
                  rendered_html: projectHtmlFinal,
                },
              }),
            });
            if (!renderRes.ok) {
              console.warn(`[portfolio-upload] project ${rawProj.dirName} rendered_html update failed:`, renderRes.status);
            }
          } catch (renderErr) {
            console.warn(`[portfolio-upload] project render update ${rawProj.dirName}:`, (renderErr as Error).message);
          }

          const uploadedSessionIds = selectedSessionIds.filter((sid: string) => {
            const enhanced = loadEnhancedData(sid);
            return enhanced?.uploaded;
          });
          saveUploadedState(rawProj.dirName, {
            slug: projectData.slug,
            projectId: projectData.project_id,
            uploadedSessions: uploadedSessionIds,
          });
        } catch (projErr) {
          console.warn(`[portfolio-upload] skipping project ${rawProj.dirName}:`, (projErr as Error).message);
        }
      }

      // Demote sessions on projects that were previously published but are
      // no longer included in the portfolio.
      const includedDirNames = new Set(filteredProjects.map((p) => p.dirName));
      const previouslyUploaded = listUploadedProjects();
      for (const { dirName, state } of previouslyUploaded) {
        if (includedDirNames.has(dirName)) continue;
        try {
          send({ type: 'progress', message: `Demoting sessions for removed project "${dirName}"…` });
          await fetch(`${API_URL}/api/sessions/bulk-status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({ project_id: state.projectId, status: 'unlisted' }),
          });
        } catch (demoteErr) {
          console.warn(`[portfolio-upload] failed to demote sessions for ${dirName}:`, (demoteErr as Error).message);
        }
      }

      // Rewrite project links in the portfolio HTML to match the actual
      // Phoenix-assigned slugs (which may differ due to conflict retries).
      let finalHtml = renderedHtml;
      for (const [originalSlug, actualSlug] of slugMap) {
        const pattern = `/${auth.username}/${originalSlug}"`;
        const replacement = `/${auth.username}/${actualSlug}"`;
        while (finalHtml.includes(pattern)) {
          finalHtml = finalHtml.replace(pattern, replacement);
        }
      }

      send({ type: 'progress', message: 'Publishing landing page…' });

      const phoenixRes = await fetch(`${API_URL}/api/portfolio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          html: finalHtml,
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

        send({ type: 'error', code: 'PORTFOLIO_UPLOAD_FAILED', message: errMsg });
        res.end();
        return;
      }

      const okBody = await phoenixRes.json().catch(() => ({})) as { username?: string };
      const publishedUrl = okBody.username ? `${PUBLIC_URL}/${okBody.username}` : undefined;
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

      invalidatePortfolioPreviewCache();

      send({
        type: 'done',
        ok: true,
        url: publishedUrl ?? `${PUBLIC_URL}/${auth.username}`,
        publishedAt,
        hash,
      });
      res.end();
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error('[portfolio-upload] Error:', errMsg);
      try {
        updatePortfolioPublishTarget(DEFAULT_PORTFOLIO_TARGET, {
          lastError: errMsg,
          lastErrorAt: new Date().toISOString(),
        });
      } catch { /* don't mask the original error */ }
      send({ type: 'error', code: 'PORTFOLIO_UPLOAD_FAILED', message: errMsg });
      res.end();
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
