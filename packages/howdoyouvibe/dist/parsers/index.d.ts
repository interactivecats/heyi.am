import type { SessionAnalysis } from "./types.js";
export type { SessionAnalysis, SessionParser, SessionSource, ToolCall, LocStats, RawEntry } from "./types.js";
/** Detect which parser handles a given file and parse it */
export declare function parseSession(path: string): Promise<SessionAnalysis>;
export interface SessionMeta {
    path: string;
    source: string;
    sessionId: string;
    projectDir: string;
    isSubagent: boolean;
    parentSessionId?: string;
    agentRole?: string;
    children?: SessionMeta[];
}
export declare function encodeDirPath(absolutePath: string): string;
/**
 * Scan all supported tools for sessions.
 * Simplified version for howdoyouvibe — no subdirectory merging.
 */
export declare function listSessions(): Promise<SessionMeta[]>;
