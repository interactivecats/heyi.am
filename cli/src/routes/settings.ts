import { Router, type Request, type Response } from 'express';
import { saveAnthropicApiKey, clearAnthropicApiKey, getAnthropicApiKey } from '../settings.js';
import { getEnhanceMode } from '../llm/index.js';
import type { RouteContext } from './context.js';

export function createSettingsRouter(_ctx: RouteContext): Router {
  const router = Router();

  // Save or clear the Anthropic API key
  router.post('/api/settings/api-key', (req: Request, res: Response) => {
    const { apiKey } = req.body as { apiKey?: string };
    if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      saveAnthropicApiKey(apiKey.trim());
      console.log('[settings] API key saved');
      res.json({ ok: true, mode: getEnhanceMode() });
    } else {
      clearAnthropicApiKey();
      console.log('[settings] API key cleared');
      res.json({ ok: true, mode: getEnhanceMode() });
    }
  });

  // Get current API key status (masked)
  router.get('/api/settings/api-key', (_req: Request, res: Response) => {
    const key = getAnthropicApiKey();
    res.json({
      hasKey: !!key,
      maskedKey: key ? `${key.slice(0, 4)}...` : null,
    });
  });

  return router;
}
