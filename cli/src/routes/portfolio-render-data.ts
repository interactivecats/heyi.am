import { getPortfolioProfile, loadProjectEnhanceResult } from '../settings.js';
import { getSessionsByProject } from '../db.js';
import { displayNameFromDir } from '../sync.js';
import { toSlug } from '../format-utils.js';
import type { PortfolioRenderData, PortfolioProject } from '../render/types.js';
import type { RouteContext } from './context.js';

export interface BuildPortfolioRenderDataResult {
  renderData: PortfolioRenderData;
  /** Per-project enhance caches, keyed by `dirName`. Used by the static
   *  export route to feed `generatePortfolioSite`. */
  projectCaches: Map<string, { dirName: string; cache: ReturnType<typeof loadProjectEnhanceResult> }>;
}

/**
 * Assemble the `PortfolioRenderData` payload from local project data.
 *
 * Shared between:
 *  - `POST /api/portfolio/upload` (Phase 2, hosted heyi.am publish)
 *  - `POST /api/portfolio/export` (Phase 4, static folder export)
 *
 * Mirrors the preview route's assembly logic. Projects that fail to load are
 * silently skipped — the portfolio still publishes with whatever succeeds.
 */
export async function buildPortfolioRenderData(
  ctx: RouteContext,
  auth: { username: string },
): Promise<BuildPortfolioRenderDataResult> {
  const profile = getPortfolioProfile();

  const rawProjects = await ctx.getProjects();
  const portfolioProjects: PortfolioProject[] = [];
  const projectCaches = new Map<string, { dirName: string; cache: ReturnType<typeof loadProjectEnhanceResult> }>();
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

      const dbSessions = getSessionsByProject(ctx.db, rawProj.dirName);
      const sessionActivity = dbSessions
        .filter((s) => !s.is_subagent)
        .map((s) => ({
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

      projectCaches.set(rawProj.dirName, { dirName: rawProj.dirName, cache: cached });
    } catch { /* skip projects that fail */ }
  }

  const renderData: PortfolioRenderData = {
    user: {
      username: auth.username,
      accent: profile.accent || '#084471',
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

  return { renderData, projectCaches };
}
