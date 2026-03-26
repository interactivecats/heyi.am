import { Router, type Request, type Response } from 'express';
import { checkAuthStatus, saveAuthToken } from '../auth.js';
import { API_URL } from '../config.js';
import type { RouteContext } from './context.js';

export function createAuthRouter(_ctx: RouteContext): Router {
  const router = Router();

  router.get('/api/auth/status', async (_req: Request, res: Response) => {
    try {
      const status = await checkAuthStatus(API_URL);
      console.log(`[auth/status] ${status.authenticated ? `authenticated as ${status.username}` : 'not authenticated'}`);
      res.json(status);
    } catch (err) {
      console.log(`[auth/status] check failed: ${err}`);
      res.json({ authenticated: false });
    }
  });

  // Start device auth flow -- proxy to Phoenix
  router.post('/api/auth/login', async (_req: Request, res: Response) => {
    try {
      console.log(`[auth/login] Starting device auth via ${API_URL}/api/device/code`);
      const response = await fetch(`${API_URL}/api/device/code`, { method: 'POST' });
      if (!response.ok) {
        console.log(`[auth/login] FAILED ${response.status}`);
        res.status(response.status).json({ error: 'Failed to start device auth' });
        return;
      }
      const data = await response.json() as Record<string, unknown>;
      console.log(`[auth/login] Got code: ${data.user_code}, uri: ${data.verification_uri}`);
      res.json(data);
    } catch (err) {
      console.error('[auth/login] EXCEPTION:', err);
      res.status(500).json({ error: 'Device auth request failed' });
    }
  });

  // Poll for device authorization completion
  router.post('/api/auth/poll', async (req: Request, res: Response) => {
    try {
      const deviceCode = req.body?.device_code as string | undefined;
      if (!deviceCode) {
        res.status(400).json({ error: 'Missing device_code' });
        return;
      }

      const response = await fetch(`${API_URL}/api/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });

      const data = await response.json() as Record<string, unknown>;

      if (response.ok && data.access_token) {
        saveAuthToken(data.access_token as string, data.username as string);
        res.json({ authenticated: true, username: data.username });
      } else {
        res.status(response.status).json(data);
      }
    } catch {
      res.status(500).json({ error: 'Poll failed' });
    }
  });

  return router;
}
