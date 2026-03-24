import type { VibeStats } from "./types.js";
import type { ArchetypeMatch } from "./archetypes.js";
interface ShareResponse {
    url: string;
    short_id: string;
    card_url: string;
    delete_url: string;
}
/**
 * POST computed vibe stats to the server. Returns share URLs on success.
 * Only computed stats leave the machine — never raw session text.
 */
export declare function shareVibe(stats: VibeStats, match: ArchetypeMatch, headline: string, narrative: string): Promise<ShareResponse | null>;
export {};
