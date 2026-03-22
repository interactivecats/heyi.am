import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { readConfig, writeConfig } from './auth.js';

const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
const ENHANCED_DIR = 'enhanced';
const PROJECT_ENHANCE_DIR = 'project-enhance';
const SETTINGS_FILE = 'settings.json';

export interface Settings {
  anthropicApiKey?: string;
}

export function getSettings(configDir?: string): Settings {
  return readConfig<Settings>(SETTINGS_FILE, configDir) ?? {};
}

export function saveAnthropicApiKey(apiKey: string, configDir?: string): void {
  const settings = getSettings(configDir);
  settings.anthropicApiKey = apiKey;
  writeConfig(SETTINGS_FILE, settings, configDir);
}

export function clearAnthropicApiKey(configDir?: string): void {
  const settings = getSettings(configDir);
  delete settings.anthropicApiKey;
  writeConfig(SETTINGS_FILE, settings, configDir);
}

/**
 * Returns the Anthropic API key from settings file or env var.
 * Env var takes precedence.
 */
export function getAnthropicApiKey(configDir?: string): string | undefined {
  return process.env.ANTHROPIC_API_KEY || getSettings(configDir).anthropicApiKey || undefined;
}

// ── Enhanced session persistence ─────────────────────────────

export interface EnhancedData {
  title: string;
  developerTake: string;
  context: string;
  skills: string[];
  questions: Array<{ text: string; suggestedAnswer: string }>;
  executionSteps: Array<{ stepNumber: number; title: string; body: string }>;
  qaPairs?: Array<{ question: string; answer: string }>;
  enhancedAt: string;
  /** True when enhanced via bulk mode with auto-accepted AI suggestions. */
  quickEnhanced?: boolean;
  /** True when uploaded to heyi.am via publish or bulk upload. */
  uploaded?: boolean;
}

function enhancedDir(configDir: string = CONFIG_DIR): string {
  return join(configDir, ENHANCED_DIR);
}

function enhancedPath(sessionId: string, configDir: string = CONFIG_DIR): string {
  return join(enhancedDir(configDir), `${sessionId}.json`);
}

export function saveEnhancedData(
  sessionId: string,
  data: Omit<EnhancedData, 'enhancedAt' | 'quickEnhanced'> & { quickEnhanced?: boolean },
  configDir?: string,
): void {
  const dir = enhancedDir(configDir);
  mkdirSync(dir, { recursive: true });
  const full: EnhancedData = {
    ...data,
    enhancedAt: new Date().toISOString(),
    quickEnhanced: data.quickEnhanced ?? false,
  };
  writeFileSync(enhancedPath(sessionId, configDir), JSON.stringify(full, null, 2), { mode: 0o600 });
}

export function loadEnhancedData(sessionId: string, configDir?: string): EnhancedData | null {
  const path = enhancedPath(sessionId, configDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as EnhancedData;
  } catch {
    return null;
  }
}

