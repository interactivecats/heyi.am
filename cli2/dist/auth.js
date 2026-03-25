import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
const AUTH_FILE = 'auth.json';
export function ensureConfigDir(configDir = CONFIG_DIR) {
    mkdirSync(configDir, { recursive: true });
}
export function readConfig(filename, configDir = CONFIG_DIR) {
    const filePath = join(configDir, filename);
    if (!existsSync(filePath))
        return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
}
export function writeConfig(filename, data, configDir = CONFIG_DIR) {
    ensureConfigDir(configDir);
    writeFileSync(join(configDir, filename), JSON.stringify(data, null, 2), { mode: 0o600 });
}
export function getAuthToken(configDir = CONFIG_DIR) {
    return readConfig(AUTH_FILE, configDir);
}
export function deleteAuthToken(configDir = CONFIG_DIR) {
    const filePath = join(configDir, AUTH_FILE);
    if (existsSync(filePath)) {
        unlinkSync(filePath);
    }
}
export function saveAuthToken(token, username, configDir = CONFIG_DIR) {
    const config = { token, username, savedAt: new Date().toISOString() };
    writeConfig(AUTH_FILE, config, configDir);
}
export async function checkAuthStatus(apiBaseUrl, configDir = CONFIG_DIR, fetchFn = fetch) {
    const auth = getAuthToken(configDir);
    if (!auth)
        return { authenticated: false };
    const res = await fetchFn(`${apiBaseUrl}/api/auth/status`, {
        headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok)
        return { authenticated: false };
    const body = (await res.json());
    return { authenticated: true, username: body.username };
}
export async function deviceAuthFlow(apiBaseUrl, configDir = CONFIG_DIR, options = {}) {
    const fetchFn = options.fetchFn ?? fetch;
    const pollInterval = options.pollIntervalMs ?? 5000;
    // Step 1: Request device code
    const codeRes = await fetchFn(`${apiBaseUrl}/api/device/code`, { method: 'POST' });
    if (!codeRes.ok) {
        throw new Error(`Failed to request device code: ${codeRes.status}`);
    }
    const codeData = (await codeRes.json());
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
            const tokenData = (await tokenRes.json());
            saveAuthToken(tokenData.access_token, tokenData.username, configDir);
            return getAuthToken(configDir);
        }
        const errorBody = (await tokenRes.json());
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
export function buildPublishPayload(session, signature, publicKey) {
    return { session, signature, publicKey };
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=auth.js.map