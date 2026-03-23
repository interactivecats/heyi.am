import type { VibeStats } from "./types.js";
import type { ArchetypeMatch } from "./archetypes.js";
export declare function renderCard(stats: VibeStats, match: ArchetypeMatch, narrative: string | null): void;
/**
 * Format a compact shareable text block (5 lines for Discord/Slack).
 * Picks the 3 most interesting non-zero stats.
 */
export declare function formatTextBlock(stats: VibeStats, match: ArchetypeMatch, narrative: string | null): string;
export declare function copyToClipboard(text: string): boolean;
export declare function promptYesNo(question: string): Promise<boolean>;
