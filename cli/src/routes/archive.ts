import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import { readdir, stat, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { archiveSessionFiles } from '../archive.js';
import { getSourceAudit, getArchiveStats } from '../source-audit.js';
import { getArchiveDir } from '../settings.js';
import type { RouteContext } from './context.js';

export function createArchiveRouter(ctx: RouteContext): Router {
  const router = Router();

  router.get('/api/source-audit', async (_req: Request, res: Response) => {
    try {
      const result = await getSourceAudit();
      res.json(result);
    } catch (err) {
      console.error('[source-audit]', (err as Error).message);
      res.status(500).json({ error: 'Source audit failed' });
    }
  });

  router.get('/api/archive/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await getArchiveStats();
      res.json(stats);
    } catch (err) {
      console.error('[archive-stats]', (err as Error).message);
      res.status(500).json({ error: 'Archive stats failed' });
    }
  });

  router.get('/api/archive/health', async (_req: Request, res: Response) => {
    try {
      const audit = await getSourceAudit();
      const health = audit.sources.map((s) => ({
        name: s.name,
        health: s.health,
        retentionRisk: s.retentionRisk ?? null,
      }));
      res.json({ sources: health });
    } catch (err) {
      console.error('[archive-health]', (err as Error).message);
      res.status(500).json({ error: 'Archive health failed' });
    }
  });

  router.post('/api/archive/sync', async (_req: Request, res: Response) => {
    try {
      // Get session list from SQLite (fast), then archive their files
      const projects = await ctx.getProjects();
      const allSessions = projects.flatMap((p) => p.sessions);
      const result = await archiveSessionFiles(allSessions);
      res.json({ archived: result.archived, alreadyArchived: result.alreadyArchived });
    } catch (err) {
      console.error('[archive-sync]', (err as Error).message);
      res.status(500).json({ error: 'Archive sync failed' });
    }
  });

  router.get('/api/archive/export', async (_req: Request, res: Response) => {
    try {
      const archiveDir = getArchiveDir();
      const dirStat = await stat(archiveDir).catch(() => null);
      if (!dirStat?.isDirectory()) {
        res.status(404).json({ error: 'No archive directory found. Run a sync first.' });
        return;
      }

      const date = new Date().toISOString().slice(0, 10);
      const filename = `heyiam-archive-${date}.tar.gz`;

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const tar = spawn('tar', ['-czf', '-', '-C', archiveDir, '.'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      tar.stdout.pipe(res);

      tar.stderr.on('data', (chunk: Buffer) => {
        console.error('[archive-export] tar stderr:', chunk.toString());
      });

      tar.on('error', (err) => {
        console.error('[archive-export] spawn error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create archive' });
        }
      });

      tar.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
          res.status(500).json({ error: `tar exited with code ${code}` });
        }
      });
    } catch (err) {
      console.error('[archive-export]', (err as Error).message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Archive export failed' });
      }
    }
  });

  router.get('/api/archive/verify', async (_req: Request, res: Response) => {
    try {
      const archiveDir = getArchiveDir();
      const dirStat = await stat(archiveDir).catch(() => null);
      if (!dirStat?.isDirectory()) {
        res.json({ total: 0, verified: 0, missing: 0, errors: [] });
        return;
      }

      const result = { total: 0, verified: 0, missing: 0, errors: [] as string[] };
      await verifyDir(archiveDir, result);
      res.json(result);
    } catch (err) {
      console.error('[archive-verify]', (err as Error).message);
      res.status(500).json({ error: 'Archive verification failed' });
    }
  });

  return router;
}

async function verifyDir(
  dir: string,
  result: { total: number; verified: number; missing: number; errors: string[] },
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await verifyDir(fullPath, result);
    } else {
      result.total++;
      try {
        await access(fullPath, constants.R_OK);
        result.verified++;
      } catch {
        result.missing++;
        result.errors.push(fullPath);
      }
    }
  }
}
