import { type SessionParser, type RawEntry, type LocStats } from "./types.js";
export declare function computeLocStats(entries: RawEntry[]): LocStats;
/**
 * Map subagent_type values from Agent tool calls to display roles.
 * Teamrc agent names like "trc-frontend-dev" get the prefix stripped.
 * Built-in types like "Explore" or "Plan" are lowercased.
 */
export declare function mapAgentRole(subagentType: string): string;
/**
 * Extract agent roles from parent's Agent tool calls.
 * Returns a map of tool_use id → agentRole for matching with child sessions.
 */
export declare function extractAgentRoles(entries: RawEntry[]): Map<string, string>;
/**
 * Extract the agentId from a child session's first entry (fallback role detection).
 */
export declare function extractAgentIdFromEntries(entries: RawEntry[]): string | undefined;
export declare const claudeParser: SessionParser;
