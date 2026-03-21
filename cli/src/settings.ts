import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readConfig, writeConfig } from './auth.js';

const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
const ENHANCED_DIR = 'enhanced';
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

export function deleteEnhancedData(sessionId: string, configDir?: string): void {
  const path = enhancedPath(sessionId, configDir);
  if (existsSync(path)) unlinkSync(path);
}
