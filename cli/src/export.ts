/**
 * Export module — produces Markdown and HTML exports of refined projects.
 *
 * Both functions write self-contained, offline-viewable output.
 * HTML export uses the same render pipeline as publish (ReactDOMServer),
 * producing JS-free static HTML safe for script-src 'self' CSP.
 */

import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectEnhanceCache, EnhancedData } from './settings.js';
import { loadEnhancedData, getDefaultTemplate } from './settings.js';
import { renderProjectHtml, renderSessionHtml } from './render/index.js';
import { resolveTemplate } from './render/templates.js';
import { escapeHtml, displayNameFromDir } from './format-utils.js';
import {
  buildProjectRenderData,
  buildSessionRenderData,
  buildSessionCard,
  DEFAULT_ACCENT,
} from './render/build-render-data.js';
import type { Session } from './analyzer.js';
import { mergeActiveIntervals, sumIntervalMs } from './bridge.js';
import { SCREENSHOTS_DIR } from './screenshot.js';

export interface ExportResult {
  files: string[];
  totalBytes: number;
  outputPath: string;
}

// ── Duration merging ────────────────────────────────────────────

/** Compute merged human-hours from Session[] with activeIntervals. Falls back to naive sum. */
function computeMergedSessionDuration(sessions: Session[]): number {
  const allIntervals: [number, number][] = [];
  for (const s of sessions) {
    if (s.activeIntervals?.length) {
      allIntervals.push(...s.activeIntervals);
    }
  }
  if (allIntervals.length === 0) {
    return sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  }
  const merged = mergeActiveIntervals(allIntervals);
  const minutes = Math.round(sumIntervalMs(merged) / 60_000);
  return minutes > 0 ? minutes : sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
}

// ── Helpers ────────────────────────────────────────────────────

