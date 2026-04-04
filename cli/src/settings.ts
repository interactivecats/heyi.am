import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { readConfig, writeConfig } from './auth.js';

function getConfigDir(): string {
  return process.env.HEYIAM_CONFIG_DIR || join(homedir(), '.config', 'heyiam');
}

/** XDG data directory — DB, enhanced data, archives, screenshots, published state. */
export function getDataDir(): string {
  return process.env.HEYIAM_DATA_DIR || join(homedir(), '.local', 'share', 'heyiam');
}

const ENHANCED_DIR = 'enhanced';
const PROJECT_ENHANCE_DIR = 'project-enhance';
const SETTINGS_FILE = 'settings.json';

export interface PortfolioProfile {
  displayName?: string;
  bio?: string;
  /** Base64-encoded profile photo (data URI). */
  photoBase64?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  twitterHandle?: string;
  websiteUrl?: string;
  /** Base64-encoded resume PDF (data URI). */
  resumeBase64?: string;
  resumeFilename?: string;
}

export interface Settings {
  anthropicApiKey?: string;
  /** Auto-archive Claude sessions to prevent loss from 30-day cleanup. Default: true. */
  archiveSessions?: boolean;
  /** ISO timestamp when onboarding was completed or skipped. */
  onboardingCompletedAt?: string;
  /** Default template for rendering project/session pages. */
  defaultTemplate?: string;
  /** Portfolio profile data (bio, contact, social links). */
  portfolio?: PortfolioProfile;
}

const SESSIONS_DIR = 'sessions';

/** Directory where archived session hard links are stored. */
export function getArchiveDir(configDir: string = getDataDir()): string {
  return join(configDir, SESSIONS_DIR);
}

export function isArchiveEnabled(configDir?: string): boolean {
  return getSettings(configDir).archiveSessions !== false;
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

export function getDefaultTemplate(configDir?: string): string | undefined {
  return getSettings(configDir).defaultTemplate;
}

export function setDefaultTemplate(templateName: string, configDir?: string): void {
  const settings = getSettings(configDir);
  settings.defaultTemplate = templateName;
  writeConfig(SETTINGS_FILE, settings, configDir);
}

export function isOnboardingComplete(configDir?: string): boolean {
  return !!getSettings(configDir).onboardingCompletedAt;
}

export function completeOnboarding(configDir?: string): void {
  const settings = getSettings(configDir);
  settings.onboardingCompletedAt = new Date().toISOString();
  writeConfig(SETTINGS_FILE, settings, configDir);
}

export function resetOnboarding(configDir?: string): void {
  const settings = getSettings(configDir);
  delete settings.onboardingCompletedAt;
  writeConfig(SETTINGS_FILE, settings, configDir);
}

// ── Portfolio profile ────────────────────────────────────────

export function getPortfolioProfile(configDir?: string): PortfolioProfile {
  return getSettings(configDir).portfolio ?? {};
}

export function savePortfolioProfile(data: PortfolioProfile, configDir?: string): void {
  const settings = getSettings(configDir);
  settings.portfolio = data;
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

function enhancedDir(configDir: string = getDataDir()): string {
  return join(configDir, ENHANCED_DIR);
}

function enhancedPath(sessionId: string, configDir: string = getDataDir()): string {
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


export function deleteEnhancedData(sessionId: string, configDir?: string): void {
  const path = enhancedPath(sessionId, configDir);
  if (existsSync(path)) unlinkSync(path);
}

// ── Project enhance cache ─────────────────────────────────────

export interface ProjectEnhanceCache {
  fingerprint: string;
  enhancedAt: string;
  selectedSessionIds: string[];
  title?: string;
  repoUrl?: string;
  projectUrl?: string;
  screenshotBase64?: string;
  /** Template override for this project (uses user default if not set). */
  template?: string;
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

function projectEnhanceDir(configDir: string = getDataDir()): string {
  return join(configDir, PROJECT_ENHANCE_DIR);
}

function projectEnhancePath(projectDirName: string, configDir: string = getDataDir()): string {
  // Sanitize project dir name for filesystem
  const safe = projectDirName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(projectEnhanceDir(configDir), `${safe}.json`);
}

export function saveProjectEnhanceResult(
  projectDirName: string,
  selectedSessionIds: string[],
  result: ProjectEnhanceCache['result'],
  configDir?: string,
  extras?: { title?: string; repoUrl?: string; projectUrl?: string; screenshotBase64?: string },
): void {
  const dir = projectEnhanceDir(configDir);
  mkdirSync(dir, { recursive: true });
  const fingerprint = buildProjectFingerprint(selectedSessionIds, configDir);
  const cache: ProjectEnhanceCache = {
    fingerprint,
    enhancedAt: new Date().toISOString(),
    selectedSessionIds: [...selectedSessionIds].sort(),
    ...(extras?.title ? { title: extras.title } : {}),
    ...(extras?.repoUrl ? { repoUrl: extras.repoUrl } : {}),
    ...(extras?.projectUrl ? { projectUrl: extras.projectUrl } : {}),
    ...(extras?.screenshotBase64 ? { screenshotBase64: extras.screenshotBase64 } : {}),
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

// ── Uploaded state persistence ──────────────────────────────

export interface UploadedState {
  slug: string;
  projectId: number;
  uploadedAt: string;
  uploadedSessions: string[];
}

const UPLOADED_DIR = 'published';

function uploadedDir(configDir: string = getDataDir()): string {
  return join(configDir, UPLOADED_DIR);
}

function uploadedPath(projectDirName: string, configDir: string = getDataDir()): string {
  const safe = projectDirName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(uploadedDir(configDir), `${safe}.json`);
}

export function saveUploadedState(
  projectDirName: string,
  data: Omit<UploadedState, 'uploadedAt'>,
  configDir?: string,
): void {
  const dir = uploadedDir(configDir);
  mkdirSync(dir, { recursive: true });
  const full: UploadedState = {
    ...data,
    uploadedAt: new Date().toISOString(),
  };
  writeFileSync(uploadedPath(projectDirName, configDir), JSON.stringify(full, null, 2), { mode: 0o600 });
}

export function getUploadedState(projectDirName: string, configDir?: string): UploadedState | null {
  const path = uploadedPath(projectDirName, configDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as UploadedState;
  } catch {
    return null;
  }
}
