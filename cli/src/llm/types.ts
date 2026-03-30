import type { Session } from '../analyzer.js';
import type { EnhancementResult } from '../summarize.js';

export interface LLMProvider {
  name: 'local';
  enhance(session: Session): Promise<EnhancementResult>;
}
