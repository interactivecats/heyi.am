import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { readConfig, writeConfig } from './auth.js';
const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
const ENHANCED_DIR = 'enhanced';
const PROJECT_ENHANCE_DIR = 'project-enhance';
const SETTINGS_FILE = 'settings.json';
export function getSettings(configDir) {
    return readConfig(SETTINGS_FILE, configDir) ?? {};
}
export function saveAnthropicApiKey(apiKey, configDir) {
    const settings = getSettings(configDir);
    settings.anthropicApiKey = apiKey;
    writeConfig(SETTINGS_FILE, settings, configDir);
}
export function clearAnthropicApiKey(configDir) {
    const settings = getSettings(configDir);
    delete settings.anthropicApiKey;
    writeConfig(SETTINGS_FILE, settings, configDir);
}
/**
 * Returns the Anthropic API key from settings file or env var.
 * Env var takes precedence.
 */
export function getAnthropicApiKey(configDir) {
    return process.env.ANTHROPIC_API_KEY || getSettings(configDir).anthropicApiKey || undefined;
}
function enhancedDir(configDir = CONFIG_DIR) {
    return join(configDir, ENHANCED_DIR);
}
function enhancedPath(sessionId, configDir = CONFIG_DIR) {
    return join(enhancedDir(configDir), `${sessionId}.json`);
}
export function saveEnhancedData(sessionId, data, configDir) {
    const dir = enhancedDir(configDir);
    mkdirSync(dir, { recursive: true });
    const full = {
        ...data,
        enhancedAt: new Date().toISOString(),
        quickEnhanced: data.quickEnhanced ?? false,
    };
    writeFileSync(enhancedPath(sessionId, configDir), JSON.stringify(full, null, 2), { mode: 0o600 });
}
export function loadEnhancedData(sessionId, configDir) {
    const path = enhancedPath(sessionId, configDir);
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function markAsUploaded(sessionId, configDir) {
    const data = loadEnhancedData(sessionId, configDir);
    if (!data)
        return;
    data.uploaded = true;
    const dir = enhancedDir(configDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(enhancedPath(sessionId, configDir), JSON.stringify(data, null, 2), { mode: 0o600 });
}
export function deleteEnhancedData(sessionId, configDir) {
    const path = enhancedPath(sessionId, configDir);
    if (existsSync(path))
        unlinkSync(path);
}
/**
 * Build a fingerprint from the selected session IDs and their enhanced timestamps.
 * Changes to session selection or re-enhancement of any session invalidates the cache.
 */
export function buildProjectFingerprint(selectedSessionIds, configDir) {
    const sorted = [...selectedSessionIds].sort();
    const parts = sorted.map((id) => {
        const enhanced = loadEnhancedData(id, configDir);
        return `${id}:${enhanced?.enhancedAt ?? 'none'}`;
    });
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}
function projectEnhanceDir(configDir = CONFIG_DIR) {
    return join(configDir, PROJECT_ENHANCE_DIR);
}
function projectEnhancePath(projectDirName, configDir = CONFIG_DIR) {
    // Sanitize project dir name for filesystem
    const safe = projectDirName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(projectEnhanceDir(configDir), `${safe}.json`);
}
export function saveProjectEnhanceResult(projectDirName, selectedSessionIds, result, configDir) {
    const dir = projectEnhanceDir(configDir);
    mkdirSync(dir, { recursive: true });
    const fingerprint = buildProjectFingerprint(selectedSessionIds, configDir);
    const cache = {
        fingerprint,
        enhancedAt: new Date().toISOString(),
        selectedSessionIds: [...selectedSessionIds].sort(),
        result,
    };
    writeFileSync(projectEnhancePath(projectDirName, configDir), JSON.stringify(cache, null, 2), { mode: 0o600 });
}
export function loadProjectEnhanceResult(projectDirName, configDir) {
    const path = projectEnhancePath(projectDirName, configDir);
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return null;
    }
}
/**
 * Check if cached project enhance result is still fresh.
 * Returns the cached result if fingerprint matches, null if stale or missing.
 */
export function loadFreshProjectEnhanceResult(projectDirName, selectedSessionIds, configDir) {
    const cached = loadProjectEnhanceResult(projectDirName, configDir);
    if (!cached)
        return null;
    const currentFingerprint = buildProjectFingerprint(selectedSessionIds, configDir);
    if (cached.fingerprint !== currentFingerprint)
        return null;
    return cached;
}
export function deleteProjectEnhanceResult(projectDirName, configDir) {
    const path = projectEnhancePath(projectDirName, configDir);
    if (existsSync(path))
        unlinkSync(path);
}
const PUBLISHED_DIR = 'published';
function publishedDir(configDir = CONFIG_DIR) {
    return join(configDir, PUBLISHED_DIR);
}
function publishedPath(projectDirName, configDir = CONFIG_DIR) {
    const safe = projectDirName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(publishedDir(configDir), `${safe}.json`);
}
export function savePublishedState(projectDirName, data, configDir) {
    const dir = publishedDir(configDir);
    mkdirSync(dir, { recursive: true });
    const full = {
        ...data,
        publishedAt: new Date().toISOString(),
    };
    writeFileSync(publishedPath(projectDirName, configDir), JSON.stringify(full, null, 2), { mode: 0o600 });
}
export function getPublishedState(projectDirName, configDir) {
    const path = publishedPath(projectDirName, configDir);
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=settings.js.map