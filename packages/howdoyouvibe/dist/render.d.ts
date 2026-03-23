import type { VibeStats } from "./types.js";
import type { ArchetypeMatch } from "./archetypes.js";
export declare function renderCard(stats: VibeStats, match: ArchetypeMatch, narrative: string | null): void;
/**
 * Format the full card as a copyable text block for Discord/Slack.
 * Mirrors the terminal output exactly so what you see is what you share.
 */
export declare function formatTextBlock(stats: VibeStats, match: ArchetypeMatch, narrative: string | null): string;
export declare function copyToClipboard(text: string): boolean;
export declare function promptYesNo(question: string): Promise<boolean>;
