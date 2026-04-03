import { Router, type Request, type Response } from 'express';
import { getProvider } from '../llm/index.js';
import { triageSessions, type SessionMetaWithStats } from '../llm/triage.js';
import { enhanceProject, refineNarrative, type SessionSummary, type SkippedSessionMeta, type ProjectEnhanceResult } from '../llm/project-enhance.js';
import {
  saveAnthropicApiKey, clearAnthropicApiKey, getAnthropicApiKey,
  saveEnhancedData, loadEnhancedData, deleteEnhancedData,
  loadFreshProjectEnhanceResult, saveProjectEnhanceResult,
  loadProjectEnhanceResult, buildProjectFingerprint,
  getUploadedState,
} from '../settings.js';
import { requireProject, type RouteContext } from './context.js';
import { startSSE } from './sse.js';

export function createEnhanceRouter(ctx: RouteContext): Router {
  const router = Router();

  // Triage endpoint -- AI selects which sessions are worth showcasing (SSE stream)
  router.post('/api/projects/:project/triage', async (req: Request, res: Response) => {
    if (!getAnthropicApiKey()) {
      res.status(400).json({ error: { code: 'NO_API_KEY', message: 'No Anthropic API key configured. Add one in Settings or set ANTHROPIC_API_KEY.' } });
      return;
    }

    const { project } = req.params;
    const proj = await requireProject(ctx, project, res);
    if (!proj) return;

    const send = startSSE(res);

    try {
      const total = proj.sessions.length;
      const sessionsWithStats: SessionMetaWithStats[] = [];
      for (let i = 0; i < proj.sessions.length; i++) {
        const meta = proj.sessions[i];
        send({ type: 'loading_stats', sessionId: meta.sessionId, index: i, total });
        const stats = await ctx.getSessionStats(meta, proj.name);
        sessionsWithStats.push({
          sessionId: meta.sessionId,
          path: meta.path,
          title: stats.date ? `Session ${meta.sessionId.slice(0, 8)}` : meta.sessionId,
          duration: stats.duration,
          loc: stats.loc,
          turns: stats.turns,
          files: stats.files,
          skills: stats.skills,
          date: stats.date,
        });
      }

      const useLLM = req.body?.useLLM !== false;
      const result = await triageSessions(sessionsWithStats, useLLM, (event) => {
        send(event as unknown as Record<string, unknown>);
      });

      const published = getUploadedState(proj.dirName);
      const alreadyUploaded = published?.uploadedSessions ?? [];

      send({ type: 'result', ...result, alreadyUploaded });
      res.end();
    } catch (err) {
      send({ type: 'error', code: 'TRIAGE_FAILED', message: (err as Error).message });
      res.end();
    }
  });

  // Enhance a single session
  router.post('/api/projects/:project/sessions/:id/enhance', async (req: Request, res: Response) => {
    try {
      const { project, id } = req.params;
      const proj = await requireProject(ctx, project, res);
      if (!proj) return;

      const meta = proj.sessions.find((s) => s.sessionId === id);
      if (!meta) {
        res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const session = await ctx.loadSession(meta.path, proj.name, meta.sessionId);
      const provider = getProvider();
      const result = await provider.enhance(session);

      saveEnhancedData(id as string, result);
      console.log(`[enhance] Saved enhanced data for ${id}`);

      res.json({ result, provider: provider.name });
    } catch (err) {
      const error = err as Error & { code?: string };
      res.status(500).json({
        error: {
          code: error.code ?? 'ENHANCE_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Delete locally-saved enhanced data
  router.delete('/api/sessions/:id/enhanced', (_req: Request, res: Response) => {
    const { id } = _req.params;
    deleteEnhancedData(id as string);
    console.log(`[enhance] Deleted enhanced data for ${id}`);
    res.json({ ok: true });
  });

  // Enhancement status
  router.get('/api/enhance/status', async (_req: Request, res: Response) => {
    try {
      if (getAnthropicApiKey()) {
        res.json({ mode: 'local', remaining: null });
      } else {
        res.json({ mode: 'none', remaining: 0, message: 'No API key configured' });
      }
    } catch {
      res.json({ mode: 'unknown', remaining: null });
    }
  });

  // Project enhance -- enhance selected sessions + generate project narrative (SSE)
  router.post('/api/projects/:project/enhance-project', async (req: Request, res: Response) => {
    const { project } = req.params;
    const { selectedSessionIds, skippedSessions, force } = req.body as {
      selectedSessionIds: string[];
      skippedSessions: SkippedSessionMeta[];
      force?: boolean;
    };

    if (!Array.isArray(selectedSessionIds) || selectedSessionIds.length === 0) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'selectedSessionIds must be a non-empty array' } });
      return;
    }

    if (!getAnthropicApiKey()) {
      res.status(400).json({ error: { code: 'NO_API_KEY', message: 'No Anthropic API key configured. Add one in Settings or set ANTHROPIC_API_KEY.' } });
      return;
    }

    const send = startSSE(res);

    try {
      const projects = await ctx.getProjects();
      const proj = projects.find((p) => p.name === project || p.dirName === project);
      if (!proj) {
        send({ type: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
        res.end();
        return;
      }

      if (!force) {
        const cached = loadFreshProjectEnhanceResult(proj.dirName, selectedSessionIds);
        if (cached) {
          send({ type: 'cached', enhancedAt: cached.enhancedAt });
          send({ type: 'done', result: cached.result });
          res.end();
          return;
        }
      }

      const staleCache = loadProjectEnhanceResult(proj.dirName);
      if (staleCache) {
        const currentFp = buildProjectFingerprint(selectedSessionIds);
        if (staleCache.fingerprint !== currentFp) {
          send({ type: 'stale_cache', previousEnhancedAt: staleCache.enhancedAt });
        }
      }

      const provider = getProvider();

      const sessionSummaries: SessionSummary[] = [];
      const CONCURRENCY = 3;

      for (let i = 0; i < selectedSessionIds.length; i += CONCURRENCY) {
        const batch = selectedSessionIds.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (sessionId) => {
          const meta = proj.sessions.find((s) => s.sessionId === sessionId);
          if (!meta) return;

          const existing = loadEnhancedData(sessionId);
          if (existing) {
            send({ type: 'session_progress', sessionId, status: 'skipped', title: existing.title, skills: existing.skills });
            sessionSummaries.push({
              sessionId,
              title: existing.title,
              developerTake: existing.developerTake,
              skills: existing.skills,
              executionSteps: existing.executionSteps.map((s) => ({ title: s.title, body: s.body })),
              duration: 0,
              loc: 0,
              turns: 0,
              files: 0,
              date: existing.enhancedAt,
            });
            return;
          }

          send({ type: 'session_progress', sessionId, status: 'enhancing' });

          try {
            const session = await ctx.loadSession(meta.path, proj.name, sessionId);
            const result = await provider.enhance(session);
            saveEnhancedData(sessionId, result);

            send({ type: 'session_progress', sessionId, status: 'done', title: result.title, skills: result.skills });

            sessionSummaries.push({
              sessionId,
              title: result.title,
              developerTake: result.developerTake,
              skills: result.skills,
              executionSteps: result.executionSteps.map((s) => ({ title: s.title, body: s.body })),
              duration: session.durationMinutes ?? 0,
              loc: session.linesOfCode ?? 0,
              turns: session.turns ?? 0,
              files: session.filesChanged?.length ?? 0,
              date: session.date ?? '',
            });
          } catch (err) {
            console.error(`[enhance-project] Session ${sessionId} failed:`, (err as Error).message);
            send({ type: 'session_progress', sessionId, status: 'failed', error: (err as Error).message });
          }
        }));
      }

      for (const summary of sessionSummaries) {
        if (summary.duration === 0) {
          const meta = proj.sessions.find((s) => s.sessionId === summary.sessionId);
          if (meta) {
            const stats = await ctx.getSessionStats(meta, proj.name);
            summary.duration = stats.duration;
            summary.loc = stats.loc;
            summary.turns = stats.turns;
            summary.files = stats.files;
            summary.date = stats.date || summary.date;
            summary.correctionCount = undefined;
          }
        }
      }

      send({ type: 'project_enhance', status: 'generating' });

      const projectResult = await enhanceProject(sessionSummaries, skippedSessions ?? [], (event) => {
        send({ type: event.type, text: event.text });
      });

      saveProjectEnhanceResult(proj.dirName, selectedSessionIds, projectResult);

      send({ type: 'done', result: projectResult });
      res.end();
    } catch (err) {
      console.error('[enhance-project] Failed:', (err as Error).message);
      send({ type: 'error', code: 'ENHANCE_FAILED', message: (err as Error).message });
      res.end();
    }
  });

  // Save project enhance result explicitly
  router.post('/api/projects/:project/enhance-save', async (req: Request, res: Response) => {
    const { project } = req.params;
    const { selectedSessionIds, result, title, repoUrl, projectUrl, screenshotBase64 } = req.body as {
      selectedSessionIds: string[];
      result: ProjectEnhanceResult;
      title?: string;
      repoUrl?: string;
      projectUrl?: string;
      screenshotBase64?: string;
    };

    if (!Array.isArray(selectedSessionIds) || !result?.narrative) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'selectedSessionIds and result are required' } });
      return;
    }

    if (title !== undefined && (typeof title !== 'string' || title.length > 200)) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'title must be a string of 200 characters or fewer' } });
      return;
    }

    try {
      const proj = await requireProject(ctx, project, res);
      if (!proj) return;

      saveProjectEnhanceResult(proj.dirName, selectedSessionIds, result, undefined, { title, repoUrl, projectUrl, screenshotBase64 });
      res.json({ saved: true, enhancedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: { code: 'SAVE_FAILED', message: (err as Error).message } });
    }
  });

  // Get cached project enhance result
  router.get('/api/projects/:project/enhance-cache', async (req: Request, res: Response) => {
    const { project } = req.params;
    try {
      const proj = await requireProject(ctx, project, res);
      if (!proj) return;

      const cached = loadProjectEnhanceResult(proj.dirName);
      if (!cached) {
        res.status(404).json({ error: { code: 'NO_CACHE', message: 'No cached enhance result' } });
        return;
      }

      const currentFp = buildProjectFingerprint(cached.selectedSessionIds);
      const isFresh = cached.fingerprint === currentFp;

      res.json({
        ...cached,
        isFresh,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'CACHE_READ_FAILED', message: (err as Error).message } });
    }
  });

  // Narrative refinement
  router.post('/api/projects/:project/refine-narrative', async (req: Request, res: Response) => {
    try {
      const { draftNarrative, draftTimeline, answers } = req.body as {
        draftNarrative: string;
        draftTimeline: ProjectEnhanceResult['timeline'];
        answers: Array<{ questionId: string; question: string; answer: string }>;
      };

      if (!draftNarrative || typeof draftNarrative !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'draftNarrative is required' } });
        return;
      }

      const refined = await refineNarrative(draftNarrative, draftTimeline ?? [], answers ?? []);
      res.json(refined);
    } catch (err) {
      res.status(500).json({
        error: { code: 'REFINE_FAILED', message: (err as Error).message },
      });
    }
  });

  return router;
}
