import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import type { VibeStats } from "./types.js";
import { SOURCE_DISPLAY_NAMES, type SessionSource } from "./parsers/types.js";

// ─── Terminal card rendering ─────────────────────────────────────────────

const COL_WIDTH = 28;

// ─── ANSI colors (no dependencies) ──────────────────────────────────────────
// Respect NO_COLOR (https://no-color.org) — strip all escapes when set.
// Use only colors safe on both light and dark terminals:
//   - cyan, magenta, green are universally readable
//   - yellow (33) replaced with bright cyan (96) — yellow is invisible on light bg
//   - white (37) replaced with bold default — white is invisible on light bg
//   - gray (90) replaced with dim default — bright-black vanishes on light themes
const noColor = "NO_COLOR" in process.env;
const esc = (code: string) => (noColor ? "" : code);

const c = {
  reset: esc("\x1b[0m"),
  bold: esc("\x1b[1m"),
  dim: esc("\x1b[2m"),
  cyan: esc("\x1b[36m"),
  magenta: esc("\x1b[35m"),
  yellow: esc("\x1b[96m"),  // bright cyan — safe on light+dark
  green: esc("\x1b[32m"),
  red: esc("\x1b[31m"),
  blue: esc("\x1b[34m"),
  white: esc("\x1b[1m"),    // bold default fg — safe on light+dark
  gray: esc("\x1b[2m"),     // dim default fg — safe on light+dark
  bgBlack: "",              // removed — forces black bg which hurts light themes
};

const LINE = `${c.cyan}${"═".repeat(80)}${c.reset}`;
const THIN = `${c.cyan}${"─".repeat(80)}${c.reset}`;
const PLAIN_LINE = "═".repeat(80);
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

const LOGO_LINES = [
  " _                       _                        _  _          ",
  "| |_  ___ __ __ __ _  __| |___  _  _ ___ _  ___ _(_)| |__  ___ ",
  "| ' \\/ _ \\\\ V  V // _` / _ / _ \\| || / _ \\ || \\ V / || '_ \\/ -_)",
  "|_||_\\___/ \\_/\\_/ \\__,_\\___\\___/ \\_, \\___/\\_,_|\\_/|_||_.__/\\___|",
  "                                 |__/                            ",
];
const LOGO_COLORS = [c.cyan, c.magenta, c.yellow, c.green, c.cyan];

export function renderCard(
  stats: VibeStats,
  headline: string,
  narrative: string | null,
): void {
  const lines: string[] = [];

  lines.push("");
  for (let i = 0; i < LOGO_LINES.length; i++) {
    lines.push(`${INDENT}${LOGO_COLORS[i]}${LOGO_LINES[i]}${c.reset}`);
  }
  lines.push(`${INDENT}${LINE}`);
  lines.push("");
  lines.push(`${INDENT}${c.bold}${c.white}${headline}${c.reset}`);

  if (narrative) {
    lines.push("");
    for (const wrapped of wordWrap(narrative, 76)) {
      lines.push(`${INDENT}${c.dim}${wrapped}${c.reset}`);
    }
  }

  lines.push("");
  lines.push(`${INDENT}${THIN}`);

  // ── Build three columns of stats ──
  const { voiceCol, aiCol, collabCol } = buildStatColumns(stats);

  // Render three columns side by side
  const columns = [
    { header: "YOUR VOICE", entries: voiceCol },
    { header: "THE AI'S HABITS", entries: aiCol },
    { header: "THE BACK-AND-FORTH", entries: collabCol },
  ].filter(c => c.entries.length > 0);

  if (columns.length > 0) {
    lines.push("");
    // Headers — each a different color
    const headerColors = [c.magenta, c.cyan, c.yellow];
    lines.push(INDENT + columns.map((col, i) =>
      `${headerColors[i] || c.white}${col.header.padEnd(COL_WIDTH)}${c.reset}`
    ).join("  "));

    // Stat rows
    const maxRows = Math.max(...columns.map(col => col.entries.length));
    for (let r = 0; r < maxRows; r++) {
      const row = columns.map((col, i) => {
        const entry = col.entries[r];
        if (!entry) return "".padEnd(COL_WIDTH);
        const [label, value] = entry;
        // Label in gray, value in column color
        const color = headerColors[i] || c.white;
        const raw = `${label}: ${value}`;
        const padded = raw.length > COL_WIDTH ? raw.slice(0, COL_WIDTH) : raw.padEnd(COL_WIDTH);
        return `${c.gray}${label}: ${c.reset}${color}${value}${c.reset}${"".padEnd(Math.max(0, COL_WIDTH - raw.length))}`;
      });
      lines.push(INDENT + row.join("  "));
    }
  }

  lines.push("");
  lines.push(`${INDENT}${LINE}`);

  // Tool breakdown with percentages — colored per tool
  if (stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0) {
    const toolColors: Record<string, string> = { claude: c.magenta, cursor: c.cyan, codex: c.green, gemini: c.yellow };
    const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
    const parts = Object.entries(stats.source_breakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([src, count]) => {
        const name = SOURCE_DISPLAY_NAMES[src as SessionSource] ?? src;
        const p = Math.round((count / total) * 100);
        const tc = toolColors[src] || c.white;
        return `${tc}${name} ${p}%${c.reset}`;
      });
    lines.push(`${INDENT}${parts.join(`  ${c.gray}·${c.reset}  `)}`);
  }

  const dailyHours = stats.avg_daily_hours > 0 ? `  ${c.gray}·${c.reset}  ${c.green}${stats.avg_daily_hours}h/day avg${c.reset}` : "";
  lines.push(`${INDENT}${c.gray}${fmt(stats.total_turns)} turns across ${stats.session_count} sessions${c.reset}${dailyHours}`);
  lines.push(`${INDENT}${c.dim}All analysis ran locally. No session data left your machine.${c.reset}`);
  lines.push("");

  console.log(lines.join("\n"));
}


