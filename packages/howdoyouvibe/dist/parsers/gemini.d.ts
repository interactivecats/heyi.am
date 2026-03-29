import { type SessionParser } from "./types.js";
export interface GeminiSessionFile {
    path: string;
    sessionId: string;
    projectHash: string;
    projectDir?: string;
}
export declare const geminiParser: SessionParser;
export declare function hashProjectDir(dir: string): string;
export declare function discoverGeminiSessions(): Promise<GeminiSessionFile[]>;
export declare function resolveProjectDirs(sessions: GeminiSessionFile[], knownDirs: string[]): GeminiSessionFile[];
