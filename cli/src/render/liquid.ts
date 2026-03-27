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
}

export function renderProject(data: ProjectRenderData, extras?: RenderProjectExtras): string {
  // Pre-compute derived data for the template
  const allSessions = data.allSessions || data.sessions;

  const sourceCounts: Record<string, number> = {};
  for (const s of data.sessions) {
    const src = s.sourceTool || 'unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  const sessionsJson = JSON.stringify(allSessions.map((s) => ({
    id: s.token, title: s.title, date: s.recordedAt,
    durationMinutes: s.durationMinutes, turns: s.turns,
    linesOfCode: s.locChanged, status: 'enhanced',
    projectName: data.project.title, rawLog: [],
    skills: s.skills, source: s.sourceTool,
    filesChanged: s.filesChanged,
  })));

  const growthJson = JSON.stringify(allSessions.map((s) => ({
    id: s.token, title: s.title, date: s.recordedAt,
    durationMinutes: s.durationMinutes, turns: s.turns,
    linesOfCode: s.locChanged, status: 'enhanced',
    projectName: data.project.title, rawLog: [],
  })));

  const durationLabel = data.project.totalAgentDurationMinutes ? 'You / Agents' : 'Time';

  return engine.renderFileSync('project', {
    ...data,
    arc: extras?.arc ?? [],
    sourceCounts: Object.entries(sourceCounts).map(([tool, count]) => ({ tool, count })),
    sessionsJson,
    growthJson,
    durationLabel,
  });
}

export function renderSession(data: SessionRenderData): string {
  return engine.renderFileSync('session', data);
}
