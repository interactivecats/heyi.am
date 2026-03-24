/**
 * Helpers that build render data types from CLI internal data structures.
 *
 * Extracted from server.ts publish flow so the mapping logic is unit-testable.
 */

import type { SessionRenderData, ProjectRenderData, SessionCard, ProjectDetail } from './types.js';
import type { Session } from '../analyzer.js';
import type { EnhancedData } from '../settings.js';

// Default accent color (Seal Blue) when user accent is unknown at publish time.
export const DEFAULT_ACCENT = '#084471';

interface BuildSessionRenderOpts {
  sessionId: string;
  session: Session;
  enhanced: EnhancedData | null;
  username: string;
  projectSlug: string;
  sessionSlug: string;
  sourceTool: string;
  agentSummary?: Record<string, unknown> | null;
}

/**
 * Build SessionRenderData from CLI internal types.
 * Pure function — no I/O, no side effects.
 */
export function buildSessionRenderData(opts: BuildSessionRenderOpts): SessionRenderData {
  const { sessionId, session, enhanced, username, projectSlug, sessionSlug, sourceTool, agentSummary } = opts;

  const devTake = (enhanced?.developerTake ?? session.developerTake ?? '').slice(0, 2000);
  const sessionNarrative = (enhanced as { narrative?: string })?.narrative ?? '';
  const sessionTitle = enhanced?.title ?? session.title;
  const sessionSkills = enhanced?.skills ?? session.skills ?? [];
  const sessionRecordedAt = session.date ? new Date(session.date).toISOString() : new Date().toISOString();

  return {
    user: { username, accent: DEFAULT_ACCENT },
    projectSlug,
    session: {
      token: sessionId,
      title: sessionTitle,
      devTake,
      context: enhanced?.context ?? '',
      durationMinutes: session.durationMinutes ?? 0,
      turns: session.turns ?? 0,
      filesChanged: session.filesChanged?.length ?? 0,
      locChanged: session.linesOfCode ?? 0,
      skills: sessionSkills,
      narrative: sessionNarrative,
      beats: (enhanced?.executionSteps ?? session.executionPath ?? []).map((s, i) => ({
        stepNumber: s.stepNumber ?? i + 1,
        title: s.title ?? `Step ${i + 1}`,
        body: (s as { description?: string }).description ?? (s as { body?: string }).body ?? '',
      })),
      qaPairs: enhanced?.qaPairs ?? session.qaPairs ?? [],
      highlights: [],
      toolBreakdown: (session.toolBreakdown ?? []).map((t) => ({ tool: t.tool, count: t.count })),
      topFiles: (session.filesChanged ?? []).slice(0, 20).map((f) =>
        typeof f === 'string' ? { path: f, additions: 0, deletions: 0 } : f,
      ),
      recordedAt: sessionRecordedAt,
      sourceTool,
      template: 'editorial',
      agentSummary: agentSummary ?? undefined,
    },
  };
}

/**
 * Build a SessionCard from CLI internal types (for project page session list).
 * Pure function — no I/O, no side effects.
 */
export function buildSessionCard(opts: BuildSessionRenderOpts): SessionCard {
  const { sessionId, session, enhanced, sessionSlug, sourceTool, agentSummary } = opts;

  const devTake = (enhanced?.developerTake ?? session.developerTake ?? '').slice(0, 2000);
  const sessionTitle = enhanced?.title ?? session.title;
  const sessionSkills = enhanced?.skills ?? session.skills ?? [];
  const sessionRecordedAt = session.date ? new Date(session.date).toISOString() : new Date().toISOString();

  return {
    token: sessionId,
    slug: sessionSlug,
    title: sessionTitle,
    devTake,
    durationMinutes: session.durationMinutes ?? 0,
    turns: session.turns ?? 0,
    locChanged: session.linesOfCode ?? 0,
    filesChanged: session.filesChanged?.length ?? 0,
    skills: sessionSkills,
    recordedAt: sessionRecordedAt,
    sourceTool,
    agentSummary: agentSummary ?? undefined,
  };
}

interface BuildProjectRenderOpts {
  username: string;
  slug: string;
  title: string;
  narrative: string;
  repoUrl?: string;
  projectUrl?: string;
  timeline: Array<{ period: string; label: string; sessions: Array<Record<string, unknown>> }>;
  skills: string[];
  totalSessions: number;
  totalLoc: number;
  totalDurationMinutes: number;
  totalAgentDurationMinutes?: number;
  totalFilesChanged: number;
  sessionCards: SessionCard[];
}

/**
 * Build ProjectRenderData from CLI publish flow data.
 * Pure function — no I/O, no side effects.
 */
export function buildProjectRenderData(opts: BuildProjectRenderOpts): ProjectRenderData {
  return {
    user: { username: opts.username, accent: DEFAULT_ACCENT },
    project: {
      slug: opts.slug,
      title: opts.title,
      narrative: opts.narrative,
      repoUrl: opts.repoUrl,
      projectUrl: opts.projectUrl,
      timeline: opts.timeline,
      skills: opts.skills,
      totalSessions: opts.totalSessions,
      totalLoc: opts.totalLoc,
      totalDurationMinutes: opts.totalDurationMinutes,
      totalAgentDurationMinutes: opts.totalAgentDurationMinutes,
      totalFilesChanged: opts.totalFilesChanged,
    },
    sessions: opts.sessionCards,
  };
}
