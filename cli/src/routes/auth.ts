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

  // Check username availability — proxy to Phoenix
  router.get('/api/auth/check-username', async (req: Request, res: Response) => {
    try {
      const username = req.query.username as string;
      if (!username || username.length < 2) {
        res.json({ available: false, reason: 'Username must be at least 2 characters' });
        return;
      }
      if (!/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/i.test(username)) {
        res.json({ available: false, reason: 'Letters, numbers, hyphens, and underscores only' });
        return;
      }

      const response = await fetch(`${API_URL}/api/username/check?username=${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json() as { available: boolean; reason?: string };
        res.json(data);
      } else {
        // If Phoenix doesn't have this endpoint yet, assume available
        res.json({ available: true });
      }
    } catch {
      // Phoenix not reachable — assume available for now, signup will validate
      res.json({ available: true });
    }
  });

  // Start device auth with a preferred username
  router.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const username = req.body?.username as string | undefined;
      console.log(`[auth/signup] Starting device auth${username ? ` with username: ${username}` : ''} via ${API_URL}/api/device/code`);

      const response = await fetch(`${API_URL}/api/device/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(username ? { preferred_username: username } : {}),
      });

      if (!response.ok) {
        console.log(`[auth/signup] FAILED ${response.status}`);
        res.status(response.status).json({ error: 'Failed to start device auth' });
        return;
      }

      const data = await response.json() as Record<string, unknown>;
      // Build signup URL: registration page with device code + username pre-filled
      // After registration, Phoenix should redirect to /device?code=xxx to authorize
      const baseUrl = new URL(data.verification_uri as string).origin;
      const params = new URLSearchParams();
      if (data.user_code) params.set('device_code', data.user_code as string);
      if (username) params.set('username', username);
      const signupUri = `${baseUrl}/users/register?${params.toString()}`;

      console.log(`[auth/signup] Got code: ${data.user_code}, signup: ${signupUri}`);
      res.json({ ...data, verification_uri: signupUri });
    } catch (err) {
      console.error('[auth/signup] EXCEPTION:', err);
      res.status(500).json({ error: 'Signup request failed' });
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
