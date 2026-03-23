import type { VibeStats } from "./types.js";
export interface Archetype {
    id: string;
    name: string;
    tagline: string;
    conditions: Array<(stats: VibeStats) => boolean>;
    /** Stat keys implied by this primary — modifiers using these are excluded */
    impliedStats: string[];
    /** Score function: how strongly the user matches (higher = better) */
    score: (stats: VibeStats) => number;
}
export interface Modifier {
    id: string;
    phrase: string;
    condition: (stats: VibeStats) => boolean;
    /** Stat key this modifier is based on */
    statKey: string;
    /** How far above threshold (for ranking) */
    score: (stats: VibeStats) => number;
}
export interface ArchetypeMatch {
    primary: Archetype;
    modifier: Modifier | null;
    headline: string;
}
export declare const PRIMARY_ARCHETYPES: Archetype[];
export declare const FALLBACK_ARCHETYPE: Archetype;
export declare const MODIFIER_TRAITS: Modifier[];
export declare function matchArchetype(stats: VibeStats): ArchetypeMatch;
