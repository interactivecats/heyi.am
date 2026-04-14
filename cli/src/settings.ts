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
  /** Hex color (e.g. `#084471`) used as the portfolio accent. */
  accent?: string;
  /**
   * User-curated list of projects to include on the portfolio, in display
   * order. Projects whose `included` flag is `false` are filtered out at
   * render time. Empty array means "include everything in default order"
   * (preserves behavior for users who have never edited the list).
   */
  projectsOnPortfolio?: PortfolioProjectEntry[];
}

/** Per-project entry inside `PortfolioProfile.projectsOnPortfolio`. */
export interface PortfolioProjectEntry {
  /** Project directory name (matches `Project.dirName`). */
  projectId: string;
  /** Whether this project shows up in the rendered portfolio. */
  included: boolean;
  /** Display order, ascending. Normalized to 0..n-1 on save. */
  order: number;
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
  /**
   * Per-session transcript-include flags. Default is `true` (include).
   * When set to `false`, the publish flow omits the S3 uploads that carry
   * transcript data (raw, log, session-data) and strips transcript-derived
   * fields from the uploaded payload. Server never sees a
   * transcript_visible flag — this is entirely a publish-time CLI filter.
   */
  transcriptIncluded?: Record<string, boolean>;
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

// ── Per-session transcript visibility ────────────────────────

/**
 * Return whether the session transcript should be included at publish time.
 * Default is `true` — users must opt out explicitly.
 */
export function isTranscriptIncluded(sessionId: string, configDir?: string): boolean {
  const map = getSettings(configDir).transcriptIncluded ?? {};
  const flag = map[sessionId];
  return flag !== false;
}

/**
 * Set the include-transcript flag for a single session. Persisted to the
 * settings file alongside other user preferences.
 */
export function setTranscriptIncluded(sessionId: string, included: boolean, configDir?: string): void {
  const settings = getSettings(configDir);
  const map = { ...(settings.transcriptIncluded ?? {}) };
  if (included) {
    // Default is `true`, so a `true` value is the same as absent — keep
    // the map clean by deleting rather than writing redundant entries.
    delete map[sessionId];
  } else {
    map[sessionId] = false;
  }
  settings.transcriptIncluded = map;
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

/**
 * Remove the local uploaded-state record for a project. Used when the
 * remote copy is deleted from heyi.am — clears the "Uploaded" badge and
 * per-session `uploaded: true` flags so the UI reflects reality without
 * requiring a new publish round-trip.
 */
export function clearUploadedState(projectDirName: string, configDir?: string): void {
  const path = uploadedPath(projectDirName, configDir);
  if (existsSync(path)) unlinkSync(path);
}

// ── Portfolio publish state ─────────────────────────────────
//
// Tracks the last-published snapshot of the user's portfolio per target
// (`heyi.am` and `github`). Used by the UI to detect drift between the
// current local profile and what was last published, without re-running
// the renderer.

export type PortfolioTargetVisibility = 'public' | 'unlisted';

export interface PortfolioPublishTarget {
  /** ISO timestamp of the last successful publish to this target. */
  lastPublishedAt: string;
  /** Stable hash of the profile snapshot that was published. */
  lastPublishedProfileHash: string;
  /** Full profile snapshot at publish time — used for field-level diffs. */
  lastPublishedProfile: PortfolioProfile;
  /**
   * Arbitrary per-target config. Known shapes:
   *   - heyi.am: `{}` (visibility lives on the parent target)
   *   - github:  `{ owner: string; repo: string; branch: string }`
   */
  config: Record<string, unknown>;
  /**
   * Per-target visibility. `public` is discoverable at heyi.am/:username;
   * `unlisted` is reachable by URL but not indexed. Defaults to `public`.
   */
  visibility?: PortfolioTargetVisibility;
  /** Public URL of the last published portfolio, if known. */
  url?: string;
  /** Last error message from a failed publish attempt, cleared on success. */
  lastError?: string;
  /** ISO timestamp of the last failed publish attempt. */
  lastErrorAt?: string;
}

export interface PortfolioPublishState {
  targets: Record<string, PortfolioPublishTarget>;
}

const PORTFOLIO_PUBLISH_FILE = 'portfolio-publish.json';
const DEFAULT_PORTFOLIO_TARGET = 'heyi.am';

function portfolioPublishPath(configDir: string = getDataDir()): string {
  return join(configDir, PORTFOLIO_PUBLISH_FILE);
}

/**
 * Compute a stable hash of a portfolio profile snapshot. Keys are sorted
 * recursively so logically-equal profiles always produce the same hash.
 * Used for draft detection — no cryptographic guarantees required.
 */
export function hashPortfolioProfile(profile: PortfolioProfile): string {
  const canonical = canonicalStringify(profile);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}

export function getPortfolioPublishState(configDir?: string): PortfolioPublishState {
  const path = portfolioPublishPath(configDir);
  if (!existsSync(path)) return { targets: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as PortfolioPublishState;
    return parsed && typeof parsed === 'object' && parsed.targets ? parsed : { targets: {} };
  } catch {
    return { targets: {} };
  }
}

export function savePortfolioPublishState(state: PortfolioPublishState, configDir?: string): void {
  const dir = configDir ?? getDataDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(portfolioPublishPath(configDir), JSON.stringify(state, null, 2), { mode: 0o600 });
}

/** Update (or create) a single target entry in the publish state. */
export function updatePortfolioPublishTarget(
  target: string,
  patch: Partial<PortfolioPublishTarget>,
  configDir?: string,
): PortfolioPublishState {
  const state = getPortfolioPublishState(configDir);
  const existing = state.targets[target];
  const base: PortfolioPublishTarget = existing ?? {
    lastPublishedAt: '',
    lastPublishedProfileHash: '',
    lastPublishedProfile: {},
    config: {},
    visibility: target === DEFAULT_PORTFOLIO_TARGET ? 'public' : undefined,
  };
  state.targets[target] = { ...base, ...patch };
  savePortfolioPublishState(state, configDir);
  return state;
}

export { DEFAULT_PORTFOLIO_TARGET };
