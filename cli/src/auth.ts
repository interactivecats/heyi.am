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

const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
const AUTH_FILE = 'auth.json';

export function ensureConfigDir(configDir: string = CONFIG_DIR): void {
  mkdirSync(configDir, { recursive: true });
}

export function readConfig<T>(filename: string, configDir: string = CONFIG_DIR): T | null {
  const filePath = join(configDir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

export function writeConfig(filename: string, data: unknown, configDir: string = CONFIG_DIR): void {
  ensureConfigDir(configDir);
  writeFileSync(join(configDir, filename), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function getAuthToken(configDir: string = CONFIG_DIR): AuthConfig | null {
  return readConfig<AuthConfig>(AUTH_FILE, configDir);
}

export function deleteAuthToken(configDir: string = CONFIG_DIR): void {
  const filePath = join(configDir, AUTH_FILE);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function saveAuthToken(token: string, username: string, configDir: string = CONFIG_DIR): void {
  const config: AuthConfig = { token, username, savedAt: new Date().toISOString() };
  writeConfig(AUTH_FILE, config, configDir);
}

export async function checkAuthStatus(
  apiBaseUrl: string,
  configDir: string = CONFIG_DIR,
  fetchFn: typeof fetch = fetch,
): Promise<{ authenticated: boolean; username?: string }> {
  const auth = getAuthToken(configDir);
  if (!auth) return { authenticated: false };

  const res = await fetchFn(`${apiBaseUrl}/api/auth/status`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  if (!res.ok) return { authenticated: false };

  const body = (await res.json()) as { username?: string };
  return { authenticated: true, username: body.username };
}

export async function deviceAuthFlow(
  apiBaseUrl: string,
  configDir: string = CONFIG_DIR,
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
      // Back off — handled by next iteration naturally since interval is constant
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
