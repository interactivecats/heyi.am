import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { type Session } from '../analyzer.js';
import { loadProjectEnhanceResult } from '../settings.js';
import type { ProjectEnhanceCache } from '../settings.js';
import { exportMarkdown, exportHtml, generateHtmlFiles, createZipBuffer } from '../export.js';
import { type RouteContext, buildProjectDetail } from './context.js';

const EXPORTS_BASE = path.resolve(process.env.HOME || '~', '.config', 'heyiam', 'exports');

/** Validate that an output path is within the safe exports directory. */
function safeExportPath(outputPath: string | undefined, dirName: string, format: string): string {
  const defaultPath = path.join(EXPORTS_BASE, dirName, format);
  if (!outputPath) return defaultPath;
  const resolved = path.resolve(outputPath);
  if (!resolved.startsWith(EXPORTS_BASE)) return defaultPath;
  return resolved;
}

/** Load the full project detail — same data the dashboard receives. */
async function loadProjectData(ctx: RouteContext, dirName: string) {
  const projects = await ctx.getProjects();
  const proj = projects.find((p) => p.dirName === dirName);
  if (!proj) return null;
  return buildProjectDetail(ctx.db, proj);
}

/** Build a minimal ProjectEnhanceCache from raw session data for non-enhanced exports. */
function buildFallbackCache(sessions: Session[]): ProjectEnhanceCache {
  const allSkills = [...new Set(sessions.flatMap((s) => s.skills))];
  const allIds = sessions.map((s) => s.id);

  // Group sessions by month for the timeline
  const byMonth = new Map<string, Session[]>();
  for (const s of sessions) {
    const d = new Date(s.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(s);
  }
  const timeline = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, sess]) => ({
      period,
      label: period,
      sessions: sess.map((s) => ({
        sessionId: s.id,
        title: s.title,
        featured: false,
      })),
    }));

  return {
    fingerprint: 'fallback',
    enhancedAt: new Date().toISOString(),
    selectedSessionIds: allIds,
    result: {
      narrative: '',
      arc: [],
      skills: allSkills,
      timeline,
      questions: [],
    },
  };
}