type StatEntry = [string, string];

/** Build the three stat columns — shared between terminal card and copyable text */
function buildStatColumns(stats: VibeStats): { voiceCol: StatEntry[]; aiCol: StatEntry[]; collabCol: StatEntry[] } {
  const voiceCol: StatEntry[] = [];
  if (!isZero(stats.expletives)) voiceCol.push(["Expletives", fmt(stats.expletives)]);
  if (!isZero(stats.corrections)) voiceCol.push(["Corrections", fmt(stats.corrections)]);
  if (stats.avg_prompt_words > 50) voiceCol.push(["Avg prompt", `${stats.avg_prompt_words}w${wow("prompt", stats.avg_prompt_words, [[150, " essays"], [100, " verbose"]])}`]);
  if (stats.please_rate > 0.1) voiceCol.push(["Please rate", pct(stats.please_rate)]);
  else if (stats.please_rate < 0.02 && stats.total_turns > 100) voiceCol.push(["Please rate", `${pct(stats.please_rate)} nope`]);
  if (stats.question_rate > 0.1) voiceCol.push(["Questions", pct(stats.question_rate)]);
  if (stats.late_night_rate > 0.1) voiceCol.push(["Late night", pct(stats.late_night_rate)]);
  if (stats.reasoning_rate > 0.05) voiceCol.push(["Thinks aloud", `${pct(stats.reasoning_rate)} turns`]);
  if (stats.secret_leaks_user > 0) voiceCol.push(["Secrets leaked", `${stats.secret_leaks_user}${stats.secret_leaks_user > 3 ? " yikes" : ""}`]);

  const aiCol: StatEntry[] = [];
  if (!isZero(stats.read_write_ratio)) aiCol.push(["Read:write", `${stats.read_write_ratio}:1${wow("rw", stats.read_write_ratio, [[5, " careful"], [3, " measured"]])}`]);
  if (!isZero(stats.test_runs)) {
    const failPct = stats.failed_tests > 0 ? ` ${Math.round(stats.failed_tests / stats.test_runs * 100)}%F` : "";
    aiCol.push(["Test runs", `${fmt(stats.test_runs)}${failPct}`]);
  }
  if (stats.longest_tool_chain > 10) aiCol.push(["Longest burst", `${fmt(stats.longest_tool_chain)}${wow("chain", stats.longest_tool_chain, [[500, " unreal"], [100, " deep"]])}`]);
  if (stats.self_corrections > 10) aiCol.push(["Self-fixes", `${fmt(stats.self_corrections)}${wow("selfcor", stats.self_corrections, [[500, " yikes"], [100, " learning"]])}`]);
  if (stats.apologies > 3) aiCol.push(["Apologies", `${stats.apologies}`]);
  if (stats.secret_leaks_ai > 0) aiCol.push(["AI leaked", `${stats.secret_leaks_ai}${stats.secret_leaks_ai > 5 ? " rotate!" : ""}`]);
  if (stats.agent_spawns > 0) aiCol.push(["Agents spawned", `${fmt(stats.agent_spawns)}`]);

  const collabCol: StatEntry[] = [];
  if (!isZero(stats.override_success_rate) && stats.corrections > 0) collabCol.push(["Override win", `${pct(stats.override_success_rate)} of ${fmt(stats.corrections)}`]);
  if (stats.longest_autopilot > 5) collabCol.push(["Leash", `${fmt(stats.longest_autopilot)} turns${wow("auto", stats.longest_autopilot, [[1000, " wow"], [200, " trust"]])}`]);
  if (stats.first_blood_min > 2) collabCol.push(["1st correction", `${stats.first_blood_min}m${wow("fb", stats.first_blood_min, [[30, " patient"], [15, " chill"]])}`]);
  if (stats.redirects_per_hour < 1 && stats.total_duration_min > 60) collabCol.push(["Redirects/hr", `${stats.redirects_per_hour} hands off`]);
  else if (stats.redirects_per_hour > 3) collabCol.push(["Redirects/hr", `${stats.redirects_per_hour} tight grip`]);
  if (stats.scope_creep > 2) collabCol.push(["Scope creep", `${stats.scope_creep}`]);
  if (stats.interruptions > 0) collabCol.push(["Interrupts", `${stats.interruptions}${stats.interruptions > 10 ? " impatient" : ""}`]);
  if (stats.plan_mode_uses > 0) collabCol.push(["Plans made", `${stats.plan_mode_uses}`]);

  return { voiceCol, aiCol, collabCol };
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
/**
 * Format for messaging apps (WhatsApp, Slack, Discord, iMessage).
 * Vertical, compact, proportional-font friendly. No columns — they break on mobile.
 * Stats paired with · on each line for density without requiring monospace.
 */
export function formatTextBlock(
  stats: VibeStats,
  headline: string,
  narrative: string | null,
): string {
  const lines: string[] = [];
  const { voiceCol, aiCol, collabCol } = buildStatColumns(stats);

  lines.push(`HOW DO YOU VIBE?`);
  lines.push(``);
  lines.push(headline);

  if (narrative) {
    lines.push(``);
    lines.push(narrative);
  }

  // Pair stats on lines with · separator — compact but readable
  function pairStats(entries: StatEntry[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < entries.length; i += 2) {
      const left = `${entries[i][0]}: ${entries[i][1]}`;
      if (i + 1 < entries.length) {
        out.push(`${left} · ${entries[i + 1][0]}: ${entries[i + 1][1]}`);
      } else {
        out.push(left);
      }
    }
    return out;
  }

  if (voiceCol.length > 0) {
    lines.push(``);
    lines.push(`YOUR VOICE`);
    lines.push(...pairStats(voiceCol));
  }

  if (aiCol.length > 0) {
    lines.push(``);
    lines.push(`THE AI'S HABITS`);
    lines.push(...pairStats(aiCol));
  }

  if (collabCol.length > 0) {
    lines.push(``);
    lines.push(`THE BACK-AND-FORTH`);
    lines.push(...pairStats(collabCol));
  }

  lines.push(``);

  const footerParts: string[] = [];
  if (stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0) {
    const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
    const parts = Object.entries(stats.source_breakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([src, count]) => {
        const name = SOURCE_DISPLAY_NAMES[src as SessionSource] ?? src;
        return `${name} ${Math.round((count / total) * 100)}%`;
      });
    footerParts.push(parts.join(" · "));
  }
  footerParts.push(`${fmt(stats.total_turns)} turns · ${stats.session_count} sessions`);
  if (stats.avg_daily_hours > 0) footerParts.push(`${stats.avg_daily_hours}h/day`);
  lines.push(footerParts.join(" · "));
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
