import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseSession } from '../parsers/index.js';
import { bridgeToAnalyzer } from '../bridge.js';
import { analyzeSession, type Session } from '../analyzer.js';
import { loadProjectEnhanceResult } from '../settings.js';
import { exportMarkdown, exportHtml } from '../export.js';
import type { RouteContext } from './context.js';

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

export function createExportRouter(ctx: RouteContext): Router {
  const router = Router();

  router.post('/api/projects/:project/save-local', async (req: Request, res: Response) => {
    try {
      const dirName = String(req.params.project);
      const cache = loadProjectEnhanceResult(dirName);
      if (!cache) {
        res.status(404).json({ error: 'No enhance result found' });
        return;
      }
      const sessions = await loadProjectSessions(ctx, dirName);
      const outputPath = path.resolve(process.env.HOME || '~', '.config', 'heyiam', 'exports', dirName, 'markdown');
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
      const cache = loadProjectEnhanceResult(dirName);
      if (!cache) {
        res.status(404).json({ error: 'No enhance result found' });
        return;
      }
      const sessions = await loadProjectSessions(ctx, dirName);
      const outDir: string = outputPath || path.resolve(process.env.HOME || '~', '.config', 'heyiam', 'exports', dirName, 'markdown');
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
      const cache = loadProjectEnhanceResult(dirName);
      if (!cache) {
        res.status(404).json({ error: 'No enhance result found' });
        return;
      }
      const sessions = await loadProjectSessions(ctx, dirName);
      const outDir: string = outputPath || path.resolve(process.env.HOME || '~', '.config', 'heyiam', 'exports', dirName, 'html');
      const result = await exportHtml(dirName, cache, sessions, outDir);
      res.json(result);
    } catch (err) {
      console.error('[export-html]', (err as Error).message);
      res.status(500).json({ error: 'HTML export failed' });
    }
  });

  // Open directory (macOS)
  router.post('/api/open-directory', (req: Request, res: Response) => {
    try {
      const dirPath = req.body?.path;
      if (!dirPath || typeof dirPath !== 'string') {
        res.status(400).json({ error: 'Missing path' });
        return;
      }
      execFileSync('open', [dirPath]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[open-directory]', (err as Error).message);
      res.status(500).json({ error: 'Failed to open directory' });
    }
  });

  return router;
}
