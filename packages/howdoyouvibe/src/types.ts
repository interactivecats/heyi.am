import type { SessionAnalysis, SessionSource } from "./parsers/types.js";

/** A parsed session ready for stat computation */
export interface ParsedSession {
  analysis: SessionAnalysis;
  source: SessionSource;
}

/** All computed vibe stats */
export interface VibeStats {
  // Your Voice (user messages)
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

  // The AI's Habits (assistant messages + tool calls)
  apologies: number;
  read_write_ratio: number;
  test_runs: number;
  failed_tests: number;
  longest_tool_chain: number;
  self_corrections: number;
  bash_commands: number;

  // The Back-and-forth (interaction patterns)
  override_success_rate: number;
  longest_autopilot: number;
  first_blood_min: number;
  redirects_per_hour: number;
  turn_density: number;
  scope_creep: number;
  interruptions: number;       // times user hit Escape / cancelled AI mid-response
  secret_leaks_user: number;   // secrets YOU pasted into prompts or got back in tool results
  secret_leaks_ai: number;     // secrets the AI wrote into code or echoed back
  plan_mode_uses: number;      // times EnterPlanMode was called
  agent_spawns: number;        // times Agent tool was called (multi-agent orchestration)
  avg_daily_hours: number;     // average coding hours per active day

  // Metadata
  total_turns: number;
  session_count: number;
  total_duration_min: number;
  sources: SessionSource[];
  source_breakdown: Record<string, number>; // e.g. { claude: 150, cursor: 50, codex: 16 }
}
