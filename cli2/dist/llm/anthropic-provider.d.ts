import type { Session } from '../analyzer.js';
import type { EnhancementResult } from '../summarize.js';
import type { LLMProvider } from './types.js';
/**
 * BYOK provider — calls Anthropic SDK directly using the user's local API key.
 * Reads from env var first, then falls back to ~/.config/heyiam/settings.json.
 */
export declare class AnthropicProvider implements LLMProvider {
    name: "local";
    enhance(session: Session): Promise<EnhancementResult>;
}
