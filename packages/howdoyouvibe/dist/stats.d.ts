import type { ParsedSession, VibeStats } from "./types.js";
export declare function computeVibeStats(sessions: ParsedSession[]): VibeStats;
export declare const _patterns: {
    EXPLETIVE_RE: RegExp;
    CORRECTION_START_RE: RegExp;
    CORRECTION_PHRASE_RE: RegExp;
    POLITE_RE: RegExp;
    REASONING_RE: RegExp;
    TEST_CMD_RE: RegExp;
    SCOPE_CREEP_RE: RegExp;
    APOLOGY_RE: RegExp;
    SECRET_LEAK_RE: RegExp;
    INTERRUPT_RE: RegExp;
    AI_ADMISSION_RE: RegExp;
};
