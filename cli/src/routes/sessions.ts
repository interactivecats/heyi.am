import { Router, type Request, type Response } from 'express';
import { listSessions, parseSession } from '../parsers/index.js';
import { bridgeToAnalyzer } from '../bridge.js';
import { analyzeSession, type ParsedTurn } from '../analyzer.js';
import { getSessionRow } from '../db.js';
import { ensureSessionIndexed } from '../sync.js';
import { exportSessionContext, type ExportTier } from '../context-export.js';
import { displayNameFromDir, type RouteContext } from './context.js';

/**
 * Find a session's file path and project name, checking the DB first,
 * then falling back to live discovery (triggers indexing as a side effect).
 */
async function resolveSession(ctx: RouteContext, id: string): Promise<{ filePath: string; projectName: string } | null> {
  // Try DB first
  const row = getSessionRow(ctx.db, id);
  if (row?.file_path) {
    return { filePath: row.file_path, projectName: displayNameFromDir(row.project_dir) };
  }

  // Fallback: discover live sessions and index the match
  const allSessions = await listSessions(ctx.sessionsBasePath);
  const meta = allSessions.find((s) => s.sessionId === id);
  if (!meta) return null;

  const projectName = displayNameFromDir(meta.projectDir);
  try { await ensureSessionIndexed(ctx.db, meta, projectName); } catch { /* best effort */ }
  return { filePath: meta.path, projectName };
}

export function createSessionsRouter(ctx: RouteContext): Router {
  const router = Router();

  // Session by ID (cross-project lookup)
  router.get('/api/sessions/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const resolved = await resolveSession(ctx, id);
      if (!resolved) {
        res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const session = await ctx.loadSession(resolved.filePath, resolved.projectName, id);
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: { code: 'LOAD_FAILED', message: (err as Error).message } });
    }
  });

  // Session context export
  router.get('/api/sessions/:id/context', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const format = (String(req.query.format ?? 'summary')) as ExportTier;

      const resolved = await resolveSession(ctx, id);
      if (!resolved) {
        res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const parsed = await parseSession(resolved.filePath);
      const analyzerInput = bridgeToAnalyzer(parsed, { sessionId: id, projectName: resolved.projectName });
      const session = analyzeSession(analyzerInput);
      const turns: ParsedTurn[] = analyzerInput.turns;

      const result = exportSessionContext(session, turns, { tier: format });

      res.json({
        content: result.content,
        tokens: result.tokens,
        format: result.tier,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'CONTEXT_EXPORT_FAILED', message: (err as Error).message } });
    }
  });

  return router;
}
