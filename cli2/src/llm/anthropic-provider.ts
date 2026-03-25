import Anthropic from '@anthropic-ai/sdk';
import type { Session } from '../analyzer.js';
import type { EnhancementResult } from '../summarize.js';
import { summarizeSession } from '../summarize.js';
import type { LLMProvider } from './types.js';
import { getAnthropicApiKey } from '../settings.js';

/**
 * BYOK provider — calls Anthropic SDK directly using the user's local API key.
 * Reads from env var first, then falls back to ~/.config/heyiam/settings.json.
 */
export class AnthropicProvider implements LLMProvider {
  name = 'local' as const;

  async enhance(session: Session): Promise<EnhancementResult> {
    const apiKey = getAnthropicApiKey();
    const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
    return summarizeSession(session, { client });
  }
}
