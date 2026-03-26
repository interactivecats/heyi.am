import { Router, type Request, type Response } from 'express';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getDashboardStats } from '../db.js';
import { getSyncState, onSyncProgress } from '../sync.js';
import { displayNameFromDir } from '../sync.js';
import { loadProjectEnhanceResult } from '../settings.js';
import type { RouteContext } from './context.js';

export function createDashboardRouter(ctx: RouteContext): Router {
  const router = Router();

  // ── GET /api/dashboard — single fast read from SQLite ──────
  router.get('/api/dashboard', (_req: Request, res: Response) => {
    try {
      const stats = getDashboardStats(ctx.db);
      const sync = getSyncState();

      // Count enhanced projects by checking the enhance cache directory
      let enhancedCount = 0;
      const enhanceDir = join(homedir(), '.config', 'heyiam', 'project-enhance');
      try {
        const files = readdirSync(enhanceDir).filter((f) => f.endsWith('.json'));
        enhancedCount = files.length;
      } catch { /* dir doesn't exist yet */ }

      // Enrich projects with enhancedAt from cache
      const projects = stats.projects.map((p) => {
        const cache = loadProjectEnhanceResult(p.projectDir);
        return {
          ...p,
          projectName: displayNameFromDir(p.projectDir),
          enhancedAt: cache?.enhancedAt ?? null,
        };
      });

      const isEmpty = stats.sessionCount === 0 && sync.status !== 'syncing';

      res.json({
        stats: {
          sessionCount: stats.sessionCount,
          projectCount: stats.projectCount,
          sourceCount: stats.sourceCount,
          enhancedCount,
        },
        projects,
        sync: {
          status: sync.status,
          phase: sync.phase,
          current: sync.current,
          total: sync.total,
        },
        isEmpty,
      });
    } catch (err) {
      console.error('[dashboard]', (err as Error).message);
      res.status(500).json({ error: 'Dashboard failed' });
    }
  });

  // ── GET /api/sync/progress — SSE stream for first-run ──────
  router.get('/api/sync/progress', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send current state immediately
    const current = getSyncState();
    res.write(`data: ${JSON.stringify(current)}\n\n`);

    if (current.status === 'done' || current.status === 'idle') {
      res.end();
      return;
    }

    // Subscribe to updates
    const unsubscribe = onSyncProgress((state) => {
      res.write(`data: ${JSON.stringify(state)}\n\n`);
      if (state.status === 'done') {
        res.end();
      }
    });

    req.on('close', unsubscribe);
  });

  return router;
}
