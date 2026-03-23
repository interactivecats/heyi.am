import type { RawEntry } from "./parsers/types.js";
export interface ParsedTurn {
    timestamp: string;
    type: "prompt" | "response" | "tool";
    content: string;
    toolName?: string;
    toolInput?: string;
}
/**
 * Strip AI-internal XML tags from assistant text content.
 */
export declare function cleanAssistantText(text: string): string;
/**
 * Convert raw entries into a flat list of turns for stat computation.
 * Simplified from cli/src/bridge.ts — no path redaction (vibe stats don't need it).
 */
export declare function entriesToTurns(entries: RawEntry[]): ParsedTurn[];
