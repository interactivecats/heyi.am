import { Router, type Request, type Response } from 'express';
import { saveAnthropicApiKey, clearAnthropicApiKey, getAnthropicApiKey, getSettings, setDefaultTemplate } from '../settings.js';
import { hasApiKey } from '../llm/index.js';
import { isValidTemplate, DEFAULT_TEMPLATE, BUILT_IN_TEMPLATES } from '../render/templates.js';
import type { RouteContext } from './context.js';

export function createSettingsRouter(_ctx: RouteContext): Router {
  const router = Router();

  // Save or clear the Anthropic API key
  router.post('/api/settings/api-key', (req: Request, res: Response) => {
    const { apiKey } = req.body as { apiKey?: string };
    if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      saveAnthropicApiKey(apiKey.trim());
      console.log('[settings] API key saved');
      res.json({ ok: true, hasKey: hasApiKey() });
    } else {
      clearAnthropicApiKey();
      console.log('[settings] API key cleared');
      res.json({ ok: true, hasKey: hasApiKey() });
    }
  });

  // Get current API key status (masked)
  router.get('/api/settings/api-key', (_req: Request, res: Response) => {
    const key = getAnthropicApiKey();
    res.json({
      hasKey: !!key,
      maskedKey: key ? `...${key.slice(-4)}` : null,
    });
  });

  // List available templates
  router.get('/api/templates', (_req: Request, res: Response) => {
    const templates = BUILT_IN_TEMPLATES.map((t) => ({
      name: t.name,
      label: t.label,
      description: t.description,
      accent: t.accent,
      mode: t.mode,
      tags: t.tags,
      builtIn: true,
    }));
    res.json({ templates });
  });

  // Get current portfolio theme
  router.get('/api/settings/theme', (_req: Request, res: Response) => {
    const settings = getSettings();
    res.json({ template: settings.defaultTemplate ?? DEFAULT_TEMPLATE });
  });

  // Set portfolio theme
  router.post('/api/settings/theme', (req: Request, res: Response) => {
    const { template } = req.body as { template?: string };
    if (!template || !isValidTemplate(template)) {
      res.status(400).json({ error: 'Invalid template name' });
      return;
    }
    setDefaultTemplate(template);
    console.log(`[settings] Portfolio theme set to: ${template}`);
    res.json({ ok: true, template });
  });

  return router;
}
