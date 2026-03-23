import type { VibeStats } from "./types.js";
import type { ArchetypeMatch } from "./archetypes.js";
/**
 * Fetch a 2-sentence narrative from the server (Gemini Flash).
 * Falls back to a simple template if the server is unreachable.
 */
export declare function fetchNarrative(stats: VibeStats, match: ArchetypeMatch): Promise<string>;
/**
 * Simple template fallback when server is unreachable.
 */
export declare function templateNarrative(stats: VibeStats, match: ArchetypeMatch): string;