/** Resolve a project screenshot as a data URI for embedding in standalone HTML. */
function resolveScreenshotDataUri(dirName: string, cache: ProjectEnhanceCache): string | undefined {
  // Try screenshotBase64 from the enhance cache first
  if (cache.screenshotBase64) {
    const b64 = cache.screenshotBase64;
    if (b64.startsWith('data:')) return b64;
    return `data:image/png;base64,${b64}`;
  }

  // Try local screenshot file
  const slug = dirName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const screenshotPath = join(SCREENSHOTS_DIR, `${slug}.png`);
  if (existsSync(screenshotPath)) {
    const buf = readFileSync(screenshotPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  return undefined;
}

/** Pick top 6 featured sessions — exact same logic as ProjectDetail.tsx */
function pickFeaturedSessions(sessions: Session[], cache: ProjectEnhanceCache): Session[] {
  const featuredIds = new Set<string>();
  for (const t of cache.result.timeline || []) {
    for (const s of t.sessions || []) {
      if (s.featured) featuredIds.add(s.sessionId);
    }
  }
  // 1. Sessions flagged as featured in the enhance cache
  const featured = sessions.filter((s) => featuredIds.has(s.id));
  // 2. Enhanced sessions (status !== 'draft'), sorted by LOC desc
  const enhanced = sessions
    .filter((s) => (s.status === 'enhanced' || s.status === 'uploaded') && !featuredIds.has(s.id))
    .sort((a, b) => b.linesOfCode - a.linesOfCode);
  // 3. Draft sessions as fallback
  const rest = sessions.filter((s) => s.status === 'draft' && !featuredIds.has(s.id));
  const combined = [...featured, ...enhanced, ...rest];
  const seen = new Set<string>();
  return combined.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  }).slice(0, 6);
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
  opts?: { totalFilesChanged?: number },
): Promise<ExportResult> {
  const files: string[] = [];
  let totalBytes = 0;

  mkdirSync(outputPath, { recursive: true });

  const { result } = cache;
  const title = cache.title ?? displayNameFromDir(dirName);

  // README.md — project narrative
  const readme = buildReadme(title, result, sessions, opts?.totalFilesChanged);
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
  totalFilesChanged?: number,
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
  const totalMin = computeMergedSessionDuration(sessions);
  const totalFiles = totalFilesChanged ?? new Set(sessions.flatMap(s => s.filesChanged.map(f => f.path))).size;
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

export interface ExportOpts {
  totalFilesChanged?: number;
  title?: string;
  screenshotUrl?: string;
}

export async function exportHtml(
  dirName: string,
  cache: ProjectEnhanceCache,
  sessions: Session[],
  outputPath: string,
  username: string = 'local',
  opts?: ExportOpts,
): Promise<ExportResult> {
  const files: string[] = [];
  let totalBytes = 0;

  mkdirSync(outputPath, { recursive: true });

  const { result } = cache;
  const slug = slugify(dirName);
  const title = opts?.title ?? cache.title ?? displayNameFromDir(dirName);

  // Use ALL sessions (same as dashboard), build cards for each
  const sessionCards = sessions.map((session) => {
    return buildSessionCard({
      sessionId: session.id,
      session,
      enhanced: null,
      username,
      projectSlug: slug,
      sessionSlug: slugify(session.title),
      sourceTool: session.source ?? 'unknown',
    });
  });

  // Compute stats the same way the dashboard does
  const totalLoc = sessions.reduce((sum, s) => sum + s.linesOfCode, 0);
  const totalDurationMinutes = computeMergedSessionDuration(sessions);
  const totalFilesChanged = opts?.totalFilesChanged ?? new Set(sessions.flatMap(s => s.filesChanged.map(f => f.path))).size;
  // Agent duration: sum child durations across all orchestrated sessions
  const totalAgentMinutes = sessions
    .filter((s) => s.isOrchestrated && s.children)
    .reduce((sum, s) => sum + s.children!.reduce((cs, c) => cs + c.durationMinutes, 0), 0);
  const totalAgentDurationMinutes = totalAgentMinutes > 0 ? totalDurationMinutes + totalAgentMinutes : undefined;
  const totalTokens = sessions.reduce((sum, s) => sum + (s.tokenUsage?.input ?? 0) + (s.tokenUsage?.output ?? 0), 0) || undefined;

  // Resolve screenshot for embedding
  const screenshotUrl = resolveScreenshotDataUri(dirName, cache);

  // Render project index.html — pass same data shape as dashboard
  const projectRenderData = buildProjectRenderData({
    username,
    slug,
    title,
    narrative: result.narrative,
    repoUrl: cache.repoUrl,
    projectUrl: cache.projectUrl,
    screenshotUrl,
    timeline: result.timeline.map((t) => ({
      period: t.period,
      label: t.label,
      sessions: t.sessions as unknown as Array<Record<string, unknown>>,
    })),
    skills: result.skills,
    totalSessions: sessions.length,
    totalLoc,
    totalDurationMinutes,
    totalAgentDurationMinutes,
    totalFilesChanged,
    totalTokens,
    sessionCards,
    sessionBaseUrl: './sessions',
  });

  const templateName = resolveTemplate(undefined, getDefaultTemplate());
  const projectBody = renderProjectHtml(projectRenderData, {
    arc: result.arc,
    fullSessions: sessions as unknown as Array<Record<string, unknown>>,
  }, templateName);
  const projectHtml = buildStandalonePage(title, projectBody, {
    description: result.narrative?.slice(0, 200) || undefined,
  });
  totalBytes += writeAndTrack(join(outputPath, 'index.html'), projectHtml, files);

  // Render session pages — only featured sessions (linked from project page)
  const featuredSessions = pickFeaturedSessions(sessions, cache);
  const sessionsDir = join(outputPath, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });

  for (const session of featuredSessions) {
    const sessionSlug = slugify(session.title);
    const enhanced = loadEnhancedData(session.id);
    const renderData = buildSessionRenderData({
      sessionId: session.id,
      session,
      enhanced,
      username,
      projectSlug: slug,
      sessionSlug,
      sourceTool: session.source ?? 'unknown',
      template: templateName,
    });

    const sessionBody = renderSessionHtml(renderData, templateName);
    const sessionDesc = (enhanced?.developerTake ?? session.developerTake ?? '').slice(0, 200) || undefined;
    const sessionHtml = buildStandalonePage(
      session.title,
      sessionBody,
      { description: sessionDesc },
    );
    totalBytes += writeAndTrack(join(sessionsDir, `${sessionSlug}.html`), sessionHtml, files);
  }

  return { files, totalBytes, outputPath };
}

function getInlineCss(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const cssPath = resolve(thisDir, 'render', 'templates', 'styles.css');
  try {
    return readFileSync(cssPath, 'utf-8');
  } catch {
    return '';
  }
}

// ── In-memory HTML generation (for zip download) ─────────────

export interface HtmlFile {
  path: string;
  content: string;
}

/**
 * Generate HTML files in memory (no disk writes).
 * Returns an array of {path, content} for zipping.
 */

// ── Shared render helpers ─────────────────────────────────────

