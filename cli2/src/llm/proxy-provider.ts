import type { Session } from '../analyzer.js';
import type { EnhancementResult } from '../summarize.js';
import { getAuthToken } from '../auth.js';
import { API_URL } from '../config.js';
import type { LLMProvider, ProxyEnhanceResponse, ProxyErrorResponse } from './types.js';

/**
 * Proxy provider — sends session data to Phoenix backend for server-side enhancement.
 * Used when user has no local ANTHROPIC_API_KEY but is authenticated.
 */
export class ProxyProvider implements LLMProvider {
  name = 'proxy' as const;

  async enhance(session: Session): Promise<EnhancementResult> {
    const auth = getAuthToken();
    if (!auth?.token) {
      throw new ProxyError('AUTH_EXPIRED', 'Not authenticated. Run: heyiam login');
    }

    const response = await fetch(`${API_URL}/api/enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ session: sessionToPayload(session) }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        error: { code: 'PROXY_UNREACHABLE', message: 'Could not reach enhancement server' },
      })) as ProxyErrorResponse;

      throw new ProxyError(
        errorBody.error?.code ?? 'PROXY_ERROR',
        errorBody.error?.message ?? 'Enhancement failed',
        errorBody.error?.resets_at,
      );
    }

    const data = await response.json() as ProxyEnhanceResponse;
    return data.result;
  }
}

export class ProxyError extends Error {
  code: string;
  resetsAt?: string;

  constructor(code: string, message: string, resetsAt?: string) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.resetsAt = resetsAt;
  }
}

/**
 * Extracts the session fields that Phoenix expects for enhancement.
 */
function sessionToPayload(session: Session): Record<string, unknown> {
  return {
    title: session.title,
    projectName: session.projectName,
    durationMinutes: session.durationMinutes,
    turns: session.turns,
    linesOfCode: session.linesOfCode,
    skills: session.skills,
    toolBreakdown: session.toolBreakdown,
    filesChanged: session.filesChanged,
    executionPath: session.executionPath,
    turnTimeline: session.turnTimeline,
    rawLog: session.rawLog,
  };
}
