import { AnthropicProvider } from './anthropic-provider.js';
import { ProxyProvider } from './proxy-provider.js';
import type { LLMProvider } from './types.js';
import { getAnthropicApiKey } from '../settings.js';

export type { LLMProvider } from './types.js';
export { ProxyError } from './proxy-provider.js';

/**
 * Returns the appropriate LLM provider based on environment.
 *
 * Resolution priority:
 * 1. If ANTHROPIC_API_KEY env var is set → AnthropicProvider (BYOK)
 * 2. If API key saved in ~/.config/heyiam/settings.json → AnthropicProvider (BYOK)
 * 3. Otherwise → ProxyProvider (server-side, requires auth)
 */
export function getProvider(): LLMProvider {
  if (getAnthropicApiKey()) {
    return new AnthropicProvider();
  }
  return new ProxyProvider();
}

/**
 * Returns the current enhancement mode for display purposes.
 */
export function getEnhanceMode(): 'local' | 'proxy' {
  return getAnthropicApiKey() ? 'local' : 'proxy';
}
