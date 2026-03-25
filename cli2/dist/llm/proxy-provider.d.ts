import type { Session } from '../analyzer.js';
import type { EnhancementResult } from '../summarize.js';
import type { LLMProvider } from './types.js';
/**
 * Proxy provider — sends session data to Phoenix backend for server-side enhancement.
 * Used when user has no local ANTHROPIC_API_KEY but is authenticated.
 */
export declare class ProxyProvider implements LLMProvider {
    name: "proxy";
    enhance(session: Session): Promise<EnhancementResult>;
}
export declare class ProxyError extends Error {
    code: string;
    resetsAt?: string;
    constructor(code: string, message: string, resetsAt?: string);
}
