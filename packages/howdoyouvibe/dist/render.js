import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { SOURCE_DISPLAY_NAMES } from "./parsers/types.js";
// ─── Terminal card rendering ─────────────────────────────────────────────
const COL_WIDTH = 28;
// ─── ANSI colors (no dependencies) ──────────────────────────────────────────
const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    blue: "\x1b[34m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    bgBlack: "\x1b[40m",
};
const LINE = `${c.cyan}${"═".repeat(80)}${c.reset}`;
const THIN = `${c.cyan}${"─".repeat(80)}${c.reset}`;
const PLAIN_LINE = "═".repeat(80);
const INDENT = "  ";
function pct(n) {
    return `${Math.round(n * 100)}%`;
}
function formatSources(sources) {
    return sources.map((s) => SOURCE_DISPLAY_NAMES[s] ?? s).join(", ");
}
/** Pad a stat label:value to a fixed column width for two-column layout */
function statCol(label, value, width = 28) {
    const text = `${label}: ${value}`;
    return text.padEnd(width);
}
/** Check if a stat value is "boring" — zero, or too uninteresting to show */
function isZero(v) {
    return v === 0;
}
/** Format large numbers with commas */
function fmt(n) {
    return n >= 1000 ? n.toLocaleString() : String(n);
}
/** Add a "wow" comment for extreme stat values */
function wow(label, value, thresholds) {
    for (const [t, comment] of thresholds) {
        if (value >= t)
            return ` ${comment}`;
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
export function renderCard(stats, match, narrative) {
    const lines = [];
    lines.push("");
    for (let i = 0; i < LOGO_LINES.length; i++) {
        lines.push(`${INDENT}${LOGO_COLORS[i]}${LOGO_LINES[i]}${c.reset}`);
    }
    lines.push(`${INDENT}${LINE}`);
    lines.push("");
    lines.push(`${INDENT}${c.bold}${c.white}${match.headline}${c.reset}`);
    if (narrative) {
        lines.push("");
        for (const wrapped of wordWrap(narrative, 76)) {
            lines.push(`${INDENT}${c.dim}${wrapped}${c.reset}`);
        }
    }
    lines.push("");
    lines.push(`${INDENT}${THIN}`);
    const voiceCol = [];
    if (!isZero(stats.expletives))
        voiceCol.push(["Expletives", fmt(stats.expletives)]);
    if (!isZero(stats.corrections))
        voiceCol.push(["Corrections", fmt(stats.corrections)]);
    if (stats.avg_prompt_words > 50)
        voiceCol.push(["Avg prompt", `${stats.avg_prompt_words}w${wow("prompt", stats.avg_prompt_words, [[150, " essays"], [100, " verbose"]])}`]);
    if (stats.please_rate > 0.1)
        voiceCol.push(["Please rate", pct(stats.please_rate)]);
    else if (stats.please_rate < 0.02 && stats.total_turns > 100)
        voiceCol.push(["Please rate", `${pct(stats.please_rate)} nope`]);
    if (stats.question_rate > 0.1)
        voiceCol.push(["Questions", pct(stats.question_rate)]);
    if (stats.late_night_rate > 0.1)
        voiceCol.push(["Late night", pct(stats.late_night_rate)]);
    if (stats.reasoning_rate > 0.05)
        voiceCol.push(["Thinks aloud", `${pct(stats.reasoning_rate)} turns`]);
    if (stats.secret_leaks_user > 0)
        voiceCol.push(["Secrets leaked", `${stats.secret_leaks_user}${stats.secret_leaks_user > 3 ? " yikes" : ""}`]);
    const aiCol = [];
    if (!isZero(stats.read_write_ratio))
        aiCol.push(["Read:write", `${stats.read_write_ratio}:1${wow("rw", stats.read_write_ratio, [[5, " careful"], [3, " measured"]])}`]);
    if (!isZero(stats.test_runs)) {
        const failPct = stats.failed_tests > 0 ? ` ${Math.round(stats.failed_tests / stats.test_runs * 100)}%F` : "";
        aiCol.push(["Test runs", `${fmt(stats.test_runs)}${failPct}`]);
    }
    if (stats.longest_tool_chain > 10)
        aiCol.push(["Longest burst", `${fmt(stats.longest_tool_chain)}${wow("chain", stats.longest_tool_chain, [[500, " unreal"], [100, " deep"]])}`]);
    if (stats.self_corrections > 10)
        aiCol.push(["Self-fixes", `${fmt(stats.self_corrections)}${wow("selfcor", stats.self_corrections, [[500, " yikes"], [100, " learning"]])}`]);
    if (stats.apologies > 3)
        aiCol.push(["Apologies", `${stats.apologies}`]);
    if (stats.secret_leaks_ai > 0)
        aiCol.push(["AI leaked", `${stats.secret_leaks_ai}${stats.secret_leaks_ai > 5 ? " rotate!" : ""}`]);
    const collabCol = [];
    if (!isZero(stats.override_success_rate) && stats.corrections > 0)
        collabCol.push(["Override win", `${pct(stats.override_success_rate)} of ${fmt(stats.corrections)}`]);
    if (stats.longest_autopilot > 5)
        collabCol.push(["Leash", `${fmt(stats.longest_autopilot)} turns${wow("auto", stats.longest_autopilot, [[1000, " wow"], [200, " trust"]])}`]);
    if (stats.first_blood_min > 2)
        collabCol.push(["1st correction", `${stats.first_blood_min}m${wow("fb", stats.first_blood_min, [[30, " patient"], [15, " chill"]])}`]);
    if (stats.redirects_per_hour < 1 && stats.total_duration_min > 60)
        collabCol.push(["Redirects/hr", `${stats.redirects_per_hour} hands off`]);
    else if (stats.redirects_per_hour > 3)
        collabCol.push(["Redirects/hr", `${stats.redirects_per_hour} tight grip`]);
    if (stats.scope_creep > 2)
        collabCol.push(["Scope creep", `${stats.scope_creep}`]);
    if (stats.interruptions > 0)
        collabCol.push(["Interrupts", `${stats.interruptions}${stats.interruptions > 10 ? " impatient" : ""}`]);
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
        lines.push(INDENT + columns.map((col, i) => `${headerColors[i] || c.white}${col.header.padEnd(COL_WIDTH)}${c.reset}`).join("  "));
        // Stat rows
        const maxRows = Math.max(...columns.map(col => col.entries.length));
        for (let r = 0; r < maxRows; r++) {
            const row = columns.map((col, i) => {
                const entry = col.entries[r];
                if (!entry)
                    return "".padEnd(COL_WIDTH);
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
        const toolColors = { claude: c.magenta, cursor: c.cyan, codex: c.green, gemini: c.yellow };
        const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
        const parts = Object.entries(stats.source_breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([src, count]) => {
            const name = SOURCE_DISPLAY_NAMES[src] ?? src;
            const p = Math.round((count / total) * 100);
            const tc = toolColors[src] || c.white;
            return `${tc}${name} ${p}%${c.reset}`;
        });
        lines.push(`${INDENT}${parts.join(`  ${c.gray}·${c.reset}  `)}`);
    }
    lines.push(`${INDENT}${c.gray}${fmt(stats.total_turns)} turns across ${stats.session_count} sessions${c.reset}`);
    lines.push(`${INDENT}${c.dim}All analysis ran locally. No session data left your machine.${c.reset}`);
    lines.push("");
    console.log(lines.join("\n"));
}
function wordWrap(text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = "";
    for (const word of words) {
        if (current.length + word.length + 1 > maxWidth && current.length > 0) {
            lines.push(current);
            current = word;
        }
        else {
            current = current ? `${current} ${word}` : word;
        }
    }
    if (current)
        lines.push(current);
    return lines;
}
// ─── Copyable text block ─────────────────────────────────────────────────
/**
 * Format the full card as a copyable text block for Discord/Slack.
 * Mirrors the terminal output exactly so what you see is what you share.
 */
export function formatTextBlock(stats, match, narrative) {
    const lines = [];
    lines.push("HOW DO YOU VIBE?");
    lines.push(PLAIN_LINE);
    lines.push("");
    lines.push(match.headline);
    if (narrative) {
        lines.push("");
        for (const wrapped of wordWrap(narrative, 76)) {
            lines.push(wrapped);
        }
    }
    lines.push("");
    lines.push(PLAIN_LINE);
    // ── Your Voice ──
    const voice = [];
    if (!isZero(stats.expletives))
        voice.push(`  Expletives: ${fmt(stats.expletives)}`);
    if (!isZero(stats.corrections))
        voice.push(`  Corrections: ${fmt(stats.corrections)}`);
    if (stats.avg_prompt_words > 50) {
        voice.push(`  Avg prompt: ${stats.avg_prompt_words} words${wow("prompt", stats.avg_prompt_words, [[150, " (essays)"], [100, " (verbose)"], [80, " (detailed)"]])}`);
    }
    if (stats.please_rate > 0.1)
        voice.push(`  Please rate: ${pct(stats.please_rate)}`);
    else if (stats.please_rate < 0.02 && stats.total_turns > 100)
        voice.push(`  Please rate: ${pct(stats.please_rate)} (all business)`);
    if (stats.question_rate > 0.1)
        voice.push(`  Questions: ${pct(stats.question_rate)}`);
    if (stats.late_night_rate > 0.1)
        voice.push(`  Late night: ${pct(stats.late_night_rate)}`);
    if (stats.reasoning_rate > 0.05)
        voice.push(`  Thinks out loud: ${pct(stats.reasoning_rate)} of turns`);
    if (stats.secret_leaks_user > 0)
        voice.push(`  Secrets you leaked: ${stats.secret_leaks_user}${stats.secret_leaks_user > 3 ? " (yikes)" : ""}`);
    if (stats.secret_leaks_ai > 0)
        voice.push(`  Secrets AI leaked: ${stats.secret_leaks_ai}${stats.secret_leaks_ai > 5 ? " (rotate your keys)" : ""}`);
    if (voice.length > 0) {
        lines.push("");
        lines.push("Your Voice");
        lines.push(...voice);
    }
    // ── The AI's Habits ──
    const ai = [];
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
    if (stats.apologies > 3)
        ai.push(`  AI apologies: ${stats.apologies}`);
    if (ai.length > 0) {
        lines.push("");
        lines.push("The AI's Habits");
        lines.push(...ai);
    }
    // ── The Back-and-forth ──
    const collab = [];
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
    }
    else if (stats.redirects_per_hour > 3) {
        collab.push(`  Redirects/hr: ${stats.redirects_per_hour} (constant course-correcting)`);
    }
    if (stats.scope_creep > 2)
        collab.push(`  Scope creep: ${stats.scope_creep} "while we're at it" moments`);
    if (stats.interruptions > 0)
        collab.push(`  Interruptions: ${stats.interruptions}${stats.interruptions > 10 ? " (impatient)" : ""}`);
    if (collab.length > 0) {
        lines.push("");
        lines.push("The Back-and-forth");
        lines.push(...collab);
    }
    lines.push("");
    lines.push(PLAIN_LINE);
    if (stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0) {
        const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
        const parts = Object.entries(stats.source_breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([src, count]) => {
            const name = SOURCE_DISPLAY_NAMES[src] ?? src;
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
export function copyToClipboard(text) {
    try {
        const p = platform();
        if (p === "darwin") {
            execFileSync("pbcopy", [], { input: text });
        }
        else if (p === "win32") {
            execFileSync("clip", [], { input: text });
        }
        else {
            // Linux: try xclip, fall back to xsel
            try {
                execFileSync("xclip", ["-selection", "clipboard"], { input: text });
            }
            catch {
                execFileSync("xsel", ["--clipboard", "--input"], { input: text });
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
// ─── Interactive prompts ─────────────────────────────────────────────────
export function promptYesNo(question) {
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
//# sourceMappingURL=render.js.map