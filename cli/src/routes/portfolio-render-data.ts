import { getPortfolioProfile, loadProjectEnhanceResult, type PortfolioProjectEntry } from '../settings.js';
import { getSessionsByProject, getAllProjectStats } from '../db.js';
import { displayNameFromDir } from '../sync.js';
import { toSlug } from '../format-utils.js';
import type { PortfolioRenderData, PortfolioProject } from '../render/types.js';
import type { RouteContext, ProjectInfo } from './context.js';

export interface BuildPortfolioRenderDataResult {
  renderData: PortfolioRenderData;
  /** Per-project enhance caches, keyed by `dirName`. Used by the static
   *  export route to feed `generatePortfolioSite`. */
  projectCaches: Map<string, { dirName: string; cache: ReturnType<typeof loadProjectEnhanceResult> }>;
  /** The filtered list of projects included in this portfolio (after
   *  applying the user's curation list). Used by the upload route to
   *  publish individual project pages alongside the landing page. */
  filteredProjects: ProjectInfo[];
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

  const allRawProjects = await ctx.getProjects();
  // Build a recency map from DB stats so the default-when-empty branch of
  // applyPortfolioProjectFilter can rank projects by "user's most recent
  // work" (latest non-subagent session start_time).
  const recencyByDir = new Map<string, string>();
  try {
    for (const s of getAllProjectStats(ctx.db)) {
      recencyByDir.set(s.projectDir, s.latestDate || '');
    }
  } catch { /* DB may be empty on first run; default branch will fall back */ }
  const rawProjects = applyPortfolioProjectFilter(
    allRawProjects,
    profile.projectsOnPortfolio,
    { getRecency: (p) => recencyByDir.get(p.dirName) },
  );
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

  return { renderData, projectCaches, filteredProjects: rawProjects };
}

/**
 * Apply the user-curated `projectsOnPortfolio` list to a raw project list.
 *
 * Pure function — no I/O. Lives here so it can be unit-tested without
 * standing up a RouteContext.
 *
 * Semantics:
 *  - Empty/missing list: default to the `defaultLimit` (3) most recently
 *    active projects, ranked by `getRecency` (descending). If fewer than
 *    `defaultLimit` projects exist, return all of them. If `getRecency` is
 *    not provided, falls back to reverse-alphabetic order on `dirName`
 *    (an unfortunate fallback — callers should provide a real recency
 *    accessor).
 *  - Non-empty list:
 *    - Filter out projects whose entry has `included === false`.
 *    - Sort the remaining matched projects by `order` ascending.
 *    - Projects present in the source list but missing from the curated
 *      list (e.g. newly imported since the user last edited) are appended
 *      at the end in source order, treated as `included: true`.
 *
 * NOTE: The default-when-empty branch is duplicated in
 * `cli/app/src/components/PortfolioWorkspace.tsx` (HydratePortfolioStore)
 * because the frontend bundler does not reach into `cli/src/`. Keep the
 * two implementations in sync.
 */
export const PORTFOLIO_DEFAULT_PROJECT_LIMIT = 3;

export interface ApplyPortfolioFilterOptions<P> {
  /** Returns the recency key for a project (e.g. ISO timestamp of the
   *  user's last session on it). Larger string sorts as "more recent".
   *  Missing/empty values rank last. */
  getRecency?: (p: P) => string | undefined;
  /** Override the default cap (mainly for tests). */
  defaultLimit?: number;
}

export function applyPortfolioProjectFilter<P extends { dirName: string }>(
  projects: P[],
  curated: PortfolioProjectEntry[] | undefined,
  options: ApplyPortfolioFilterOptions<P> = {},
): P[] {
  if (!curated || curated.length === 0) {
    const limit = options.defaultLimit ?? PORTFOLIO_DEFAULT_PROJECT_LIMIT;
    if (projects.length <= limit) return projects;
    const getRecency = options.getRecency;
    const ranked = projects.slice().sort((a, b) => {
      if (getRecency) {
        const ra = getRecency(a) || '';
        const rb = getRecency(b) || '';
        if (ra !== rb) return rb.localeCompare(ra); // descending
      }
      // Fallback / tiebreaker: reverse-alphabetic on dirName.
      return b.dirName.localeCompare(a.dirName);
    });
    return ranked.slice(0, limit);
  }
  const byId = new Map<string, PortfolioProjectEntry>();
  for (const entry of curated) byId.set(entry.projectId, entry);

  const matched: Array<{ proj: P; order: number }> = [];
  const unmatched: P[] = [];
  for (const proj of projects) {
    const entry = byId.get(proj.dirName);
    if (!entry) {
      unmatched.push(proj);
      continue;
    }
    if (entry.included === false) continue;
    matched.push({ proj, order: entry.order });
  }
  matched.sort((a, b) => a.order - b.order);
  return [...matched.map((m) => m.proj), ...unmatched];
}
