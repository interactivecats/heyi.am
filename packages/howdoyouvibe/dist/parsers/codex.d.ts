import type { SessionParser } from "./types.js";
export declare const codexParser: SessionParser;
export interface CodexSessionFile {
    path: string;
    sessionId: string;
    cwd: string;
}
export declare function discoverCodexSessions(): Promise<CodexSessionFile[]>;
