// Express router for the GitHub Pages publish target (Phase 5).
//
// All routes are authenticated via the existing `getAuthToken` Bearer
// pattern — the GitHub access token itself lives in the OS keychain via
// `cli/src/github.ts` and is NEVER returned to the client.

import { Router, type Request, type Response } from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAuthToken } from '../auth.js';
import {
  requestDeviceCode,
  pollForTokenOnce,
  storeToken,
  loadToken,
  deleteToken,
  listRepos,
  getAuthenticatedUser,
  pushSiteToRepo,
  enablePages,
  pollPagesBuild,
  GitHubError,
} from '../github.js';
import {
  getDefaultTemplate,
  getPortfolioProfile,
  hashPortfolioProfile,
  updatePortfolioPublishTarget,
  type ProjectEnhanceCache,
} from '../settings.js';
import { generatePortfolioSite, type PortfolioSiteProjectInput } from '../export.js';
import { buildPortfolioRenderData } from './portfolio-render-data.js';
import { buildProjectDetail, type RouteContext } from './context.js';
import { invalidatePortfolioPreviewCache } from './preview.js';

const GITHUB_TARGET = 'github';

interface ErrorResponse {
  error: { code: string; message: string };
}

function authError(res: Response): void {
  res.status(401).json({
    error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
  } satisfies ErrorResponse);
}

function handleGitHubError(res: Response, err: unknown, fallbackCode: string): void {
  if (err instanceof GitHubError) {
    const status =
      err.code === 'KEYCHAIN_UNAVAILABLE' ? 503
      : err.code === 'NO_TOKEN' ? 401
      : err.status && err.status >= 400 && err.status < 600 ? err.status
      : 500;
    res.status(status).json({
      error: { code: err.code, message: err.message },
    } satisfies ErrorResponse);
    return;
  }
  res.status(500).json({
    error: { code: fallbackCode, message: (err as Error).message },
  } satisfies ErrorResponse);
}

