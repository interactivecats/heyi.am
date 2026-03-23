import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { SOURCE_DISPLAY_NAMES } from "./parsers/types.js";
// ─── Terminal card rendering ─────────────────────────────────────────────
const LINE = "────────────────────────────────────────";
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
/** Check if a stat value is "boring" (zero or default) */
function isZero(v) {
    return v === 0;
}
export function renderCard(stats, match, narrative) {
    const lines = [];
    lines.push("");
    lines.push(`${INDENT}HOW DO YOU VIBE?`);
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
    const voiceStats = [];
    if (!isZero(stats.expletives))
        voiceStats.push(["Expletives", stats.expletives]);
    if (!isZero(stats.corrections))
        voiceStats.push(["Corrections", stats.corrections]);
    if (!isZero(stats.please_rate))
        voiceStats.push(["Please rate", pct(stats.please_rate)]);
    voiceStats.push(["Avg prompt", `${stats.avg_prompt_words} words`]);
    if (!isZero(stats.late_night_rate))
        voiceStats.push(["Late night", pct(stats.late_night_rate)]);
    if (!isZero(stats.question_rate))
        voiceStats.push(["Questions", pct(stats.question_rate)]);
    if (voiceStats.length > 0) {
        lines.push("");
        lines.push(`${INDENT}Your Voice`);
        renderStatPairs(voiceStats, lines);
    }
    // ── The AI's Habits ──
    const aiStats = [];
    if (!isZero(stats.read_write_ratio))
        aiStats.push(["Read:write", `${stats.read_write_ratio}:1`]);
    if (!isZero(stats.apologies))
        aiStats.push(["Apologies", stats.apologies]);
    if (!isZero(stats.test_runs)) {
        const testLabel = stats.failed_tests > 0
            ? `${stats.test_runs} (${stats.failed_tests} fail)`
            : `${stats.test_runs}`;
        aiStats.push(["Test runs", testLabel]);
    }
    if (!isZero(stats.longest_tool_chain))
        aiStats.push(["Longest chain", stats.longest_tool_chain]);
    if (!isZero(stats.self_corrections))
        aiStats.push(["Self-corrections", stats.self_corrections]);
    if (aiStats.length > 0) {
        lines.push("");
        lines.push(`${INDENT}The AI's Habits`);
        renderStatPairs(aiStats, lines);
    }
    // ── The Back-and-forth ──
    const interStats = [];
    if (!isZero(stats.override_success_rate))
        interStats.push(["Override success", pct(stats.override_success_rate)]);
    if (!isZero(stats.longest_autopilot))
        interStats.push(["Autopilot", `${stats.longest_autopilot} turns`]);
    if (!isZero(stats.first_blood_min))
        interStats.push(["First blood", `${stats.first_blood_min} min`]);
    if (!isZero(stats.scope_creep))
        interStats.push(["Scope creep", stats.scope_creep]);
    if (!isZero(stats.redirects_per_hour))
        interStats.push(["Redirects/hr", stats.redirects_per_hour]);
    if (interStats.length > 0) {
        lines.push("");
        lines.push(`${INDENT}The Back-and-forth`);
        renderStatPairs(interStats, lines);
    }
    lines.push("");
    lines.push(`${INDENT}${LINE}`);
    lines.push(`${INDENT}${stats.total_turns} turns across ${stats.session_count} sessions (${formatSources(stats.sources)})`);
    lines.push(`${INDENT}All analysis ran locally. No session data left your machine.`);
    lines.push("");
    console.log(lines.join("\n"));
}
function renderStatPairs(pairs, lines) {
    for (let i = 0; i < pairs.length; i += 2) {
        const left = statCol(pairs[i][0], pairs[i][1]);
        const right = i + 1 < pairs.length ? `${pairs[i + 1][0]}: ${pairs[i + 1][1]}` : "";
        lines.push(`${INDENT}  ${left}${right}`);
    }
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
 * Format a compact shareable text block (5 lines for Discord/Slack).
 * Picks the 3 most interesting non-zero stats.
 */
export function formatTextBlock(stats, match, narrative) {
    const lines = [];
    lines.push(match.headline);
    if (narrative) {
        lines.push(narrative);
    }
    // Pick top 3 interesting stats
    const interesting = [];
    if (!isZero(stats.expletives))
        interesting.push(`Expletives: ${stats.expletives}`);
    if (!isZero(stats.override_success_rate))
        interesting.push(`Override success: ${pct(stats.override_success_rate)}`);
    if (!isZero(stats.read_write_ratio))
        interesting.push(`Read:write: ${stats.read_write_ratio}:1`);
    if (!isZero(stats.please_rate))
        interesting.push(`Please rate: ${pct(stats.please_rate)}`);
    if (!isZero(stats.late_night_rate))
        interesting.push(`Late night: ${pct(stats.late_night_rate)}`);
    if (!isZero(stats.corrections))
        interesting.push(`Corrections: ${stats.corrections}`);
    if (!isZero(stats.longest_autopilot))
        interesting.push(`Autopilot: ${stats.longest_autopilot}`);
    if (!isZero(stats.scope_creep))
        interesting.push(`Scope creep: ${stats.scope_creep}`);
    if (interesting.length > 0) {
        lines.push(interesting.slice(0, 3).join(" | "));
    }
    lines.push(`${stats.total_turns} turns across ${stats.session_count} sessions` +
        ` \u2014 npx howdoyouvibe`);
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