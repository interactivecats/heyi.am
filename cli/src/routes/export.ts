import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseSession } from '../parsers/index.js';
import { bridgeToAnalyzer } from '../bridge.js';
import { analyzeSession, type Session } from '../analyzer.js';
import { loadProjectEnhanceResult, loadEnhancedData } from '../settings.js';
import type { ProjectEnhanceCache } from '../settings.js';
import { exportMarkdown, exportHtml, generateHtmlFiles, createZipBuffer } from '../export.js';
import type { RouteContext } from './context.js';

const EXPORTS_BASE = path.resolve(process.env.HOME || '~', '.config', 'heyiam', 'exports');

/** Validate that an output path is within the safe exports directory. */
function safeExportPath(outputPath: string | undefined, dirName: string, format: string): string {
  const defaultPath = path.join(EXPORTS_BASE, dirName, format);
  if (!outputPath) return defaultPath;
  const resolved = path.resolve(outputPath);
  if (!resolved.startsWith(EXPORTS_BASE)) return defaultPath;
  return resolved;
}

async function loadProjectSessions(ctx: RouteContext, dirName: string): Promise<Session[]> {
  const projects = await ctx.getProjects();
  const proj = projects.find((p) => p.dirName === dirName);
  if (!proj) return [];

  const sessions: Session[] = [];
  for (const meta of proj.sessions) {
    try {
      const parsed = await parseSession(meta.path);
      const bridged = bridgeToAnalyzer(parsed, { sessionId: meta.sessionId, projectName: proj.name });
      sessions.push(analyzeSession(bridged));
    } catch { /* skip unparseable sessions */ }
  }
  return sessions;
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
      const sessions = await loadProjectSessions(ctx, dirName);
      const cache = loadProjectEnhanceResult(dirName) ?? buildFallbackCache(sessions);
      const outputPath = path.join(EXPORTS_BASE, dirName, 'markdown');
      const result = await exportMarkdown(dirName, cache, sessions, outputPath);
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
      const sessions = await loadProjectSessions(ctx, dirName);
      const cache = loadProjectEnhanceResult(dirName) ?? buildFallbackCache(sessions);
      const outDir = safeExportPath(outputPath, dirName, 'markdown');
      const result = await exportMarkdown(dirName, cache, sessions, outDir);
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
      const sessions = await loadProjectSessions(ctx, dirName);
      const cache = loadProjectEnhanceResult(dirName) ?? buildFallbackCache(sessions);
      const outDir = safeExportPath(outputPath, dirName, 'html');
      const result = await exportHtml(dirName, cache, sessions, outDir);
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
      const sessions = await loadProjectSessions(ctx, dirName);
      const cache = loadProjectEnhanceResult(dirName) ?? buildFallbackCache(sessions);
      const htmlFiles = generateHtmlFiles(dirName, cache, sessions);
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
      const sessions = await loadProjectSessions(ctx, dirName);
      const cache = loadProjectEnhanceResult(dirName) ?? buildFallbackCache(sessions);

      // Re-use exportMarkdown to a temp dir, then zip the result
      const tmpDir = path.join(EXPORTS_BASE, '.tmp', `${dirName}-${Date.now()}`);
      const result = await exportMarkdown(dirName, cache, sessions, tmpDir);

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
      const sessions = await loadProjectSessions(ctx, dirName);
      const cache = loadProjectEnhanceResult(dirName);
      const payload = {
        project: dirName,
        exportedAt: new Date().toISOString(),
        enhanced: !!cache,
        ...(cache ? { narrative: cache.result.narrative, arc: cache.result.arc, skills: cache.result.skills, timeline: cache.result.timeline } : {}),
        sessions: sessions.map((s) => {
          const enhanced = loadEnhancedData(s.id);
          return {
            id: s.id,
            title: enhanced?.title ?? s.title,
            date: s.date,
            durationMinutes: s.durationMinutes,
            turns: s.turns,
            linesOfCode: s.linesOfCode,
            toolCalls: s.toolCalls,
            skills: enhanced?.skills ?? s.skills,
            filesChanged: s.filesChanged,
            source: s.source,
            ...(enhanced?.developerTake ? { developerTake: enhanced.developerTake } : {}),
            ...(enhanced?.context ? { context: enhanced.context } : {}),
          };
        }),
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