function buildProjectRenderInputs(
  dirName: string,
  cache: ProjectEnhanceCache,
  sessions: Session[],
  username: string,
  opts?: ExportOpts,
) {
  const { result } = cache;
  const slug = slugify(dirName);
  const title = opts?.title ?? cache.title ?? displayNameFromDir(dirName);

  const sessionCards = sessions.map((session) => buildSessionCard({
    sessionId: session.id,
    session,
    enhanced: null,
    username,
    projectSlug: slug,
    sessionSlug: slugify(session.title),
    sourceTool: session.source ?? 'unknown',
  }));

  const totalLoc = sessions.reduce((sum, s) => sum + s.linesOfCode, 0);
  const totalDurationMinutes = computeMergedSessionDuration(sessions);
  const totalFilesChanged = opts?.totalFilesChanged ?? new Set(sessions.flatMap(s => s.filesChanged.map(f => f.path))).size;
  const totalAgentMinutes = sessions
    .filter((s) => s.isOrchestrated && s.children)
    .reduce((sum, s) => sum + s.children!.reduce((cs, c) => cs + c.durationMinutes, 0), 0);
  const totalAgentDurationMinutes = totalAgentMinutes > 0 ? totalDurationMinutes + totalAgentMinutes : undefined;
  const totalTokens = sessions.reduce((sum, s) => sum + (s.tokenUsage?.input ?? 0) + (s.tokenUsage?.output ?? 0), 0) || undefined;

  return { result, slug, title, sessionCards, totalLoc, totalDurationMinutes, totalAgentDurationMinutes, totalFilesChanged, totalTokens };
}

/**
 * Render just the project HTML fragment (no shell, no scripts).
 * Used by the upload flow to store rendered_html in the DB.
 */
export function generateProjectHtmlFragment(
  dirName: string,
  cache: ProjectEnhanceCache,
  sessions: Session[],
  username: string = 'local',
  opts?: ExportOpts,
): string {
  const { result, slug, title, sessionCards, totalLoc, totalDurationMinutes, totalAgentDurationMinutes, totalFilesChanged, totalTokens } =
    buildProjectRenderInputs(dirName, cache, sessions, username, opts);

  // Use explicit URL override (e.g. public https:// path for server upload),
  // fall back to embedded data URI for standalone local export
  const screenshotUrl = opts?.screenshotUrl ?? resolveScreenshotDataUri(dirName, cache);

  const renderData = buildProjectRenderData({
    username, slug, title,
    narrative: result.narrative,
    repoUrl: cache.repoUrl,
    projectUrl: cache.projectUrl,
    screenshotUrl,
    timeline: result.timeline.map((t) => ({ period: t.period, label: t.label, sessions: t.sessions as unknown as Array<Record<string, unknown>> })),
    skills: result.skills,
    totalSessions: sessions.length,
    totalLoc, totalDurationMinutes, totalAgentDurationMinutes, totalFilesChanged, totalTokens,
    sessionCards,
  });

  const templateName = resolveTemplate(undefined, getDefaultTemplate());
  return renderProjectHtml(renderData, {
    arc: result.arc,
    fullSessions: sessions as unknown as Array<Record<string, unknown>>,
  }, templateName);
}

export function generateHtmlFiles(
  dirName: string,
  cache: ProjectEnhanceCache,
  sessions: Session[],
  username: string = 'local',
  opts?: ExportOpts,
): HtmlFile[] {
  const files: HtmlFile[] = [];
  const { result, slug, title, sessionCards, totalLoc, totalDurationMinutes, totalAgentDurationMinutes, totalFilesChanged, totalTokens } =
    buildProjectRenderInputs(dirName, cache, sessions, username, opts);

  const screenshotUrl = resolveScreenshotDataUri(dirName, cache);
  const templateName = resolveTemplate(undefined, getDefaultTemplate());

  const projectRenderData = buildProjectRenderData({
    username, slug, title,
    narrative: result.narrative,
    repoUrl: cache.repoUrl,
    projectUrl: cache.projectUrl,
    screenshotUrl,
    timeline: result.timeline.map((t) => ({ period: t.period, label: t.label, sessions: t.sessions as unknown as Array<Record<string, unknown>> })),
    skills: result.skills,
    totalSessions: sessions.length,
    totalLoc, totalDurationMinutes, totalAgentDurationMinutes, totalFilesChanged, totalTokens,
    sessionCards,
    sessionBaseUrl: './sessions',
  });

  const projectBody = renderProjectHtml(projectRenderData, {
    arc: result.arc,
    fullSessions: sessions as unknown as Array<Record<string, unknown>>,
  }, templateName);
  files.push({ path: 'index.html', content: buildStandalonePage(title, projectBody, {
    description: result.narrative?.slice(0, 200) || undefined,
  }) });

  const featuredSessions = pickFeaturedSessions(sessions, cache);
  for (const session of featuredSessions) {
    const sessionSlug = slugify(session.title);
    const enhanced = loadEnhancedData(session.id);
    const renderData = buildSessionRenderData({
      sessionId: session.id,
      session, enhanced, username,
      projectSlug: slug, sessionSlug,
      sourceTool: session.source ?? 'unknown',
      template: templateName,
    });
    const sessionBody = renderSessionHtml(renderData, templateName);
    const sessionDesc = (enhanced?.developerTake ?? session.developerTake ?? '').slice(0, 200) || undefined;
    files.push({
      path: `sessions/${sessionSlug}.html`,
      content: buildStandalonePage(session.title, sessionBody, { description: sessionDesc }),
    });
  }

  return files;
}

