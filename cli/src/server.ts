import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { getDatabase } from './db.js';
import { syncWithTracking, startFileWatcher, startCursorPolling } from './sync.js';
import {
  createRouteContext,
  createProjectsRouter,
  createEnhanceRouter,
  createPublishRouter,
  createSearchRouter,
  createSessionsRouter,
  createArchiveRouter,
  createAuthRouter,
  createSettingsRouter,
  createExportRouter,
  createPreviewRouter,
  createDashboardRouter,
} from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(sessionsBasePath?: string, dbPath?: string) {
  const app = express();
  const ctx = createRouteContext(sessionsBasePath, dbPath);

  // ── Shared middleware ──────────────────────────────────────

  // DNS rebinding guard: reject requests where the Host header isn't localhost.
  // Browsers always set Host to the target hostname, so a DNS-rebind from
  // evil.com:17845 → 127.0.0.1 will arrive with Host: evil.com:17845.
  const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
  app.use((req, res, next) => {
    const host = req.headers.host;
    if (!host) { res.status(403).json({ error: 'Forbidden' }); return; }
    const hostname = host.includes(':') ? host.slice(0, host.lastIndexOf(':')) : host;
    if (!ALLOWED_HOSTNAMES.has(hostname)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  });

  app.use(cors({ origin: ['http://localhost:17845', 'http://127.0.0.1:17845'] }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  // ── Mount domain routers ───────────────────────────────────
  app.use(createProjectsRouter(ctx));
  app.use(createEnhanceRouter(ctx));
  app.use(createPublishRouter(ctx));
  app.use(createSearchRouter(ctx));
  app.use(createSessionsRouter(ctx));
  app.use(createArchiveRouter(ctx));
  app.use(createAuthRouter(ctx));
  app.use(createSettingsRouter(ctx));
  app.use(createExportRouter(ctx));
  app.use(createPreviewRouter(ctx));
  app.use(createDashboardRouter(ctx));

  // ── Static files ───────────────────────────────────────────
  const staticDir = path.resolve(__dirname, '..', 'app', 'dist');
  app.use(express.static(staticDir));

  // SPA fallback -- serve index.html for non-API routes
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  return app;
}

export function startServer(port: number = 17845, options?: { demo?: boolean }): Promise<Server> {
  const app = createApp();
  const db = getDatabase();

  if (!options?.demo) {
    // Run initial sync in the background (non-blocking)
    syncWithTracking(db).then((result) => {
      if (result.indexed > 0) {
        console.log(`Indexed ${result.indexed} sessions (${result.skipped} up-to-date)`);
      }
    }).catch(() => {});
  }

  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      if (!options?.demo) {
        // Start live sync after server is listening
        const stopFileWatcher = startFileWatcher(db);
        const stopCursorPolling = startCursorPolling(db);

        // Clean up watchers when server closes
        server.on('close', () => {
          stopFileWatcher();
          stopCursorPolling();
        });
      }

      resolve(server);
    });
  });
}
