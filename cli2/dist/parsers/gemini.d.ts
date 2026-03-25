import type { SessionParser, SessionAnalysis } from "./types.js";
interface GeminiLogEntry {
    sessionId: string;
    messageId: number;
    type: string;
    message: string;
    timestamp: string;
}
export interface GeminiSessionFile {
    path: string;
    sessionId: string;
    projectHash: string;
    projectDir?: string;
}
declare function extractFileRefsFromText(text: string): string[];
declare function parseGeminiLog(raw: string): GeminiLogEntry[];
declare function groupBySession(entries: GeminiLogEntry[]): Map<string, GeminiLogEntry[]>;
declare function analyzeSession(entries: GeminiLogEntry[]): SessionAnalysis;
export declare const geminiParser: SessionParser;
export declare function hashProjectDir(dir: string): string;
export declare function discoverGeminiSessions(): Promise<GeminiSessionFile[]>;
/**
 * Try to resolve a project hash to a directory by hashing candidate paths.
 * Pass known project directories (e.g., from Claude or Cursor) and this
 * will match them against Gemini's hashes.
 */
export declare function resolveProjectDirs(sessions: GeminiSessionFile[], knownDirs: string[]): GeminiSessionFile[];
export { parseGeminiLog, groupBySession, analyzeSession, extractFileRefsFromText };
