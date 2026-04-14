import { Router, type Request, type Response } from 'express';
import { getAuthToken } from '../auth.js';
import { API_URL, warnIfNonDefaultApiUrl } from '../config.js';
import {
  getUploadedState,
  clearUploadedState,
  saveUploadedState,
  loadEnhancedData,
  saveEnhancedData,
} from '../settings.js';
import type { RouteContext } from './context.js';

/**
 * Structured error response. Matches the shape used elsewhere in the CLI
 * routes (see publish-portfolio.test.ts, which asserts error.code +
 * error.message).
 */
interface RouteError {
  code: string;
  message: string;
}

function sendError(res: Response, status: number, error: RouteError): void {
  res.status(status).json({ error });
}

/**
 * Validate a path segment at the HTTP boundary. Slugs + session IDs are
 * bounded-length strings; tighter format enforcement belongs on the
 * server. We just reject obviously malformed input so bogus requests
 * don't hit Phoenix.
 */
function validatePathParam(value: unknown, field: string): RouteError | null {
  if (typeof value !== 'string') {
    return { code: 'INVALID_PARAM', message: `${field} is required` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { code: 'INVALID_PARAM', message: `${field} is required` };
  }
  if (trimmed.length > 200) {
    return { code: 'INVALID_PARAM', message: `${field} exceeds 200 characters` };
  }
  return null;
}

export function createDeleteRouter(_ctx: RouteContext): Router {
  const router = Router();

  /**
   * DELETE /api/projects/:project/remote
   *
   * Removes the project (and all its sessions, per Phoenix contract) from
   * heyi.am. Does NOT touch local archived session data — the user may be
   * mid-edit. Clears the local uploaded-state record so the UI re-reflects
   * "Local only" after the round-trip.
   *
   * :project is the CLI-side directory name, NOT the published slug. We
   * resolve the published slug from local uploaded state — if the user
   * never published from this machine we have no slug to delete against.
   */
  router.delete('/api/projects/:project/remote', async (req: Request, res: Response) => {
    const project = req.params.project;
    const validationError = validatePathParam(project, 'project');
    if (validationError) {
      sendError(res, 400, validationError);
      return;
    }

    const auth = getAuthToken();
    warnIfNonDefaultApiUrl();
    if (!auth) {
      sendError(res, 401, { code: 'UNAUTHENTICATED', message: 'Authentication required' });
      return;
    }

    const uploaded = getUploadedState(project);
    if (!uploaded?.slug) {
      sendError(res, 404, {
        code: 'NOT_PUBLISHED',
        message: 'This project has no remote copy to delete',
      });
      return;
    }

    try {
      const phoenixRes = await fetch(`${API_URL}/api/projects/${encodeURIComponent(uploaded.slug)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` },
      });

      if (phoenixRes.status === 204) {
        // Strip local uploaded state + session 'uploaded' flags so UI
        // shows the correct status. Failure to clear local flags is
        // non-fatal (the remote copy is already gone).
        try {
          clearUploadedState(project);
          for (const sessionId of uploaded.uploadedSessions ?? []) {
            const enhanced = loadEnhancedData(sessionId);
            if (enhanced?.uploaded) {
              saveEnhancedData(sessionId, { ...enhanced, uploaded: false });
            }
          }
        } catch (cleanupErr) {
          console.warn('[delete-project] local cleanup failed:', (cleanupErr as Error).message);
        }
        res.json({ ok: true });
        return;
      }

      if (phoenixRes.status === 404) {
        // Remote already gone — still clear local state so UI
        // re-renders as "Local only". Surface 404 so UI can inform
        // the user the remote copy was already missing.
        try { clearUploadedState(project); } catch { /* best effort */ }
        sendError(res, 404, {
          code: 'NOT_FOUND',
          message: 'Project not found on heyi.am (already deleted?)',
        });
        return;
      }

      if (phoenixRes.status === 401 || phoenixRes.status === 403) {
        sendError(res, phoenixRes.status, {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to delete this project',
        });
        return;
      }

      const status = phoenixRes.status >= 500 ? 502 : phoenixRes.status;
      sendError(res, status, {
        code: 'DELETE_FAILED',
        message: `Remote delete failed (HTTP ${phoenixRes.status})`,
      });
    } catch (err) {
      const message = (err as Error).message;
      console.error('[delete-project] Error:', message);
      sendError(res, 502, { code: 'DELETE_FAILED', message });
    }
  });

  /**
   * DELETE /api/projects/:project/sessions/:sessionId/remote
   *
   * Removes a single session from heyi.am. Local archive is untouched.
   * Updates the local uploaded-state record so the session no longer
   * appears in the "uploaded" set. Leaves the project uploaded-state
   * shell in place when this was the last session — per spec, the user
   * may be mid-edit.
   */
  router.delete(
    '/api/projects/:project/sessions/:sessionId/remote',
    async (req: Request, res: Response) => {
      const project = req.params.project;
      const sessionId = req.params.sessionId;

      const projectErr = validatePathParam(project, 'project');
      if (projectErr) { sendError(res, 400, projectErr); return; }
      const sessionErr = validatePathParam(sessionId, 'sessionId');
      if (sessionErr) { sendError(res, 400, sessionErr); return; }

      const auth = getAuthToken();
      warnIfNonDefaultApiUrl();
      if (!auth) {
        sendError(res, 401, { code: 'UNAUTHENTICATED', message: 'Authentication required' });
        return;
      }

      try {
        const phoenixRes = await fetch(
          `${API_URL}/api/sessions/${encodeURIComponent(sessionId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${auth.token}` },
          },
        );

        if (phoenixRes.status === 204) {
          try {
            const uploaded = getUploadedState(project);
            if (uploaded) {
              const remaining = (uploaded.uploadedSessions ?? []).filter((id) => id !== sessionId);
              saveUploadedState(project, {
                slug: uploaded.slug,
                projectId: uploaded.projectId,
                uploadedSessions: remaining,
              });
            }
            const enhanced = loadEnhancedData(sessionId);
            if (enhanced?.uploaded) {
              saveEnhancedData(sessionId, { ...enhanced, uploaded: false });
            }
          } catch (cleanupErr) {
            console.warn('[delete-session] local cleanup failed:', (cleanupErr as Error).message);
          }
          res.json({ ok: true });
          return;
        }

        if (phoenixRes.status === 404) {
          sendError(res, 404, {
            code: 'NOT_FOUND',
            message: 'Session not found on heyi.am (already deleted?)',
          });
          return;
        }

        if (phoenixRes.status === 401 || phoenixRes.status === 403) {
          sendError(res, phoenixRes.status, {
            code: 'UNAUTHORIZED',
            message: 'Not authorized to delete this session',
          });
          return;
        }

        const status = phoenixRes.status >= 500 ? 502 : phoenixRes.status;
        sendError(res, status, {
          code: 'DELETE_FAILED',
          message: `Remote delete failed (HTTP ${phoenixRes.status})`,
        });
      } catch (err) {
        const message = (err as Error).message;
        console.error('[delete-session] Error:', message);
        sendError(res, 502, { code: 'DELETE_FAILED', message });
      }
    },
  );

  return router;
}