export function markAsUploaded(sessionId: string, configDir?: string): void {
  const data = loadEnhancedData(sessionId, configDir);
  if (!data) return;
  data.uploaded = true;
  const dir = enhancedDir(configDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(enhancedPath(sessionId, configDir), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function deleteEnhancedData(sessionId: string, configDir?: string): void {
  const path = enhancedPath(sessionId, configDir);
  if (existsSync(path)) unlinkSync(path);
}

// ── Project enhance cache ─────────────────────────────────────

export interface ProjectEnhanceCache {
  fingerprint: string;
  enhancedAt: string;
  selectedSessionIds: string[];
  result: {
    narrative: string;
    arc: Array<{ phase: number; title: string; description: string }>;
    skills: string[];
    timeline: Array<{
      period: string;
      label: string;
      sessions: Array<{
        sessionId: string;
        title: string;
        featured: boolean;
        tag?: string;
      }>;
    }>;
    questions: Array<{
      id: string;
      category: 'pattern' | 'architecture' | 'evolution';
      question: string;
      context: string;
    }>;
  };
}

/**
 * Build a fingerprint from the selected session IDs and their enhanced timestamps.
 * Changes to session selection or re-enhancement of any session invalidates the cache.
 */
export function buildProjectFingerprint(
  selectedSessionIds: string[],
  configDir?: string,
): string {
  const sorted = [...selectedSessionIds].sort();
  const parts = sorted.map((id) => {
    const enhanced = loadEnhancedData(id, configDir);
    return `${id}:${enhanced?.enhancedAt ?? 'none'}`;
  });
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function projectEnhanceDir(configDir: string = CONFIG_DIR): string {
  return join(configDir, PROJECT_ENHANCE_DIR);
}

function projectEnhancePath(projectDirName: string, configDir: string = CONFIG_DIR): string {
  // Sanitize project dir name for filesystem
  const safe = projectDirName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(projectEnhanceDir(configDir), `${safe}.json`);
}

export function saveProjectEnhanceResult(
  projectDirName: string,
  selectedSessionIds: string[],
  result: ProjectEnhanceCache['result'],
  configDir?: string,
): void {
  const dir = projectEnhanceDir(configDir);
  mkdirSync(dir, { recursive: true });
  const fingerprint = buildProjectFingerprint(selectedSessionIds, configDir);
  const cache: ProjectEnhanceCache = {
    fingerprint,
    enhancedAt: new Date().toISOString(),
    selectedSessionIds: [...selectedSessionIds].sort(),
    result,
  };
  writeFileSync(projectEnhancePath(projectDirName, configDir), JSON.stringify(cache, null, 2), { mode: 0o600 });
}

export function loadProjectEnhanceResult(
  projectDirName: string,
  configDir?: string,
): ProjectEnhanceCache | null {
  const path = projectEnhancePath(projectDirName, configDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ProjectEnhanceCache;
  } catch {
    return null;
  }
}

/**
 * Check if cached project enhance result is still fresh.
 * Returns the cached result if fingerprint matches, null if stale or missing.
 */
export function loadFreshProjectEnhanceResult(
  projectDirName: string,
  selectedSessionIds: string[],
  configDir?: string,
): ProjectEnhanceCache | null {
  const cached = loadProjectEnhanceResult(projectDirName, configDir);
  if (!cached) return null;
  const currentFingerprint = buildProjectFingerprint(selectedSessionIds, configDir);
  if (cached.fingerprint !== currentFingerprint) return null;
  return cached;
}

export function deleteProjectEnhanceResult(projectDirName: string, configDir?: string): void {
  const path = projectEnhancePath(projectDirName, configDir);
  if (existsSync(path)) unlinkSync(path);
}

// ── Published state persistence ──────────────────────────────

export interface PublishedState {
  slug: string;
  projectId: number;
  publishedAt: string;
  publishedSessions: string[];
}

const PUBLISHED_DIR = 'published';

function publishedDir(configDir: string = CONFIG_DIR): string {
  return join(configDir, PUBLISHED_DIR);
}

function publishedPath(projectDirName: string, configDir: string = CONFIG_DIR): string {
  const safe = projectDirName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(publishedDir(configDir), `${safe}.json`);
}

export function savePublishedState(
  projectDirName: string,
  data: Omit<PublishedState, 'publishedAt'>,
  configDir?: string,
): void {
  const dir = publishedDir(configDir);
  mkdirSync(dir, { recursive: true });
  const full: PublishedState = {
    ...data,
    publishedAt: new Date().toISOString(),
  };
  writeFileSync(publishedPath(projectDirName, configDir), JSON.stringify(full, null, 2), { mode: 0o600 });
}

export function getPublishedState(projectDirName: string, configDir?: string): PublishedState | null {
  const path = publishedPath(projectDirName, configDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PublishedState;
  } catch {
    return null;
  }
}
