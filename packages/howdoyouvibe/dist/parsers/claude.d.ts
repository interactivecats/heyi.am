import { type SessionParser, type RawEntry, type LocStats } from "./types.js";
export declare function computeLocStats(entries: RawEntry[]): LocStats;
export declare function mapAgentRole(subagentType: string): string;
export declare const claudeParser: SessionParser;
