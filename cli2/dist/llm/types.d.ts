import type { Session } from '../analyzer.js';
import type { EnhancementResult } from '../summarize.js';
export interface LLMProvider {
    name: 'local' | 'proxy';
    enhance(session: Session): Promise<EnhancementResult>;
}
export interface ProxyEnhanceResponse {
    result: EnhancementResult;
    usage: {
        remaining: number;
    };
}
export interface ProxyErrorResponse {
    error: {
        code: string;
        message: string;
        resets_at?: string;
    };
}
