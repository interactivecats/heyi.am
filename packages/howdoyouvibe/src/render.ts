import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import type { VibeStats } from "./types.js";
import type { ArchetypeMatch } from "./archetypes.js";
import { SOURCE_DISPLAY_NAMES, type SessionSource } from "./parsers/types.js";

// ─── Terminal card rendering ─────────────────────────────────────────────

const LINE = "────────────────────────────────────────";
const INDENT = "  ";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatSources(sources: SessionSource[]): string {
  return sources.map((s) => SOURCE_DISPLAY_NAMES[s] ?? s).join(", ");
}

/** Pad a stat label:value to a fixed column width for two-column layout */
function statCol(label: string, value: string | number, width = 28): string {
  const text = `${label}: ${value}`;
  return text.padEnd(width);
}

/** Check if a stat value is "boring" — zero, or too uninteresting to show */
function isZero(v: number): boolean {
  return v === 0;
}

/** Format large numbers with commas */
function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString() : String(n);
}

/** Add a "wow" comment for extreme stat values */
function wow(label: string, value: number, thresholds: [number, string][]): string {
  for (const [t, comment] of thresholds) {
    if (value >= t) return ` ${comment}`;
  }
  return "";
}

const LOGO = [
  " _                       _                        _  _          ",
  "| |_  ___ __ __ __ _  __| |___  _  _ ___ _  ___ _(_)| |__  ___ ",
  "| ' \\/ _ \\\\ V  V // _` / _ / _ \\| || / _ \\ || \\ V / || '_ \\/ -_)",
  "|_||_\\___/ \\_/\\_/ \\__,_\\___\\___/ \\_, \\___/\\_,_|\\_/|_||_.__/\\___|",
  "                                 |__/                            ",
];

export function renderCard(
  stats: VibeStats,
  match: ArchetypeMatch,
  narrative: string | null,
): void {
  const lines: string[] = [];

  lines.push("");
  for (const row of LOGO) {
    lines.push(`${INDENT}${row}`);
  }
  lines.push(`${INDENT}${LINE}`);
  lines.push("");
  lines.push(`${INDENT}${match.headline}`);

  if (narrative) {
    lines.push("");
    // Word-wrap narrative to ~56 chars
    for (const wrapped of wordWrap(narrative, 56)) {
      lines.push(`${INDENT}${wrapped}`);
    }
  }

  lines.push("");
  lines.push(`${INDENT}${LINE}`);

  // ── Your Voice ──
  const voiceLines: string[] = [];
  if (!isZero(stats.expletives)) voiceLines.push(`    Expletives: ${fmt(stats.expletives)}`);
  if (!isZero(stats.corrections)) voiceLines.push(`    Corrections: ${fmt(stats.corrections)}`);
  if (stats.avg_prompt_words > 50) {
    voiceLines.push(`    Avg prompt: ${stats.avg_prompt_words} words${wow("prompt", stats.avg_prompt_words, [[150, "(essays)"], [100, "(verbose)"], [80, "(detailed)"]])}`);
  }
  if (stats.please_rate > 0.1) voiceLines.push(`    Please rate: ${pct(stats.please_rate)}`);
  else if (stats.please_rate < 0.02 && stats.total_turns > 100) voiceLines.push(`    Please rate: ${pct(stats.please_rate)} (all business)`);
  if (stats.question_rate > 0.1) voiceLines.push(`    Questions: ${pct(stats.question_rate)}`);
  if (stats.late_night_rate > 0.1) voiceLines.push(`    Late night: ${pct(stats.late_night_rate)}`);
  if (stats.reasoning_rate > 0.05) voiceLines.push(`    Thinks out loud: ${pct(stats.reasoning_rate)} of turns`);
  if (stats.secret_leaks_user > 0) voiceLines.push(`    Secrets you leaked: ${stats.secret_leaks_user}${stats.secret_leaks_user > 3 ? " (yikes)" : ""}`);
  if (stats.secret_leaks_ai > 0) voiceLines.push(`    Secrets AI leaked: ${stats.secret_leaks_ai}${stats.secret_leaks_ai > 5 ? " (rotate your keys)" : ""}`);

  if (voiceLines.length > 0) {
    lines.push("");
    lines.push(`${INDENT}Your Voice`);
    lines.push(...voiceLines);
  }

  // ── The AI's Habits ──
  const aiLines: string[] = [];
  if (!isZero(stats.read_write_ratio)) {
    aiLines.push(`    Read:write: ${stats.read_write_ratio}:1${wow("rw", stats.read_write_ratio, [[5, "(careful)"], [3, "(measured)"]])}`);
  }
  if (!isZero(stats.test_runs)) {
    const failPct = stats.failed_tests > 0 ? `, ${Math.round(stats.failed_tests / stats.test_runs * 100)}% failed` : "";
    aiLines.push(`    Test runs: ${fmt(stats.test_runs)}${failPct}${wow("tests", stats.test_runs, [[500, " (obsessive)"], [100, " (thorough)"]])}`);
  }
  if (stats.longest_tool_chain > 10) {
    aiLines.push(`    Longest burst: ${fmt(stats.longest_tool_chain)} tool calls${wow("chain", stats.longest_tool_chain, [[500, " (unreal)"], [100, " (deep)"], [50, " (committed)"]])}`);
  }
  if (stats.self_corrections > 10) {
    aiLines.push(`    Self-corrections: ${fmt(stats.self_corrections)}${wow("selfcor", stats.self_corrections, [[2000, " (the AI never stopped fixing itself)"], [500, " (the AI learned on the job)"], [100, " (it kept iterating)"]])}`);
  }
  if (stats.apologies > 3) aiLines.push(`    AI apologies: ${stats.apologies}`);

  if (aiLines.length > 0) {
    lines.push("");
    lines.push(`${INDENT}The AI's Habits`);
    lines.push(...aiLines);
  }

  // ── The Back-and-forth ──
  const interLines: string[] = [];
  if (!isZero(stats.override_success_rate) && stats.corrections > 0) {
    interLines.push(`    Override success: ${pct(stats.override_success_rate)} of ${fmt(stats.corrections)} corrections`);
  }
  if (stats.longest_autopilot > 5) {
    interLines.push(`    Longest leash: ${fmt(stats.longest_autopilot)} turns${wow("auto", stats.longest_autopilot, [[1000, " (that's a whole workday)"], [200, " (serious trust)"], [50, " (hands off)"]])}`);
  }
  if (stats.first_blood_min > 2) {
    interLines.push(`    First correction: ${stats.first_blood_min} min in${wow("fb", stats.first_blood_min, [[30, " (patient)"], [15, " (long leash)"]])}`);
  }
  if (stats.redirects_per_hour < 1 && stats.total_duration_min > 60) {
    interLines.push(`    Redirects/hr: ${stats.redirects_per_hour} (barely touches the wheel)`);
  } else if (stats.redirects_per_hour > 3) {
    interLines.push(`    Redirects/hr: ${stats.redirects_per_hour} (constant course-correcting)`);
  }
  if (stats.scope_creep > 2) interLines.push(`    Scope creep: ${stats.scope_creep} "while we're at it" moments`);
  if (stats.interruptions > 0) interLines.push(`    Interruptions: ${stats.interruptions}${stats.interruptions > 10 ? " (impatient)" : ""}`);

  if (interLines.length > 0) {
    lines.push("");
    lines.push(`${INDENT}The Back-and-forth`);
    lines.push(...interLines);
  }

  lines.push("");
  lines.push(`${INDENT}${LINE}`);

  // Tool breakdown with percentages
  if (stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0) {
    const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
    const parts = Object.entries(stats.source_breakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([src, count]) => {
        const name = SOURCE_DISPLAY_NAMES[src as SessionSource] ?? src;
        const p = Math.round((count / total) * 100);
        return `${name} ${p}%`;
      });
    lines.push(`${INDENT}${parts.join("  ·  ")}`);
  }

  lines.push(`${INDENT}${fmt(stats.total_turns)} turns across ${stats.session_count} sessions`);
  lines.push(`${INDENT}All analysis ran locally. No session data left your machine.`);
  lines.push("");

  console.log(lines.join("\n"));
}


