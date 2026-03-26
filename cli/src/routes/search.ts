import { Router, type Request, type Response } from 'express';
import { searchFts } from '../db.js';
import { displayNameFromDir, type RouteContext } from './context.js';

export function createSearchRouter(ctx: RouteContext): Router {
  const router = Router();

  router.get('/api/search', async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string) ?? '';
      const source = req.query.source as string | undefined;
      const project = req.query.project as string | undefined;
      const after = req.query.after as string | undefined;
      const before = req.query.before as string | undefined;
      const skill = req.query.skill as string | undefined;
      const file = req.query.file as string | undefined;
      const minDuration = req.query.minDuration ? Number(req.query.minDuration) : undefined;

      if (!q && !source && !project && !after && !before && !skill && !file) {
        res.json({ results: [], total: 0 });
        return;
      }

      // FTS search (if query provided)
      let sessionIds: Set<string> | null = null;
      const snippetMap = new Map<string, string>();

      if (q) {
        try {
          const ftsResults = searchFts(ctx.db, q, 50);
          sessionIds = new Set(ftsResults.map((r) => r.sessionId));
          for (const r of ftsResults) {
            if (!snippetMap.has(r.sessionId)) {
              snippetMap.set(r.sessionId, r.snippet);
            }
          }
        } catch {
          res.json({ results: [], total: 0 });
          return;
        }
      }

      // Build results from DB rows with metadata filters
      let query = 'SELECT * FROM sessions WHERE is_subagent = 0';
      const params: unknown[] = [];

      if (sessionIds) {
        if (sessionIds.size === 0) {
          res.json({ results: [], total: 0 });
          return;
        }
        query += ` AND id IN (${[...sessionIds].map(() => '?').join(',')})`;
        params.push(...sessionIds);
      }
      if (source) {
        query += ' AND source = ?';
        params.push(source);
      }
      if (project) {
        query += ' AND (project_dir = ? OR project_dir LIKE ?)';
        params.push(project, `%${project}%`);
      }
      if (after) {
        query += ' AND start_time >= ?';
        params.push(after);
      }
      if (before) {
        query += ' AND start_time <= ?';
        params.push(before);
      }
      if (minDuration) {
        query += ' AND duration_minutes >= ?';
        params.push(minDuration);
      }
      if (skill) {
        query += ' AND skills LIKE ?';
        params.push(`%${skill}%`);
      }

      query += ' ORDER BY start_time DESC LIMIT 50';

      const rows = ctx.db.prepare(query).all(...params) as Array<{
        id: string;
        project_dir: string;
        source: string;
        title: string | null;
        start_time: string | null;
        duration_minutes: number | null;
        turns: number | null;
        loc_added: number | null;
        loc_removed: number | null;
        skills: string | null;
      }>;

      const results = rows.map((row) => ({
        sessionId: row.id,
        title: row.title ?? 'Untitled session',
        projectDir: row.project_dir,
        projectName: displayNameFromDir(row.project_dir),
        source: row.source,
        date: row.start_time ?? '',
        durationMinutes: row.duration_minutes ?? 0,
        turns: row.turns ?? 0,
        linesOfCode: (row.loc_added ?? 0) + (row.loc_removed ?? 0),
        skills: row.skills ? JSON.parse(row.skills) : [],
        snippet: snippetMap.get(row.id) ?? '',
        score: sessionIds ? [...sessionIds].indexOf(row.id) : 0,
      }));

      // Post-filter by file if requested
      let filtered = results;
      if (file) {
        const fileSessionIds = new Set(
          (ctx.db.prepare('SELECT DISTINCT session_id FROM session_files WHERE file_path LIKE ?')
            .all(`%${file}%`) as Array<{ session_id: string }>)
            .map((r) => r.session_id),
        );
        filtered = results.filter((r) => fileSessionIds.has(r.sessionId));
      }

      res.json({ results: filtered, total: filtered.length });
    } catch (err) {
      res.status(500).json({ error: { code: 'SEARCH_FAILED', message: (err as Error).message } });
    }
  });

  return router;
}
