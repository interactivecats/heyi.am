import { Router, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { saveAnthropicApiKey, clearAnthropicApiKey, getAnthropicApiKey, getSettings, setDefaultTemplate, getPortfolioProfile, savePortfolioProfile, type PortfolioProfile } from '../settings.js';
import { invalidatePortfolioPreviewCache } from './preview.js';
import { hasApiKey } from '../llm/index.js';
import { isValidTemplate, DEFAULT_TEMPLATE, BUILT_IN_TEMPLATES } from '../render/templates.js';
import { getDbPath } from '../db.js';
import { getDaemonBinaryPath } from '../daemon-install.js';
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
    invalidatePortfolioPreviewCache();
    console.log(`[settings] Portfolio theme set to: ${template}`);
    res.json({ ok: true, template });
  });

  // Get portfolio profile data
  router.get('/api/portfolio', (_req: Request, res: Response) => {
    res.json(getPortfolioProfile());
  });

  // Save portfolio profile data
  router.post('/api/portfolio', (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: { code: 'INVALID_BODY', message: 'Request body must be a JSON object' } });
      return;
    }

    const ALLOWED_FIELDS: Array<keyof PortfolioProfile> = [
      'displayName', 'bio', 'photoBase64', 'location', 'email', 'phone',
      'linkedinUrl', 'githubUrl', 'twitterHandle', 'websiteUrl',
      'resumeBase64', 'resumeFilename',
    ];

    const errors: Array<{ field: string; message: string }> = [];

    // Structural validation: only allow known string fields
    const cleaned: PortfolioProfile = {};
    for (const key of ALLOWED_FIELDS) {
      const val = body[key];
      if (val === undefined || val === null || val === '') continue;
      if (typeof val !== 'string') {
        errors.push({ field: key, message: `${key} must be a string` });
        continue;
      }
      cleaned[key] = val;
    }

    // Length limits
    if (cleaned.displayName && cleaned.displayName.length > 200) {
      errors.push({ field: 'displayName', message: 'Display name must be under 200 characters' });
    }
    if (cleaned.bio && cleaned.bio.length > 2000) {
      errors.push({ field: 'bio', message: 'Bio must be under 2000 characters' });
    }
    if (cleaned.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }
    if (cleaned.linkedinUrl && !cleaned.linkedinUrl.startsWith('http')) {
      errors.push({ field: 'linkedinUrl', message: 'LinkedIn URL must start with http' });
    }
    if (cleaned.githubUrl && !cleaned.githubUrl.startsWith('http')) {
      errors.push({ field: 'githubUrl', message: 'GitHub URL must start with http' });
    }
    if (cleaned.websiteUrl && !cleaned.websiteUrl.startsWith('http')) {
      errors.push({ field: 'websiteUrl', message: 'Website URL must start with http' });
    }

    // File size limits (base64 ~1.37x raw; cap photo at ~5MB, resume at ~10MB)
    if (cleaned.photoBase64 && cleaned.photoBase64.length > 7_000_000) {
      errors.push({ field: 'photoBase64', message: 'Photo must be under 5MB' });
    }
    if (cleaned.resumeBase64 && cleaned.resumeBase64.length > 14_000_000) {
      errors.push({ field: 'resumeBase64', message: 'Resume must be under 10MB' });
    }

    if (errors.length > 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields: errors } });
      return;
    }

    savePortfolioProfile(cleaned);
    invalidatePortfolioPreviewCache();
    console.log('[settings] Portfolio profile saved');
    res.json({ ok: true });
  });

  // Local data summary: read-only diagnostic info displayed in Settings
  // (DB path, daemon install state). Archive count + last sync are served
  // by /api/archive/stats so the frontend composes both responses.
  router.get('/api/local-data', (_req: Request, res: Response) => {
    try {
      const dbPath = getDbPath();
      const daemonBinaryPath = getDaemonBinaryPath();
      const daemonInstalled = existsSync(daemonBinaryPath);
      res.json({
        dbPath,
        daemon: {
          installed: daemonInstalled,
          binaryPath: daemonBinaryPath,
        },
      });
    } catch (err) {
      console.error('[local-data]', (err as Error).message);
      res.status(500).json({
        error: { code: 'LOCAL_DATA_FAILED', message: 'Failed to read local data summary' },
      });
    }
  });

  return router;
}
