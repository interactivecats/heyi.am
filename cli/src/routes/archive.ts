import { Router, type Request, type Response } from 'express';
import { listSessions } from '../parsers/index.js';
import { archiveSessionFiles } from '../archive.js';
import { getSourceAudit, getArchiveStats } from '../source-audit.js';
import type { RouteContext } from './context.js';

export function createArchiveRouter(_ctx: RouteContext): Router {
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
      const allSessions = await listSessions();
      const result = await archiveSessionFiles(allSessions);
      res.json({ archived: result.archived, alreadyArchived: result.alreadyArchived });
    } catch (err) {
      console.error('[archive-sync]', (err as Error).message);
      res.status(500).json({ error: 'Archive sync failed' });
    }
  });

  return router;
}
