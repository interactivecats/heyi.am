import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface AuthConfig {
  token: string;
  username: string;
  savedAt: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

function getConfigDir(): string {
  return process.env.HEYIAM_CONFIG_DIR || join(homedir(), '.config', 'heyiam');
}
const AUTH_FILE = 'auth.json';

export function ensureConfigDir(configDir: string = getConfigDir()): void {
  mkdirSync(configDir, { recursive: true });
}

export function readConfig<T>(filename: string, configDir: string = getConfigDir()): T | null {
  const filePath = join(configDir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

export function writeConfig(filename: string, data: unknown, configDir: string = getConfigDir()): void {
  ensureConfigDir(configDir);
  writeFileSync(join(configDir, filename), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function getAuthToken(configDir: string = getConfigDir()): AuthConfig | null {
  const raw = readConfig<AuthConfig>(AUTH_FILE, configDir);
  if (!raw) return null;
  // Legacy configs may contain mixed-case usernames (prior to the
  // normalize-on-write change). Always project to the canonical form so
  // callers — URL construction, display, server requests — stay consistent.
  if (raw.username && raw.username !== raw.username.toLowerCase()) {
    return { ...raw, username: normalizeUsername(raw.username) };
  }
  return raw;
}

export function deleteAuthToken(configDir: string = getConfigDir()): void {
  const filePath = join(configDir, AUTH_FILE);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

/**
 * Normalize a username to the canonical form used everywhere in the CLI:
 * lowercase, whitespace trimmed. Mirrors Phoenix's DB validation regex
 * `^[a-z0-9-]+$`. Guards against Phoenix responses or legacy configs that
 * contain mixed-case usernames (e.g. "Ben" -> "ben") so URL construction
 * and display are consistent.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function saveAuthToken(token: string, username: string, configDir: string = getConfigDir()): void {
  const config: AuthConfig = {
    token,
    username: normalizeUsername(username),
    savedAt: new Date().toISOString(),
  };
  writeConfig(AUTH_FILE, config, configDir);
}

export async function checkAuthStatus(
  apiBaseUrl: string,
  configDir: string = getConfigDir(),
  fetchFn: typeof fetch = fetch,
): Promise<{ authenticated: boolean; username?: string }> {
  const auth = getAuthToken(configDir);
  if (!auth) return { authenticated: false };

  const res = await fetchFn(`${apiBaseUrl}/api/auth/status`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  if (!res.ok) return { authenticated: false };

  const body = (await res.json()) as { username?: string };
  return {
    authenticated: true,
    username: body.username ? normalizeUsername(body.username) : body.username,
  };
}

export async function deviceAuthFlow(
  apiBaseUrl: string,
  configDir: string = getConfigDir(),
  options: {
    fetchFn?: typeof fetch;
    openBrowser?: (url: string) => Promise<void>;
    onUserCode?: (code: string, verificationUri: string) => void;
    pollIntervalMs?: number;
  } = {},
): Promise<AuthConfig> {
  const fetchFn = options.fetchFn ?? fetch;
  const pollInterval = options.pollIntervalMs ?? 5000;

  // Step 1: Request device code
  const codeRes = await fetchFn(`${apiBaseUrl}/api/device/code`, { method: 'POST' });
  if (!codeRes.ok) {
    throw new Error(`Failed to request device code: ${codeRes.status}`);
  }
  const codeData = (await codeRes.json()) as DeviceCodeResponse;

  // Step 2: Notify caller of user code and open browser
  if (options.onUserCode) {
    options.onUserCode(codeData.user_code, codeData.verification_uri);
  }
  if (options.openBrowser) {
    await options.openBrowser(codeData.verification_uri);
  }

  // Step 3: Poll for token
  const deadline = Date.now() + codeData.expires_in * 1000;
  const interval = Math.max((codeData.interval ?? 5) * 1000, pollInterval);

  while (Date.now() < deadline) {
    await sleep(interval);

    const tokenRes = await fetchFn(`${apiBaseUrl}/api/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: codeData.device_code }),
    });

    if (tokenRes.ok) {
      const tokenData = (await tokenRes.json()) as { access_token: string; username: string };
      saveAuthToken(tokenData.access_token, tokenData.username, configDir);
      return getAuthToken(configDir)!;
    }

    const errorBody = (await tokenRes.json()) as { error: string };

    if (errorBody.error === 'authorization_pending') {
      continue;
    }
    if (errorBody.error === 'slow_down') {
      // RFC 8628 §3.5: increase poll interval by 5 seconds on slow_down
      await sleep(5000);
      continue;
    }
    if (errorBody.error === 'expired_token') {
      throw new Error('Device authorization expired. Please try again.');
    }
    if (errorBody.error === 'access_denied') {
      throw new Error('Authorization was denied by the user.');
    }

    throw new Error(`Device auth failed: ${errorBody.error}`);
  }

  throw new Error('Device authorization timed out.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
