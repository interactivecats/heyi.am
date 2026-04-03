/**
 * Liquid template engine for static HTML rendering.
 *
 * Replaces React SSR (ReactDOMServer.renderToStaticMarkup) with
 * liquidjs sync rendering. Templates live in ./templates/*.liquid.
 */

import { Liquid } from 'liquidjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PortfolioRenderData, ProjectRenderData, SessionRenderData } from './types.js';
import { getTemplateInfo } from './templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const engine = new Liquid({
  root: resolve(__dirname, 'templates'),
  extname: '.liquid',
  outputEscape: 'escape',
});

// ── Custom filters ───────────────────────────────────────────

engine.registerFilter('formatDuration', (minutes: number) => {
  const hours = minutes / 60;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`;
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

const DEFAULT_TEMPLATE = 'editorial';

/** Inject data-accent and data-mode into the first data-template wrapper element. */
function injectTemplateAttrs(html: string, templateName: string): string {
  const info = getTemplateInfo(templateName);
  if (!info) return html;
  return html.replace(
    /data-template="[^"]*"/,
    (match) => `${match} data-accent="${info.accent}" data-mode="${info.mode}"`,
  );
}

export function renderProject(data: ProjectRenderData, extras?: RenderProjectExtras, templateName?: string): string {
  const template = templateName || DEFAULT_TEMPLATE;
  // Pre-compute derived data for the template
  const allSessions = data.allSessions || data.sessions;

  const sourceCounts: Record<string, number> = {};
  for (const s of allSessions) {
    const src = s.sourceTool || 'unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  // Use full session data when available (charts need complete Session objects).
  // Strip rawLog and turnTimeline — huge, unused by charts, and could break HTML attributes.
  const chartSessions = (extras?.fullSessions ?? allSessions.map((s) => ({
    id: s.token, slug: s.slug, title: s.title, date: s.recordedAt,
    durationMinutes: s.durationMinutes, turns: s.turns,
    linesOfCode: s.locChanged, linesAdded: s.linesAdded, linesDeleted: s.linesDeleted,
    status: 'enhanced',
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

  // Pre-compute chart coordinates for Liquid-rendered SVGs
  // Sort all sessions by date, compress gaps, compute x positions
  const sortedAll = [...(data.allSessions || data.sessions)]
    .filter(s => s.recordedAt)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  // Gap compression — must match GrowthChart.tsx constants
  const GAP_THRESHOLD = 60 * 60 * 1000;       // 1 hour
  const COMPRESSED_GAP = 10 * 60 * 1000;      // 10 minutes visual
  const visualTimes: number[] = [0];
  for (let i = 1; i < sortedAll.length; i++) {
    const gap = new Date(sortedAll[i].recordedAt).getTime() - new Date(sortedAll[i - 1].recordedAt).getTime();
    visualTimes.push(visualTimes[i - 1] + (gap > GAP_THRESHOLD ? COMPRESSED_GAP : Math.max(gap, 0)));
  }
  const totalVisualTime = visualTimes[visualTimes.length - 1] || 1;

  // Compute x positions (0-1000 range, template will scale to SVG width)
  // Also compute cumulative additions/deletions for growth chart
  let cumAdded = 0;
  let cumDeleted = 0;
  const chartPoints = sortedAll.map((s, i) => {
    cumAdded += s.linesAdded || 0;
    cumDeleted += s.linesDeleted || 0;
    return {
      title: s.title,
      slug: s.slug,
      date: s.recordedAt,
      locChanged: s.locChanged,
      linesAdded: s.linesAdded || 0,
      linesDeleted: s.linesDeleted || 0,
      durationMinutes: s.durationMinutes,
      sourceTool: s.sourceTool || 'unknown',
      cumAdded,
      cumDeleted,
      // x position as integer 0-1000 (template divides by 1000 and multiplies by plot width)
      xPct: Math.round((visualTimes[i] / totalVisualTime) * 1000),
    };
  });

  // SVG width hint: wider for more sessions (min 1200, scale with count)
  // Match React GrowthChart sizing: base on compressed time, not raw session count
  const chartSvgWidth = Math.max(700, Math.round(totalVisualTime / 60000 * 0.8) + 120);

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

  const html = engine.renderFileSync(`${template}/project`, {
    ...data,
    arc: extras?.arc ?? [],
    featuredSessions,
    chartPoints,
    chartSvgWidth,
    sourceCounts: Object.entries(sourceCounts).map(([tool, count]) => ({ tool, count })),
    sessionsJson,
    growthJson,
    durationLabel,
    efficiencyMultiplier: efficiencyStr,
  });
  return injectTemplateAttrs(html, template);
}

export function renderSession(data: SessionRenderData, templateName?: string): string {
  const template = templateName || DEFAULT_TEMPLATE;
  return injectTemplateAttrs(engine.renderFileSync(`${template}/session`, data), template);
}

export function renderPortfolio(data: PortfolioRenderData, templateName?: string): string {
  const template = templateName || DEFAULT_TEMPLATE;

  const durationLabel = data.totalAgentDurationMinutes ? 'Human / Agents' : 'Time';
  const efficiencyMultiplier = data.totalAgentDurationMinutes && data.totalDurationMinutes > 0
    ? (data.totalAgentDurationMinutes / data.totalDurationMinutes)
    : undefined;
  const efficiencyStr = efficiencyMultiplier && efficiencyMultiplier > 1 ? `${efficiencyMultiplier.toFixed(1)}x` : undefined;

  return injectTemplateAttrs(engine.renderFileSync(`${template}/portfolio`, {
    ...data,
    durationLabel,
    efficiencyMultiplier: efficiencyStr,
  }), template);
}
