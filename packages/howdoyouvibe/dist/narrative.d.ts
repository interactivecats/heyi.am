import type { VibeStats } from "./types.js";
import type { ArchetypeMatch } from "./archetypes.js";
export interface NarrativeResult {
    headline: string;
    narrative: string;
}
/**
 * Fetch a headline + 2-sentence narrative from the server (Gemini Flash).
 * Falls back to static archetype match and template if the server is unreachable.
 */
export declare function fetchNarrative(stats: VibeStats, match: ArchetypeMatch): Promise<NarrativeResult>;
/** Build a fully local result (no network). */
export declare function localResult(stats: VibeStats, match: ArchetypeMatch): NarrativeResult;
/**
 * Template fallback when server is unreachable.
 * Picks the 2 most extreme stats and stitches sentence fragments.
 */
export declare function templateNarrative(stats: VibeStats, match: ArchetypeMatch): string;
