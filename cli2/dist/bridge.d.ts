import type { SessionAnalysis as ParserOutput } from "./parsers/types.js";
import type { SessionAnalysis as AnalyzerInput, Session } from "./analyzer.js";
import { type SessionMeta } from "./parsers/index.js";
export interface BridgeOptions {
    sessionId: string;
    projectName: string;
    agentRole?: string;
    parentSessionId?: string;
}
export declare function bridgeToAnalyzer(parsed: ParserOutput, opts: BridgeOptions): AnalyzerInput;
/**
 * Strip AI-internal XML tags from assistant text content.
 * These tags are harness/model internals that shouldn't appear in user-facing output.
 * Returns cleaned text, or empty string if nothing remains.
 */
export declare function cleanAssistantText(text: string): string;
/**
 * Canonical dedup key for child agents. Buckets by role and 30-second
 * time window so worktree clones collapse into one entry.
 *
 * NOTE: server.ts ~line 1057 has a similar dedup pattern but uses
 * `c.agentRole ?? c.sessionId` for the key while storing `c.agentRole ?? 'agent'`
 * for display — this inconsistency means two children without agentRole get
 * separate keys (different UUIDs) but identical display roles ('agent').
 * Use this helper in both places to keep behavior consistent.
 */
export declare function childDedupeKey(agentRole: string | undefined, startTime: string): string;
/**
 * Deduplicate worktree clones: agents with same role and start time within
 * 30 seconds are considered duplicates. Keep the one with more turns.
 */
export declare function deduplicateChildren(children: Session[]): Session[];
/** Parse, bridge, and analyze each child session. Attaches results to parent. */
export declare function bridgeChildSessions(parentMeta: SessionMeta, projectName: string): Promise<Session[]>;
/** Canonical type for child/agent data — used everywhere. */
export interface AgentChild {
    sessionId: string;
    role: string;
    durationMinutes: number;
    linesOfCode: number;
    date?: string;
}
/** @deprecated Use AgentChild instead */
export type ChildSessionSummary = AgentChild;
/** Convert a fully-parsed Session into the canonical AgentChild shape. */
export declare function toAgentChild(session: Session): AgentChild;
/** Compute aggregated stats from fully-parsed child sessions. */
export declare function aggregateChildStats(children: Session[]): {
    totalLoc: number;
    totalDurationMinutes: number;
    agentCount: number;
};
