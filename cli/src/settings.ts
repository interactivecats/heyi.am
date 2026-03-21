import { readConfig, writeConfig } from './auth.js';

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
