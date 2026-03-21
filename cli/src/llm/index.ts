import { AnthropicProvider } from './anthropic-provider.js';
import { ProxyProvider } from './proxy-provider.js';
import type { LLMProvider } from './types.js';

export type { LLMProvider } from './types.js';
export { ProxyError } from './proxy-provider.js';

/**
 * Returns the appropriate LLM provider based on environment.
 *
 * Resolution priority (no toggle, no config):
 * 1. If ANTHROPIC_API_KEY is set → AnthropicProvider (BYOK, local calls)
 * 2. Otherwise → ProxyProvider (server-side, requires auth)
 */
export function getProvider(): LLMProvider {
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider();
  }
  return new ProxyProvider();
}

/**
 * Returns the current enhancement mode for display purposes.
 */
export function getEnhanceMode(): 'local' | 'proxy' {
  return process.env.ANTHROPIC_API_KEY ? 'local' : 'proxy';
}
