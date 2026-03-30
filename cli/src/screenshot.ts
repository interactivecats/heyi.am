import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { get as httpGet } from 'node:http';

export const SCREENSHOTS_DIR = join(homedir(), '.local', 'share', 'heyiam', 'screenshots');

/** Known Chrome binary paths by platform */
const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

/**
 * Find the first available Chrome binary on the system.
 * Returns the path or null if not found.
 */
export function findChrome(): string | null {
  const paths = CHROME_PATHS[platform()] ?? [];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Validate that a URL is safe for screenshot capture.
 * Only allows http/https schemes and rejects private/internal IPs.
 */
function isUrlSafe(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }

  // Only allow http(s)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  // Reject localhost and private IPs
  const host = parsed.hostname.toLowerCase();
  // Strip IPv6 brackets for comparison
  const bare = host.startsWith('[') ? host.slice(1, -1) : host;
  if (bare === 'localhost' || bare === '127.0.0.1' || bare === '::1' || bare === '0.0.0.0') {
    // Allow our own preview server
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    if (port !== '17845') return false;
  }
  // Reject private IP ranges (IPv4)
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(bare)) return false;
  // Reject IPv6 private ranges (link-local, ULA, loopback, IPv4-mapped)
  if (/^(fe80:|fc|fd|::ffff:(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.))/i.test(bare)) return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;

  return true;
}

/**
 * Sanitize a slug for use as a filename — alphanumeric, hyphens, underscores only.
 */
function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

/** Send a CDP command over WebSocket and wait for the response */
function cdpSend(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15_000);
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        clearTimeout(timeout);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result ?? {});
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** Wait for a specific CDP event */
function cdpWaitFor(ws: WebSocket, eventName: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP event timeout: ${eventName}`)), timeoutMs);
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      if (msg.method === eventName) {
        ws.removeEventListener('message', handler);
        clearTimeout(timeout);
        resolve();
      }
    };
    ws.addEventListener('message', handler);
  });
}

/** Fetch JSON from a local HTTP endpoint */
function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    httpGet(url, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

/**
 * Fallback: capture using Chrome CLI --screenshot (viewport-only, not full page).
 * Used when WebSocket is unavailable (Node < 22).
 */
async function captureScreenshotFallback(chrome: string, url: string, outPath: string): Promise<string | null> {
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-software-rasterizer',
        `--screenshot=${outPath}`,
        '--window-size=1280,800',
        '--hide-scrollbars',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--disable-default-apps',
        '--mute-audio',
        '--no-first-run',
        url,
      ], { timeout: 30_000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return existsSync(outPath) ? outPath : null;
  } catch {
    return null;
  }
}

/**
 * Capture a full-page screenshot using Chrome DevTools Protocol.
 * Uses Page.getLayoutMetrics for exact content height, then
 * Page.captureScreenshot with captureBeyondViewport for a full capture.
 * Falls back to CLI --screenshot on Node < 22 (no built-in WebSocket).
 */
export async function captureScreenshot(url: string, slug: string): Promise<string | null> {
  if (!isUrlSafe(url)) return null;

  const chrome = findChrome();
  if (!chrome) return null;

  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const safeSlug = sanitizeSlug(slug);
  const outPath = join(SCREENSHOTS_DIR, `${safeSlug}.png`);

  // Fall back to CLI --screenshot if WebSocket is unavailable (Node < 22)
  if (typeof globalThis.WebSocket === 'undefined') {
    return captureScreenshotFallback(chrome, url, outPath);
  }

  // Launch Chrome with remote debugging on auto-assigned port
  const proc = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-software-rasterizer',
    '--window-size=1280,800',
    '--hide-scrollbars',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--disable-default-apps',
    '--mute-audio',
    '--no-first-run',
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  try {
    // Parse the debug port from Chrome's stderr
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 10_000);
      let stderr = '';
      proc.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (match) {
          clearTimeout(timeout);
          resolve(parseInt(match[1], 10));
        }
      });
      proc.on('exit', () => { clearTimeout(timeout); reject(new Error('Chrome exited early')); });
    });

    // Find the page target's WebSocket URL
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    // Connect via CDP
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
    });

    // Enable Page events and navigate
    await cdpSend(ws, 'Page.enable');
    const loadPromise = cdpWaitFor(ws, 'Page.loadEventFired', 20_000);
    await cdpSend(ws, 'Page.navigate', { url });
    await loadPromise;

    // Small delay for lazy-loaded content / animations
    await new Promise((r) => setTimeout(r, 1500));

    // Get the actual content dimensions
    const metrics = await cdpSend(ws, 'Page.getLayoutMetrics') as {
      contentSize: { width: number; height: number };
    };
    const width = 1280;
    const height = Math.min(Math.ceil(metrics.contentSize.height), 10_000); // cap at 10k px

    // Capture full-page screenshot
    const result = await cdpSend(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    }) as { data: string };

    // Write to disk
    writeFileSync(outPath, Buffer.from(result.data, 'base64'));

    ws.close();
    return outPath;
  } catch {
    return null;
  } finally {
    proc.kill();
  }
}