export function createExportRouter(ctx: RouteContext): Router {
  const router = Router();

  router.post('/api/projects/:project/save-local', async (req: Request, res: Response) => {
    try {
      const dirName = String(req.params.project);
      const data = await loadProjectData(ctx, dirName);
      if (!data) { res.status(404).json({ error: 'Project not found' }); return; }
      const cache = (data.enhanceCache as ProjectEnhanceCache) ?? buildFallbackCache(data.sessions);
      const outputPath = path.join(EXPORTS_BASE, dirName, 'markdown');
      const result = await exportMarkdown(dirName, cache, data.sessions, outputPath);
      res.json(result);
    } catch (err) {
      console.error('[save-local]', (err as Error).message);
      res.status(500).json({ error: 'Save local failed' });
    }
  });

  router.post('/api/projects/:project/export-markdown', async (req: Request, res: Response) => {
    try {
      const dirName = String(req.params.project);
      const outputPath = req.body?.outputPath as string | undefined;
      const data = await loadProjectData(ctx, dirName);
      if (!data) { res.status(404).json({ error: 'Project not found' }); return; }
      const cache = (data.enhanceCache as ProjectEnhanceCache) ?? buildFallbackCache(data.sessions);
      const outDir = safeExportPath(outputPath, dirName, 'markdown');
      const result = await exportMarkdown(dirName, cache, data.sessions, outDir);
      res.json(result);
    } catch (err) {
      console.error('[export-markdown]', (err as Error).message);
      res.status(500).json({ error: 'Markdown export failed' });
    }
  });

  router.post('/api/projects/:project/export-html', async (req: Request, res: Response) => {
    try {
      const dirName = String(req.params.project);
      const outputPath = req.body?.outputPath as string | undefined;
      const data = await loadProjectData(ctx, dirName);
      if (!data) { res.status(404).json({ error: 'Project not found' }); return; }
      const cache = (data.enhanceCache as ProjectEnhanceCache) ?? buildFallbackCache(data.sessions);
      const totalFilesChanged = (data.project as Record<string, unknown>).totalFiles as number;
      const outDir = safeExportPath(outputPath, dirName, 'html');
      const result = await exportHtml(dirName, cache, data.sessions, outDir, 'local', { totalFilesChanged });
      res.json(result);
    } catch (err) {
      console.error('[export-html]', (err as Error).message);
      res.status(500).json({ error: 'HTML export failed' });
    }
  });

  // Download HTML as zip (no disk writes)
  router.get('/api/projects/:project/download-html', async (req: Request, res: Response) => {
    try {
      const dirName = String(req.params.project);
      const data = await loadProjectData(ctx, dirName);
      if (!data) { res.status(404).json({ error: 'Project not found' }); return; }
      const cache = (data.enhanceCache as ProjectEnhanceCache) ?? buildFallbackCache(data.sessions);
      const totalFilesChanged = (data.project as Record<string, unknown>).totalFiles as number;
      const htmlFiles = generateHtmlFiles(dirName, cache, data.sessions, 'local', { totalFilesChanged });
      const zipBuffer = createZipBuffer(htmlFiles);
      const filename = `${dirName.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (err) {
      console.error('[download-html]', (err as Error).message);
      res.status(500).json({ error: 'HTML download failed' });
    }
  });

  // Download Markdown as zip (no disk writes)
  router.get('/api/projects/:project/download-markdown', async (req: Request, res: Response) => {
    try {
      const dirName = String(req.params.project);
      const data = await loadProjectData(ctx, dirName);
      if (!data) { res.status(404).json({ error: 'Project not found' }); return; }
      const cache = (data.enhanceCache as ProjectEnhanceCache) ?? buildFallbackCache(data.sessions);

      // Re-use exportMarkdown to a temp dir, then zip the result
      const tmpDir = path.join(EXPORTS_BASE, '.tmp', `${dirName}-${Date.now()}`);
      const result = await exportMarkdown(dirName, cache, data.sessions, tmpDir);

      // Read files into memory and zip
      const entries = result.files.map((filePath) => ({
        path: path.relative(tmpDir, filePath),
        content: fs.readFileSync(filePath, 'utf-8'),
      }));
      const zipBuffer = createZipBuffer(entries);

      // Clean up temp dir
      fs.rmSync(tmpDir, { recursive: true, force: true });

      const filename = `${dirName.replace(/[^a-zA-Z0-9_-]/g, '_')}-markdown.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (err) {
      console.error('[download-markdown]', (err as Error).message);
      res.status(500).json({ error: 'Markdown download failed' });
    }
  });

  // Download JSON (structured project + session data)
  router.get('/api/projects/:project/download-json', async (req: Request, res: Response) => {
    try {
      const dirName = String(req.params.project);
      const data = await loadProjectData(ctx, dirName);
      if (!data) { res.status(404).json({ error: 'Project not found' }); return; }
      const payload = {
        ...data,
        exportedAt: new Date().toISOString(),
      };
      const json = JSON.stringify(payload, null, 2);
      const filename = `${dirName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(json);
    } catch (err) {
      console.error('[download-json]', (err as Error).message);
      res.status(500).json({ error: 'JSON download failed' });
    }
  });

  // Open directory (macOS) — restricted to the exports directory
  router.post('/api/open-directory', (req: Request, res: Response) => {
    try {
      const dirPath = req.body?.path;
      if (!dirPath || typeof dirPath !== 'string') {
        res.status(400).json({ error: 'Missing path' });
        return;
      }
      const resolved = path.resolve(dirPath);
      if (!resolved.startsWith(EXPORTS_BASE)) {
        res.status(403).json({ error: 'Path outside allowed directory' });
        return;
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        res.status(400).json({ error: 'Path is not an existing directory' });
        return;
      }
      execFileSync('open', [resolved]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[open-directory]', (err as Error).message);
      res.status(500).json({ error: 'Failed to open directory' });
    }
  });

  return router;
}