function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Copyable text block ─────────────────────────────────────────────────

/**
 * Format the full card as a copyable text block for Discord/Slack.
 * Mirrors the terminal output exactly so what you see is what you share.
 */
export function formatTextBlock(
  stats: VibeStats,
  match: ArchetypeMatch,
  narrative: string | null,
): string {
  const lines: string[] = [];

  lines.push("HOW DO YOU VIBE?");
  lines.push(LINE);
  lines.push("");
  lines.push(match.headline);

  if (narrative) {
    lines.push("");
    for (const wrapped of wordWrap(narrative, 56)) {
      lines.push(wrapped);
    }
  }

  lines.push("");
  lines.push(LINE);

  // ── Your Voice ──
  const voice: string[] = [];
  if (!isZero(stats.expletives)) voice.push(`  Expletives: ${fmt(stats.expletives)}`);
  if (!isZero(stats.corrections)) voice.push(`  Corrections: ${fmt(stats.corrections)}`);
  if (stats.avg_prompt_words > 50) {
    voice.push(`  Avg prompt: ${stats.avg_prompt_words} words${wow("prompt", stats.avg_prompt_words, [[150, " (essays)"], [100, " (verbose)"], [80, " (detailed)"]])}`);
  }
  if (stats.please_rate > 0.1) voice.push(`  Please rate: ${pct(stats.please_rate)}`);
  else if (stats.please_rate < 0.02 && stats.total_turns > 100) voice.push(`  Please rate: ${pct(stats.please_rate)} (all business)`);
  if (stats.question_rate > 0.1) voice.push(`  Questions: ${pct(stats.question_rate)}`);
  if (stats.late_night_rate > 0.1) voice.push(`  Late night: ${pct(stats.late_night_rate)}`);
  if (stats.reasoning_rate > 0.05) voice.push(`  Thinks out loud: ${pct(stats.reasoning_rate)} of turns`);
  if (stats.secret_leaks_user > 0) voice.push(`  Secrets you leaked: ${stats.secret_leaks_user}${stats.secret_leaks_user > 3 ? " (yikes)" : ""}`);
  if (stats.secret_leaks_ai > 0) voice.push(`  Secrets AI leaked: ${stats.secret_leaks_ai}${stats.secret_leaks_ai > 5 ? " (rotate your keys)" : ""}`);

  if (voice.length > 0) {
    lines.push("");
    lines.push("Your Voice");
    lines.push(...voice);
  }

  // ── The AI's Habits ──
  const ai: string[] = [];
  if (!isZero(stats.read_write_ratio)) {
    ai.push(`  Read:write: ${stats.read_write_ratio}:1${wow("rw", stats.read_write_ratio, [[5, " (careful)"], [3, " (measured)"]])}`);
  }
  if (!isZero(stats.test_runs)) {
    const failPct = stats.failed_tests > 0 ? `, ${Math.round(stats.failed_tests / stats.test_runs * 100)}% failed` : "";
    ai.push(`  Test runs: ${fmt(stats.test_runs)}${failPct}${wow("tests", stats.test_runs, [[500, " (obsessive)"], [100, " (thorough)"]])}`);
  }
  if (stats.longest_tool_chain > 10) {
    ai.push(`  Longest burst: ${fmt(stats.longest_tool_chain)} tool calls${wow("chain", stats.longest_tool_chain, [[500, " (unreal)"], [100, " (deep)"], [50, " (committed)"]])}`);
  }
  if (stats.self_corrections > 10) {
    ai.push(`  Self-corrections: ${fmt(stats.self_corrections)}${wow("selfcor", stats.self_corrections, [[2000, " (the AI never stopped fixing itself)"], [500, " (the AI learned on the job)"], [100, " (it kept iterating)"]])}`);
  }
  if (stats.apologies > 3) ai.push(`  AI apologies: ${stats.apologies}`);

  if (ai.length > 0) {
    lines.push("");
    lines.push("The AI's Habits");
    lines.push(...ai);
  }

  // ── The Back-and-forth ──
  const collab: string[] = [];
  if (!isZero(stats.override_success_rate) && stats.corrections > 0) {
    collab.push(`  Override success: ${pct(stats.override_success_rate)} of ${fmt(stats.corrections)} corrections`);
  }
  if (stats.longest_autopilot > 5) {
    collab.push(`  Longest leash: ${fmt(stats.longest_autopilot)} turns${wow("auto", stats.longest_autopilot, [[1000, " (that's a whole workday)"], [200, " (serious trust)"], [50, " (hands off)"]])}`);
  }
  if (stats.first_blood_min > 2) {
    collab.push(`  First correction: ${stats.first_blood_min} min in${wow("fb", stats.first_blood_min, [[30, " (patient)"], [15, " (long leash)"]])}`);
  }
  if (stats.redirects_per_hour < 1 && stats.total_duration_min > 60) {
    collab.push(`  Redirects/hr: ${stats.redirects_per_hour} (barely touches the wheel)`);
  } else if (stats.redirects_per_hour > 3) {
    collab.push(`  Redirects/hr: ${stats.redirects_per_hour} (constant course-correcting)`);
  }
  if (stats.scope_creep > 2) collab.push(`  Scope creep: ${stats.scope_creep} "while we're at it" moments`);
  if (stats.interruptions > 0) collab.push(`  Interruptions: ${stats.interruptions}${stats.interruptions > 10 ? " (impatient)" : ""}`);


  if (collab.length > 0) {
    lines.push("");
    lines.push("The Back-and-forth");
    lines.push(...collab);
  }

  lines.push("");
  lines.push(LINE);

  // Tool breakdown with percentages
  if (stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0) {
    const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
    const parts = Object.entries(stats.source_breakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([src, count]) => {
        const name = SOURCE_DISPLAY_NAMES[src as SessionSource] ?? src;
        const p = Math.round((count / total) * 100);
        return `${name} ${p}%`;
      });
    lines.push(parts.join("  ·  "));
  }

  lines.push(`${fmt(stats.total_turns)} turns across ${stats.session_count} sessions`);
  lines.push(`npx howdoyouvibe`);

  return lines.join("\n");
}

// ─── Clipboard ───────────────────────────────────────────────────────────

export function copyToClipboard(text: string): boolean {
  try {
    const p = platform();
    if (p === "darwin") {
      execFileSync("pbcopy", [], { input: text });
    } else if (p === "win32") {
      execFileSync("clip", [], { input: text });
    } else {
      // Linux: try xclip, fall back to xsel
      try {
        execFileSync("xclip", ["-selection", "clipboard"], { input: text });
      } catch {
        execFileSync("xsel", ["--clipboard", "--input"], { input: text });
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Interactive prompts ─────────────────────────────────────────────────

export function promptYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${question} (y/n) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}