// ── Minimal ZIP builder (zero dependencies) ──────────────────

/**
 * Create a ZIP file buffer from an array of {path, content} entries.
 * Uses DEFLATE compression via Node's built-in zlib.
 */
export function createZipBuffer(entries: HtmlFile[]): Buffer {
  const centralDir: Buffer[] = [];
  const fileData: Buffer[] = [];
  let offset = 0;

  // MS-DOS time/date for current timestamp
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.path, 'utf-8');
    const raw = Buffer.from(entry.content, 'utf-8');
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);    // signature
    local.writeUInt16LE(20, 4);             // version needed
    local.writeUInt16LE(0, 6);              // flags
    local.writeUInt16LE(8, 8);              // compression: deflate
    local.writeUInt16LE(dosTime, 10);       // mod time
    local.writeUInt16LE(dosDate, 12);       // mod date
    local.writeUInt32LE(crc, 14);           // crc32
    local.writeUInt32LE(compressed.length, 18); // compressed size
    local.writeUInt32LE(raw.length, 22);    // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26); // name length
    local.writeUInt16LE(0, 28);             // extra field length
    nameBytes.copy(local, 30);

    fileData.push(local, compressed);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);   // signature
    central.writeUInt16LE(20, 4);            // version made by
    central.writeUInt16LE(20, 6);            // version needed
    central.writeUInt16LE(0, 8);             // flags
    central.writeUInt16LE(8, 10);            // compression: deflate
    central.writeUInt16LE(dosTime, 12);       // mod time
    central.writeUInt16LE(dosDate, 14);       // mod date
    central.writeUInt32LE(crc, 16);          // crc32
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);            // extra field length
    central.writeUInt16LE(0, 32);            // comment length
    central.writeUInt16LE(0, 34);            // disk number start
    central.writeUInt16LE(0, 36);            // internal attributes
    central.writeUInt32LE(0, 38);            // external attributes
    central.writeUInt32LE(offset, 42);       // local header offset
    nameBytes.copy(central, 46);
    centralDir.push(central);

    offset += local.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const centralDirOffset = offset;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                // disk number
  eocd.writeUInt16LE(0, 6);                // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);    // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);   // total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);               // comment length

  return Buffer.concat([...fileData, centralDirBuf, eocd]);
}

/** CRC-32 (ISO 3309) */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getInlineMountJs(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  // In built dist: dist/mount.js (copied during build)
  // In dev: ../../packages/ui/dist/mount.js (monorepo layout)
  const builtPath = resolve(thisDir, 'mount.js');
  const devPath = resolve(thisDir, '..', '..', 'packages', 'ui', 'dist', 'mount.js');
  const mountPath = existsSync(builtPath) ? builtPath : devPath;
  try {
    return readFileSync(mountPath, 'utf-8');
  } catch {
    return '';
  }
}

interface StandalonePageOpts {
  description?: string;
}

function buildStandalonePage(title: string, bodyHtml: string, opts?: StandalonePageOpts): string {
  const css = getInlineCss();
  const cssTag = css
    ? `<style>${css}\nbody { overflow: auto !important; min-height: auto !important; background: var(--color-surface, #f8f9fb); }</style>`
    : '';

  const mountJs = getInlineMountJs();
  const scriptTag = mountJs ? `<script>${mountJs}</script>` : '';

  const safeTitle = escapeHtml(title);
  const safeDesc = opts?.description ? escapeHtml(opts.description) : '';
  const ogTitle = `${safeTitle} — heyi.am`;

  const ogTags = `<meta property="og:title" content="${ogTitle}" />
  <meta property="og:site_name" content="heyi.am" />
  <meta property="og:type" content="article" />
  ${safeDesc ? `<meta property="og:description" content="${safeDesc}" />` : ''}
  ${safeDesc ? `<meta name="description" content="${safeDesc}" />` : ''}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${ogTitle}" />
  ${safeDesc ? `<meta name="twitter:description" content="${safeDesc}" />` : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${ogTitle}</title>
  ${ogTags}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ${cssTag}
</head>
<body>
  ${bodyHtml}
  ${scriptTag}
</body>
</html>`;
}
