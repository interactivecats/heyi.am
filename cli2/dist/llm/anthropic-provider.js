import Anthropic from '@anthropic-ai/sdk';
import { summarizeSession } from '../summarize.js';
import { getAnthropicApiKey } from '../settings.js';
/**
 * BYOK provider — calls Anthropic SDK directly using the user's local API key.
 * Reads from env var first, then falls back to ~/.config/heyiam/settings.json.
 */
export class AnthropicProvider {
    name = 'local';
    async enhance(session) {
        const apiKey = getAnthropicApiKey();
        const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
        return summarizeSession(session, { client });
    }
}
//# sourceMappingURL=anthropic-provider.js.map