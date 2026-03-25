export interface SessionSignals {
    correctionCount: number;
    avgUserExplanationLength: number;
    errorRetryCount: number;
    userToAiRatio: number;
    toolDiversity: number;
    multiDirScope: number;
    architecturalKeywords: number;
}
/**
 * Extract cheap signals from a session's raw JSONL file or parsed entries.
 * For file paths, streams the JSONL. For non-file paths (cursor://, etc.),
 * parses the session first to get entries, then extracts signals from those.
 */
export declare function extractSignals(sessionPath: string): Promise<SessionSignals>;
export interface SessionMetaWithStats {
    sessionId: string;
    path: string;
    title: string;
    duration: number;
    loc: number;
    turns: number;
    files: number;
    skills: string[];
    date: string;
}
export interface TriageResult {
    selected: Array<{
        sessionId: string;
        reason: string;
    }>;
    skipped: Array<{
        sessionId: string;
        reason: string;
    }>;
    triageMethod: 'llm' | 'scoring' | 'auto-select';
    autoSelected?: boolean;
}
export type TriageProgressEvent = {
    type: 'scanning';
    total: number;
} | {
    type: 'hard_floor';
    sessionId: string;
    title: string;
    passed: boolean;
    reason?: string;
} | {
    type: 'extracting_signals';
    sessionId: string;
    title: string;
} | {
    type: 'signals_done';
    sessionId: string;
    signals: SessionSignals;
} | {
    type: 'llm_ranking';
    sessionCount: number;
} | {
    type: 'scoring_fallback';
    sessionCount: number;
} | {
    type: 'done';
    selected: number;
    skipped: number;
};
export declare function triageSessions(sessions: SessionMetaWithStats[], useLLM?: boolean, onProgress?: (event: TriageProgressEvent) => void): Promise<TriageResult>;
