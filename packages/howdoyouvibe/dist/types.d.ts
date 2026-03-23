import type { SessionAnalysis, SessionSource } from "./parsers/types.js";
/** A parsed session ready for stat computation */
export interface ParsedSession {
    analysis: SessionAnalysis;
    source: SessionSource;
}
/** All computed vibe stats */
export interface VibeStats {
    expletives: number;
    corrections: number;
    please_rate: number;
    avg_prompt_words: number;
    longest_prompt_words: number;
    question_rate: number;
    one_word_turn_rate: number;
    reasoning_rate: number;
    late_night_rate: number;
    weekend_rate: number;
    apologies: number;
    read_write_ratio: number;
    test_runs: number;
    failed_tests: number;
    longest_tool_chain: number;
    self_corrections: number;
    bash_commands: number;
    override_success_rate: number;
    longest_autopilot: number;
    first_blood_min: number;
    redirects_per_hour: number;
    turn_density: number;
    scope_creep: number;
    interruptions: number;
    secret_leaks: number;
    total_turns: number;
    session_count: number;
    total_duration_min: number;
    sources: SessionSource[];
    source_breakdown: Record<string, number>;
}
