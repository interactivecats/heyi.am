import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { SOURCE_DISPLAY_NAMES } from "./parsers/types.js";
// ─── Terminal card rendering ─────────────────────────────────────────────
const COL_WIDTH = 28;
// ─── ANSI colors (no dependencies) ──────────────────────────────────────────
// Respect NO_COLOR (https://no-color.org) — strip all escapes when set.
// Design: default terminal text for all labels/words, cyan accent on numbers only.
// Cyan is safe on virtually every terminal background (dark, light, grey).
const noColor = "NO_COLOR" in process.env;
const esc = (code) => (noColor ? "" : code);
const c = {
    reset: esc("\x1b[0m"),
    bold: esc("\x1b[1m"),
    dim: esc("\x1b[2m"),
    cyan: esc("\x1b[36m"),
};
const LINE = "═".repeat(80);
const THIN = "─".repeat(80);
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
const LOGO_COLOR = c.cyan;
export function renderCard(stats, headline, narrative) {
    const lines = [];
    lines.push("");
    for (let i = 0; i < LOGO_LINES.length; i++) {
        lines.push(`${INDENT}${LOGO_COLOR}${LOGO_LINES[i]}${c.reset}`);
    }
    lines.push(`${INDENT}${LINE}`);
    lines.push("");
    lines.push(`${INDENT}${c.bold}${headline}${c.reset}`);
    if (narrative) {
        lines.push("");
        for (const wrapped of wordWrap(narrative, 76)) {
            lines.push(`${INDENT}${wrapped}`);
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
        // Headers in bold default text
        lines.push(INDENT + columns.map((col) => `${c.bold}${col.header.padEnd(COL_WIDTH)}${c.reset}`).join("  "));
        // Stat rows — label in default text, value in cyan
        const maxRows = Math.max(...columns.map(col => col.entries.length));
        for (let r = 0; r < maxRows; r++) {
            const row = columns.map((col) => {
                const entry = col.entries[r];
                if (!entry)
                    return "".padEnd(COL_WIDTH);
                const [label, value] = entry;
                const raw = `${label}: ${value}`;
                return `${label}: ${c.cyan}${value}${c.reset}${"".padEnd(Math.max(0, COL_WIDTH - raw.length))}`;
            });
            lines.push(INDENT + row.join("  "));
        }
    }
    lines.push("");
    lines.push(`${INDENT}${LINE}`);
    // Tool breakdown — default text, cyan on percentages
    if (stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0) {
        const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
        const parts = Object.entries(stats.source_breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([src, count]) => {
            const name = SOURCE_DISPLAY_NAMES[src] ?? src;
            const p = Math.round((count / total) * 100);
            return `${name} ${c.cyan}${p}%${c.reset}`;
        });
        lines.push(`${INDENT}${parts.join("  ·  ")}`);
    }
    const dailyHours = stats.avg_daily_hours > 0 ? `  ·  ${c.cyan}${stats.avg_daily_hours}${c.reset}h/day avg` : "";
    lines.push(`${INDENT}${c.cyan}${fmt(stats.total_turns)}${c.reset} turns across ${c.cyan}${stats.session_count}${c.reset} sessions${dailyHours}`);
    lines.push(`${INDENT}Based on the last ~30 days of sessions. All analysis ran locally.`);
    lines.push("");
    console.log(lines.join("\n"));
}
/** Build the three stat columns — shared between terminal card and copyable text */
function buildStatColumns(stats) {
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
    if (stats.agent_spawns > 0)
        aiCol.push(["Agents spawned", `${fmt(stats.agent_spawns)}`]);
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
    if (stats.plan_mode_uses > 0)
        collabCol.push(["Plans made", `${stats.plan_mode_uses}`]);
    return { voiceCol, aiCol, collabCol };
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
/**
 * Format for messaging apps (WhatsApp, Slack, Discord, iMessage).
 * Vertical, compact, proportional-font friendly. No columns — they break on mobile.
 * Stats paired with · on each line for density without requiring monospace.
 */
export function formatTextBlock(stats, headline, narrative) {
    const lines = [];
    const { voiceCol, aiCol, collabCol } = buildStatColumns(stats);
    lines.push(`HOW DO YOU VIBE?`);
    lines.push(``);
    lines.push(headline);
    if (narrative) {
        lines.push(``);
        lines.push(narrative);
    }
    // Pair stats on lines with · separator — compact but readable
    function pairStats(entries) {
        const out = [];
        for (let i = 0; i < entries.length; i += 2) {
            const left = `${entries[i][0]}: ${entries[i][1]}`;
            if (i + 1 < entries.length) {
                out.push(`${left} · ${entries[i + 1][0]}: ${entries[i + 1][1]}`);
            }
            else {
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
    const footerParts = [];
    if (stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0) {
        const total = Object.values(stats.source_breakdown).reduce((a, b) => a + b, 0);
        const parts = Object.entries(stats.source_breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([src, count]) => {
            const name = SOURCE_DISPLAY_NAMES[src] ?? src;
            return `${name} ${Math.round((count / total) * 100)}%`;
        });
        footerParts.push(parts.join(" · "));
    }
    footerParts.push(`${fmt(stats.total_turns)} turns · ${stats.session_count} sessions`);
    if (stats.avg_daily_hours > 0)
        footerParts.push(`${stats.avg_daily_hours}h/day`);
    lines.push(footerParts.join(" · "));
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