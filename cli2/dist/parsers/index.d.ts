import type { SessionAnalysis } from "./types.js";
export type { SessionAnalysis, SessionParser, SessionSource, ToolCall, LocStats, RawEntry } from "./types.js";
/** Detect which parser handles a given file and parse it */
export declare function parseSession(path: string): Promise<SessionAnalysis>;
export interface SessionMeta {
    path: string;
    source: string;
    sessionId: string;
    /** The top-level project directory name (e.g., "-Users-ben-Dev-myapp") */
    projectDir: string;
    /** Whether this is a subagent session */
    isSubagent: boolean;
    parentSessionId?: string;
    agentRole?: string;
    children?: SessionMeta[];
}
/**
 * Convert an absolute directory path to Claude Code's encoded format.
 * "/Users/ben/Dev/heyi-am" → "-Users-ben-Dev-heyi-am"
 *
 * This encoding is lossy: `-` in directory names is indistinguishable from
 * the `-` used as a separator (e.g. `/a/b-c` and `/a/b/c` both encode to
 * `-a-b-c`). We accept this trade-off because Claude Code uses the same
 * encoding for its own project directories (~/.claude/projects/-Users-...),
 * and we must match it so sessions from different tools (Claude, Cursor,
 * Codex, Gemini) group under the same project key. In practice, users are
 * unlikely to have two project directories whose paths differ only by `-`
 * vs `/`.
 */
export declare function encodeDirPath(absolutePath: string): string;
/**
 * Scan all supported tools for sessions and merge by project directory.
 * Claude Code, Cursor, Codex, and Gemini sessions for the same directory
 * are grouped under the same projectDir key.
 */
export declare function listSessions(basePath?: string): Promise<SessionMeta[]>;
/**
 * Merge sessions from subdirectory projects into their parent when file
 * evidence confirms they're part of the same codebase.
 *
 * Example: sessions from /Dev/heyi.am/cli (encoded: -Dev-heyi-am-cli)
 * that touch files like /Dev/heyi.am/lib/foo.ex prove they belong to the
 * parent project /Dev/heyi.am (encoded: -Dev-heyi-am).
 *
 * We sample 1-2 sessions from the candidate child, parse them, and check
 * whether files_touched reference paths outside the subdirectory. This
 * avoids false merges (e.g., /Dev should NOT absorb /Dev/heyi.am).
 */
export declare function mergeSubdirectoryProjects(sessions: SessionMeta[], realPaths: Map<string, string>, parseFn?: (path: string) => Promise<SessionAnalysis>): Promise<SessionMeta[]>;
