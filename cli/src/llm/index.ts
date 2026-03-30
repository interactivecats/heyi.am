import { AnthropicProvider } from './anthropic-provider.js';
import type { LLMProvider } from './types.js';
import { getAnthropicApiKey } from '../settings.js';

export type { LLMProvider } from './types.js';

/**
 * Returns the Anthropic LLM provider.
 * Requires ANTHROPIC_API_KEY (env var or saved in settings).
 */
export function getProvider(): LLMProvider {
  return new AnthropicProvider();
}

/**
 * Returns whether AI enhancement is available.
 */
export function hasApiKey(): boolean {
  return !!getAnthropicApiKey();
}
