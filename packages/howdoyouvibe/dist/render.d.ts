import type { VibeStats } from "./types.js";
/** OSC 8 clickable hyperlink — falls back to plain text if NO_COLOR */
export declare function link(url: string, text?: string): string;
export declare function renderCard(stats: VibeStats, headline: string, narrative: string | null): void;
/**
 * Format the full card as a copyable text block for Discord/Slack.
 * Mirrors the terminal output exactly so what you see is what you share.
 */
/**
 * Format for messaging apps (WhatsApp, Slack, Discord, iMessage).
 * Vertical, compact, proportional-font friendly. No columns — they break on mobile.
 * Stats paired with · on each line for density without requiring monospace.
 */
export declare function formatTextBlock(stats: VibeStats, headline: string, narrative: string | null): string;
export declare function copyToClipboard(text: string): boolean;
export declare function promptYesNo(question: string): Promise<boolean>;
