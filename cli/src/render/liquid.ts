/**
 * Liquid template engine for static HTML rendering.
 *
 * Replaces React SSR (ReactDOMServer.renderToStaticMarkup) with
 * liquidjs sync rendering. Templates live in ./templates/*.liquid.
 */

import { Liquid } from 'liquidjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectRenderData, SessionRenderData } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const engine = new Liquid({
  root: resolve(__dirname, 'templates'),
  extname: '.liquid',
  outputEscape: 'escape',
});

// ── Custom filters ───────────────────────────────────────────

engine.registerFilter('formatDuration', (minutes: number) => {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
});

engine.registerFilter('formatLoc', (loc: number) => {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc);
});

engine.registerFilter('formatTokens', (tokens: number) => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
  return String(tokens);
});

engine.registerFilter('formatDate', (iso: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
});

engine.registerFilter('formatDateShort', (iso: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
});

engine.registerFilter('jsonAttr', (value: unknown) => {
  return JSON.stringify(value);
});

engine.registerFilter('localeNumber', (value: number) => {
  return value.toLocaleString();
});

engine.registerFilter('stripProtocol', (url: string) => {
  return (url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '');
});

// Duration color cycling for session cards
const DURATION_COLORS = ['primary', 'green', 'violet'];
engine.registerFilter('durationColor', (index: number) => {
  return DURATION_COLORS[index % DURATION_COLORS.length];
});

// ── Render functions ─────────────────────────────────────────

interface RenderProjectExtras {
  arc?: Array<{ phase: number; title: string; description: string }>;
  /** Full session data for charts — uses Session type from analyzer, not SessionCard */
  fullSessions?: Array<Record<string, unknown>>;
}

export function renderProject(data: ProjectRenderData, extras?: RenderProjectExtras): string {
  // Pre-compute derived data for the template
  const allSessions = data.allSessions || data.sessions;

  const sourceCounts: Record<string, number> = {};
  for (const s of data.sessions) {
    const src = s.sourceTool || 'unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  // Use full session data when available (charts need complete Session objects).
  // Strip rawLog and turnTimeline — huge, unused by charts, and could break HTML attributes.
  const chartSessions = (extras?.fullSessions ?? allSessions.map((s) => ({
    id: s.token, title: s.title, date: s.recordedAt,
    durationMinutes: s.durationMinutes, turns: s.turns,
    linesOfCode: s.locChanged, status: 'enhanced',
    projectName: data.project.title, rawLog: [],
    skills: s.skills, source: s.sourceTool,
    filesChanged: s.filesChanged,
  }))).map((s: Record<string, unknown>) => {
    const { rawLog, turnTimeline, ...rest } = s;
    return { ...rest, rawLog: [] };
  });

  // Encode JSON safe for single-quoted HTML attributes
  const sessionsJson = JSON.stringify(chartSessions).replace(/'/g, '&#39;');
  const growthJson = sessionsJson; // same data for both charts

  const durationLabel = data.project.totalAgentDurationMinutes ? 'Human / Agents' : 'Time';
  const efficiencyMultiplier = data.project.totalAgentDurationMinutes && data.project.totalDurationMinutes > 0
    ? (data.project.totalAgentDurationMinutes / data.project.totalDurationMinutes)
    : undefined;
  const efficiencyStr = efficiencyMultiplier && efficiencyMultiplier > 1 ? `${efficiencyMultiplier.toFixed(1)}x` : undefined;

  // Pick featured sessions — same logic as ProjectDetail.tsx
  const featuredSessionIds = new Set<string>();
  for (const t of data.project.timeline || []) {
    for (const s of t.sessions || []) {
      if ((s as Record<string, unknown>).featured) {
        featuredSessionIds.add((s as Record<string, unknown>).sessionId as string);
      }
    }
  }
  // Use fullSessions (has status field) for selection, map back to SessionCard for display
  const fullList = extras?.fullSessions ?? [];
  const fullById = new Map(fullList.map((s) => [s.id as string, s]));
  const cardById = new Map(data.sessions.map((s) => [s.token, s]));

  // Same logic as ProjectDetail.tsx:
  // 1. Featured flag from timeline
  const featuredCards = data.sessions.filter((s) => featuredSessionIds.has(s.token));
  if (featuredCards.length >= 6) {
    // enough
  }
  // 2. Enhanced sessions (status !== 'draft'), sorted by LOC desc
  const enhancedCards = data.sessions
    .filter((s) => {
      if (featuredSessionIds.has(s.token)) return false;
      const full = fullById.get(s.token);
      return full && (full.status === 'enhanced' || full.status === 'uploaded');
    })
    .sort((a, b) => b.locChanged - a.locChanged);
  // 3. Draft sessions as fallback
  const draftCards = data.sessions
    .filter((s) => {
      if (featuredSessionIds.has(s.token)) return false;
      const full = fullById.get(s.token);
      return !full || full.status === 'draft';
    });
  const combined = [...featuredCards, ...enhancedCards, ...draftCards];
  const seen = new Set<string>();
  const featuredSessions = combined.filter((s) => {
    if (seen.has(s.token)) return false;
    seen.add(s.token);
    return true;
  }).slice(0, 6);

  return engine.renderFileSync('project', {
    ...data,
    arc: extras?.arc ?? [],
    featuredSessions,
    sourceCounts: Object.entries(sourceCounts).map(([tool, count]) => ({ tool, count })),
    sessionsJson,
    growthJson,
    durationLabel,
    efficiencyMultiplier: efficiencyStr,
  });
}

export function renderSession(data: SessionRenderData): string {
  return engine.renderFileSync('session', data);
}
