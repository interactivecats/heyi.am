/**
 * Export module — produces Markdown and HTML exports of refined projects.
 *
 * Both functions write self-contained, offline-viewable output.
 * HTML export uses the same render pipeline as publish (ReactDOMServer),
 * producing JS-free static HTML safe for script-src 'self' CSP.
 */

import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectEnhanceCache, EnhancedData } from './settings.js';
import { loadEnhancedData } from './settings.js';
import { renderProjectHtml, renderSessionHtml } from './render/index.js';
import {
  buildProjectRenderData,
  buildSessionRenderData,
  buildSessionCard,
  DEFAULT_ACCENT,
} from './render/build-render-data.js';
import type { Session } from './analyzer.js';

export interface ExportResult {
  files: string[];
  totalBytes: number;
  outputPath: string;
}

// ── Helpers ────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled';
}

function writeAndTrack(filePath: string, content: string, files: string[]): number {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  files.push(filePath);
  return statSync(filePath).size;
}

// ── Markdown Export ────────────────────────────────────────────

export async function exportMarkdown(
  dirName: string,
  cache: ProjectEnhanceCache,
  sessions: Session[],
  outputPath: string,
): Promise<ExportResult> {
  const files: string[] = [];
  let totalBytes = 0;

  mkdirSync(outputPath, { recursive: true });

  const { result } = cache;
  const title = dirName.replace(/^-/, '').replace(/-/g, ' ');

  // README.md — project narrative
  const readme = buildReadme(title, result, sessions);
  totalBytes += writeAndTrack(join(outputPath, 'README.md'), readme, files);

  // sessions/*.md — per-session breakdowns
  const sessionsDir = join(outputPath, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });

  for (const session of sessions) {
    const enhanced = loadEnhancedData(session.id);
    const slug = slugify(enhanced?.title ?? session.title);
    const md = buildSessionMarkdown(session, enhanced);
    totalBytes += writeAndTrack(join(sessionsDir, `${slug}.md`), md, files);
  }

  // project.json — structured data
  const projectJson = JSON.stringify(result, null, 2);
  totalBytes += writeAndTrack(join(outputPath, 'project.json'), projectJson, files);

  return { files, totalBytes, outputPath };
}

function buildReadme(
  title: string,
  result: ProjectEnhanceCache['result'],
  sessions: Session[],
): string {
  const lines: string[] = [];
  lines.push(`# ${title}\n`);
  lines.push(result.narrative);
  lines.push('');

  if (result.skills.length > 0) {
    lines.push(`## Skills\n`);
    lines.push(result.skills.map((s) => `- ${s}`).join('\n'));
    lines.push('');
  }

  if (result.arc.length > 0) {
    for (const phase of result.arc) {
      lines.push(`## Phase ${phase.phase}: ${phase.title}\n`);
      lines.push(phase.description);
      lines.push('');
    }
  }

  if (result.timeline.length > 0) {
    lines.push(`## Timeline\n`);
    for (const period of result.timeline) {
      lines.push(`### ${period.label} (${period.period})\n`);
      for (const s of period.sessions) {
        const featured = s.featured ? ' **featured**' : '';
        const tag = s.tag ? ` [${s.tag}]` : '';
        lines.push(`- [${s.title}](sessions/${slugify(s.title)}.md)${tag}${featured}`);
      }
      lines.push('');
    }
  }

  lines.push(`## Stats\n`);
  lines.push(`- Sessions: ${sessions.length}`);
  const totalLoc = sessions.reduce((sum, s) => sum + s.linesOfCode, 0);
  const totalMin = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalFiles = sessions.reduce((sum, s) => sum + s.filesChanged.length, 0);
  lines.push(`- Lines of code: ${totalLoc.toLocaleString()}`);
  lines.push(`- Total time: ${(totalMin / 60).toFixed(1)}h`);
  lines.push(`- Files changed: ${totalFiles}`);
  lines.push('');

  return lines.join('\n');
}

