import type { LLMProvider } from './types.js';
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
export declare function getProvider(): LLMProvider;
/**
 * Returns the current enhancement mode for display purposes.
 */
export declare function getEnhanceMode(): 'local' | 'proxy';
