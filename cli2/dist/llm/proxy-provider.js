import { getAuthToken } from '../auth.js';
import { API_URL } from '../config.js';
/**
 * Proxy provider — sends session data to Phoenix backend for server-side enhancement.
 * Used when user has no local ANTHROPIC_API_KEY but is authenticated.
 */
export class ProxyProvider {
    name = 'proxy';
    async enhance(session) {
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
            }));
            throw new ProxyError(errorBody.error?.code ?? 'PROXY_ERROR', errorBody.error?.message ?? 'Enhancement failed', errorBody.error?.resets_at);
        }
        const data = await response.json();
        return data.result;
    }
}
export class ProxyError extends Error {
    code;
    resetsAt;
    constructor(code, message, resetsAt) {
        super(message);
        this.name = 'ProxyError';
        this.code = code;
        this.resetsAt = resetsAt;
    }
}
/**
 * Extracts the session fields that Phoenix expects for enhancement.
 */
function sessionToPayload(session) {
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
//# sourceMappingURL=proxy-provider.js.map