function buildSessionMarkdown(session: Session, enhanced: EnhancedData | null): string {
  const lines: string[] = [];
  const title = enhanced?.title ?? session.title;
  lines.push(`# ${title}\n`);

  if (enhanced?.developerTake ?? session.developerTake) {
    lines.push(`> ${(enhanced?.developerTake ?? session.developerTake ?? '').replace(/\n/g, '\n> ')}\n`);
  }

  if (enhanced?.context) {
    lines.push(`## Context\n`);
    lines.push(enhanced.context);
    lines.push('');
  }

  const steps = enhanced?.executionSteps ?? session.executionPath ?? [];
  if (steps.length > 0) {
    lines.push(`## Execution Path\n`);
    for (const step of steps) {
      const body = (step as { description?: string }).description ?? (step as { body?: string }).body ?? '';
      lines.push(`### ${step.stepNumber ?? ''}. ${step.title}\n`);
      lines.push(body);
      lines.push('');
    }
  }

  const qaPairs = enhanced?.qaPairs ?? session.qaPairs ?? [];
  if (qaPairs.length > 0) {
    lines.push(`## Q&A\n`);
    for (const qa of qaPairs) {
      lines.push(`**Q: ${qa.question}**\n`);
      lines.push(qa.answer);
      lines.push('');
    }
  }

  const skills = enhanced?.skills ?? session.skills ?? [];
  if (skills.length > 0) {
    lines.push(`## Skills\n`);
    lines.push(skills.map((s) => `- ${s}`).join('\n'));
    lines.push('');
  }

  lines.push(`## Stats\n`);
  lines.push(`- Duration: ${session.durationMinutes}m`);
  lines.push(`- Turns: ${session.turns}`);
  lines.push(`- LOC: ${session.linesOfCode}`);
  lines.push(`- Files changed: ${session.filesChanged.length}`);
  lines.push(`- Tool calls: ${session.toolCalls}`);
  if (session.source) lines.push(`- Source: ${session.source}`);
  lines.push('');

  return lines.join('\n');
}

// ── HTML Export ────────────────────────────────────────────────

export async function exportHtml(
  dirName: string,
  cache: ProjectEnhanceCache,
  sessions: Session[],
  outputPath: string,
  username: string = 'local',
): Promise<ExportResult> {
  const files: string[] = [];
  let totalBytes = 0;

  mkdirSync(outputPath, { recursive: true });

  const { result, selectedSessionIds } = cache;
  const slug = slugify(dirName);
  const title = dirName.replace(/^-/, '').replace(/-/g, ' ');

  // Build session cards for project page
  const selectedSessions = sessions.filter((s) => selectedSessionIds.includes(s.id));
  const sessionCards = selectedSessions.map((session) => {
    const enhanced = loadEnhancedData(session.id);
    return buildSessionCard({
      sessionId: session.id,
      session,
      enhanced,
      username,
      projectSlug: slug,
      sessionSlug: slugify(enhanced?.title ?? session.title),
      sourceTool: session.source ?? 'unknown',
    });
  });

  // Render project index.html
  const projectRenderData = buildProjectRenderData({
    username,
    slug,
    title,
    narrative: result.narrative,
    repoUrl: cache.repoUrl,
    projectUrl: cache.projectUrl,
    timeline: result.timeline.map((t) => ({
      period: t.period,
      label: t.label,
      sessions: t.sessions as unknown as Array<Record<string, unknown>>,
    })),
    skills: result.skills,
    totalSessions: sessions.length,
    totalLoc: sessions.reduce((sum, s) => sum + s.linesOfCode, 0),
    totalDurationMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    totalFilesChanged: sessions.reduce((sum, s) => sum + s.filesChanged.length, 0),
    sessionCards,
    sessionBaseUrl: './sessions',
  });

  const projectBody = renderProjectHtml(projectRenderData);
  const projectHtml = buildStandalonePage(title, projectBody);
  totalBytes += writeAndTrack(join(outputPath, 'index.html'), projectHtml, files);

  // Render session pages
  const sessionsDir = join(outputPath, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });

  for (const session of selectedSessions) {
    const enhanced = loadEnhancedData(session.id);
    const sessionSlug = slugify(enhanced?.title ?? session.title);
    const renderData = buildSessionRenderData({
      sessionId: session.id,
      session,
      enhanced,
      username,
      projectSlug: slug,
      sessionSlug,
      sourceTool: session.source ?? 'unknown',
    });

    const sessionBody = renderSessionHtml(renderData);
    const sessionHtml = buildStandalonePage(
      enhanced?.title ?? session.title,
      sessionBody,
    );
    totalBytes += writeAndTrack(join(sessionsDir, `${sessionSlug}.html`), sessionHtml, files);
  }

  return { files, totalBytes, outputPath };
}

function getInlineCss(): string {
  // Resolve CSS path relative to this file's location in the source tree
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const indexCssPath = resolve(thisDir, '..', 'app', 'src', 'index.css');
  try {
    return readFileSync(indexCssPath, 'utf-8');
  } catch {
    return '';
  }
}

function buildStandalonePage(title: string, bodyHtml: string): string {
  const css = getInlineCss();
  const cssTag = css
    ? `<style>${css}\nbody { overflow: auto !important; min-height: auto !important; }</style>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — heyi.am</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ${cssTag}
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}