export function createGithubRouter(ctx: RouteContext): Router {
  const router = Router();

  // ── Device-flow kickoff ────────────────────────────────────────────
  router.post('/api/github/device-code', async (_req: Request, res: Response) => {
    if (!getAuthToken()) { authError(res); return; }
    try {
      // Scope rationale: public_repo is the minimum needed to push portfolio
      // sites to user-owned public repos and enable Pages on them. We do NOT
      // request the broader 'repo' scope — portfolios are inherently public,
      // and narrowing the scope shrinks the blast radius if a user is ever
      // phished using this app's client_id (RFC 8628 client_ids are public).
      // If users ever request private-repo support, expand to ['repo'] then.
      const body = await requestDeviceCode(['public_repo']);
      res.json({
        device_code: body.device_code,
        user_code: body.user_code,
        verification_uri: body.verification_uri,
        expires_in: body.expires_in,
        interval: body.interval,
      });
    } catch (err) {
      handleGitHubError(res, err, 'DEVICE_CODE_FAILED');
    }
  });

  // ── Device-flow single-poll + keychain write ─────────────────────
  // Returns immediately in ALL cases — no blocking loop.
  // The frontend is responsible for calling this on an interval.
  router.post('/api/github/poll-token', async (req: Request, res: Response) => {
    if (!getAuthToken()) { authError(res); return; }
    const { device_code: deviceCode } = (req.body ?? {}) as {
      device_code?: unknown;
    };
    if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
      res.status(400).json({
        error: { code: 'INVALID_DEVICE_CODE', message: 'device_code is required' },
      } satisfies ErrorResponse);
      return;
    }
    try {
      const result = await pollForTokenOnce(deviceCode);
      if (result.status === 'success') {
        await storeToken(result.access_token);
        const user = await getAuthenticatedUser(result.access_token);
        res.json({
          status: 'success',
          account: { login: user.login, name: user.name, avatarUrl: user.avatar_url },
        });
        return;
      }
      // pending / expired / denied — return status directly, no token in response.
      res.json({ status: result.status });
    } catch (err) {
      handleGitHubError(res, err, 'TOKEN_POLL_FAILED');
    }
  });

  // ── Connected account (GET + DELETE) ──────────────────────────────
  router.get('/api/github/account', async (_req: Request, res: Response) => {
    if (!getAuthToken()) { authError(res); return; }
    try {
      const token = await loadToken();
      if (!token) { res.json({ account: null }); return; }
      const user = await getAuthenticatedUser(token);
      res.json({
        account: { login: user.login, name: user.name, avatarUrl: user.avatar_url },
      });
    } catch (err) {
      handleGitHubError(res, err, 'GITHUB_API_FAILED');
    }
  });

  router.delete('/api/github/account', async (_req: Request, res: Response) => {
    if (!getAuthToken()) { authError(res); return; }
    try {
      await deleteToken();
      res.json({ ok: true });
    } catch (err) {
      handleGitHubError(res, err, 'KEYCHAIN_UNAVAILABLE');
    }
  });

  // ── Repo list ─────────────────────────────────────────────────────
  router.get('/api/github/repos', async (_req: Request, res: Response) => {
    if (!getAuthToken()) { authError(res); return; }
    try {
      const token = await loadToken();
      if (!token) {
        res.status(401).json({
          error: { code: 'NO_GITHUB_TOKEN', message: 'GitHub account not connected' },
        } satisfies ErrorResponse);
        return;
      }
      const repos = await listRepos(token);
      res.json({ repos });
    } catch (err) {
      handleGitHubError(res, err, 'GITHUB_API_FAILED');
    }
  });

  // ── Publish: render portfolio -> push to repo -> enable Pages ─────
  router.post('/api/github/publish', async (req: Request, res: Response) => {
    const auth = getAuthToken();
    if (!auth) { authError(res); return; }

    const { owner, repo, branch } = (req.body ?? {}) as {
      owner?: unknown;
      repo?: unknown;
      branch?: unknown;
    };
    if (typeof owner !== 'string' || owner.length === 0
      || typeof repo !== 'string' || repo.length === 0) {
      res.status(400).json({
        error: { code: 'INVALID_TARGET', message: 'owner and repo are required strings' },
      } satisfies ErrorResponse);
      return;
    }
    const branchName = typeof branch === 'string' && branch.length > 0 ? branch : 'gh-pages';

    let tempDir: string | null = null;
    try {
      const token = await loadToken();
      if (!token) {
        res.status(401).json({
          error: { code: 'NO_GITHUB_TOKEN', message: 'GitHub account not connected' },
        } satisfies ErrorResponse);
        return;
      }

      // Build portfolio site into a temp directory.
      const templateName = getDefaultTemplate() || 'editorial';
      const { renderData } = await buildPortfolioRenderData(ctx, auth);

      const rawProjects = await ctx.getProjects();
      const projectInputs: PortfolioSiteProjectInput[] = [];
      for (const rawProj of rawProjects) {
        try {
          const detail = buildProjectDetail(ctx.db, rawProj);
          const cache = (detail.enhanceCache as ProjectEnhanceCache | null) ?? {
            fingerprint: 'gh-publish',
            enhancedAt: new Date().toISOString(),
            selectedSessionIds: detail.sessions.map((s) => s.id),
            result: { narrative: '', arc: [], skills: [], timeline: [], questions: [] },
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
          console.warn(`[github-publish] skipping project ${rawProj.dirName}:`, (projErr as Error).message);
        }
      }

      tempDir = mkdtempSync(join(tmpdir(), 'heyiam-gh-'));
      await generatePortfolioSite(renderData, projectInputs, tempDir, templateName);

      await pushSiteToRepo({
        token, owner, repo, branch: branchName, sourceDir: tempDir,
      });
      await enablePages({ token, owner, repo, branch: branchName });
      await pollPagesBuild({ token, owner, repo });

      const url = `https://${owner}.github.io/${repo}/`;
      const publishedAt = new Date().toISOString();
      const profile = getPortfolioProfile();
      const hash = hashPortfolioProfile(profile);

      updatePortfolioPublishTarget(GITHUB_TARGET, {
        lastPublishedAt: publishedAt,
        lastPublishedProfileHash: hash,
        lastPublishedProfile: profile,
        config: { owner, repo, branch: branchName },
        url,
        lastError: undefined,
        lastErrorAt: undefined,
      });

      invalidatePortfolioPreviewCache();

      res.json({ ok: true, url, publishedAt, hash });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        updatePortfolioPublishTarget(GITHUB_TARGET, {
          lastError: message,
          lastErrorAt: new Date().toISOString(),
        });
      } catch { /* do not mask original error */ }
      handleGitHubError(res, err, 'GITHUB_PUBLISH_FAILED');
    } finally {
      if (tempDir) {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  });

  return router;
}
