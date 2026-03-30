import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { Server } from 'node:http';
import { getDatabase } from './db.js';
import { syncWithTracking, startFileWatcher, startCursorPolling, markSyncPending } from './sync.js';
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

function getPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export const SERVER_VERSION = getPackageVersion();

function getPidFilePath(): string {
  const configDir = process.env.HEYIAM_CONFIG_DIR || path.join(homedir(), '.config', 'heyiam');
  return path.join(configDir, 'server.pid');
}

export function writeServerPidFile(): void {
  const pidPath = getPidFilePath();
  mkdirSync(path.dirname(pidPath), { recursive: true });
  writeFileSync(pidPath, String(process.pid), { mode: 0o600 });
}

export function removeServerPidFile(): void {
  try { unlinkSync(getPidFilePath()); } catch { /* already gone */ }
}

export function readServerPid(): number | null {
  try {
    const pid = parseInt(readFileSync(getPidFilePath(), 'utf-8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Check if a PID belongs to a heyiam process.
 * Returns false if the process doesn't exist or isn't heyiam.
 */
export function isHeyiamProcess(pid: number): boolean {
  try {
    const cmdline = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf-8' }).trim();
    return cmdline.includes('heyiam');
  } catch {
    return false;
  }
}

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

  app.use(cors({ origin: ['http://localhost:17845', 'http://127.0.0.1:17845', 'http://localhost:5173'] }));
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

  // ── Version endpoint (used by `heyiam open` to detect stale instances) ──
  app.get('/api/version', (_req: Request, res: Response) => {
    res.json({ server: 'heyiam', version: SERVER_VERSION });
  });

  // ── Static files ───────────────────────────────────────────
  // In production (npm package), frontend is copied to dist/public/ by the build script.
  // In dev, fall back to app/dist/ (Vite's output).
  const prodDir = path.resolve(__dirname, 'public');
  const devDir = path.resolve(__dirname, '..', 'app', 'dist');
  const staticDir = existsSync(prodDir) ? prodDir : devDir;
  app.use(express.static(staticDir));

  // SPA fallback -- serve index.html for non-API routes
  // Express 5 requires { root } option for sendFile (absolute paths fail silently)
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile('index.html', { root: staticDir }, (err) => {
      if (err && !res.headersSent) {
        console.error(`[spa] sendFile failed for ${staticDir}/index.html:`, (err as Error).message);
        res.status(404).send('Page not found');
      }
    });
  });

  return app;
}

export function startServer(port: number = 17845, options?: { demo?: boolean }): Promise<Server> {
  const app = createApp();
  const db = getDatabase();

  if (!options?.demo) {
    // Mark sync as pending synchronously so dashboard knows sync will happen
    markSyncPending();
    // Run initial sync in the background (non-blocking)
    syncWithTracking(db).then((result) => {
      if (result.indexed > 0) {
        console.log(`Indexed ${result.indexed} sessions (${result.skipped} up-to-date)`);
      }
    }).catch((err) => {
      console.error('[sync] Initial sync failed:', (err as Error).message);
    });
  }

  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      // Write PID file so `heyiam open` can find and kill stale instances
      writeServerPidFile();

      if (!options?.demo) {
        // Start live sync after server is listening
        const stopFileWatcher = startFileWatcher(db);
        const stopCursorPolling = startCursorPolling(db);

        // Clean up watchers and PID file when server closes
        server.on('close', () => {
          stopFileWatcher();
          stopCursorPolling();
          removeServerPidFile();
        });
      } else {
        server.on('close', () => { removeServerPidFile(); });
      }

      resolve(server);
    });
  });
}
