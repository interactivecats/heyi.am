import type { Session } from '../analyzer.js';
import type { EnhancementResult } from '../summarize.js';
import { summarizeSession } from '../summarize.js';
import type { LLMProvider } from './types.js';

/**
 * BYOK provider — calls Anthropic SDK directly using the user's local API key.
 */
export class AnthropicProvider implements LLMProvider {
  name = 'local' as const;

  async enhance(session: Session): Promise<EnhancementResult> {
    return summarizeSession(session);
  }
}
