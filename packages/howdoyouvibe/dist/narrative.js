import { formatRetryWait } from "./utils.js";
const NARRATIVE_URL = process.env.VIBE_API_URL
    ? `${process.env.VIBE_API_URL}/api/vibes/narrative`
    : "https://howdoyouvibe.com/api/vibes/narrative";
/**
 * Fetch a headline + 2-sentence narrative from the server (Gemini Flash).
 * Falls back to static archetype match and template if the server is unreachable.
 */
export async function fetchNarrative(stats, match) {
    try {
        const res = await fetch(NARRATIVE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                stats: Object.fromEntries(Object.entries(stats).filter(([, v]) => typeof v === "number")),
                archetype_id: match.primary.id,
                modifier_id: match.modifier?.id ?? null,
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
            const data = (await res.json());
            return {
                headline: data.headline || match.headline,
                narrative: data.narrative || templateNarrative(stats, match),
            };
        }
        if (res.status === 429) {
            const retryAfter = res.headers.get("retry-after");
            const wait = retryAfter ? formatRetryWait(Number(retryAfter)) : "later";
            console.log("");
            console.log("  ⚠ AI narrative rate limit reached. Try again in " + wait + ".");
            console.log("  Using local narrative instead.\n");
        }
    }
    catch (err) {
        // Server unreachable — fall through to template
        if (process.env.DEBUG) {
            console.error(`  [debug] Narrative fetch failed: ${err instanceof Error ? err.message : err}`);
        }
    }
    return {
        headline: match.headline,
        narrative: templateNarrative(stats, match),
    };
}
/** Build a fully local result (no network). */
export function localResult(stats, match) {
    return {
        headline: match.headline,
        narrative: templateNarrative(stats, match),
    };
}
/**
 * Template fallback when server is unreachable.
 * Picks the 2 most extreme stats and stitches sentence fragments.
 */
export function templateNarrative(stats, match) {
    // Each stat has templates keyed by severity. Pick the 2 most extreme.
    const candidates = rankStatsBySurprise(stats);
    const picked = candidates.slice(0, 2);
    const sentences = picked.map((c) => c.sentence);
    if (sentences.length === 0) {
        return match.primary.tagline;
    }
    return sentences.join(" ");
}
function rankStatsBySurprise(stats) {
    const candidates = [];
    // ─── Your Voice ──
    if (stats.expletives > 0) {
        const s = stats.expletives;
        const sentence = s > 50
            ? `You dropped ${s} expletives — that's one every ${Math.round(stats.total_turns / s)} turns.`
            : s > 20
                ? `${s} expletives across ${stats.session_count} sessions. Things got heated.`
                : `You swore ${s} times. Restrained, mostly.`;
        candidates.push({ key: "expletives", surprise: s / 5, sentence });
    }
    if (stats.please_rate > 0.2) {
        candidates.push({
            key: "please_rate",
            surprise: stats.please_rate * 3,
            sentence: `You said please in ${Math.round(stats.please_rate * 100)}% of your turns. The AI didn't deserve it.`,
        });
    }
    else if (stats.please_rate < 0.02 && stats.total_turns > 100) {
        candidates.push({
            key: "please_rate",
            surprise: 2,
            sentence: `You almost never said please. All business.`,
        });
    }
    if (stats.avg_prompt_words > 100) {
        candidates.push({
            key: "avg_prompt_words",
            surprise: stats.avg_prompt_words / 40,
            sentence: `Your average prompt was ${stats.avg_prompt_words} words. You don't give instructions — you write briefs.`,
        });
    }
    else if (stats.avg_prompt_words < 15 && stats.total_turns > 100) {
        candidates.push({
            key: "avg_prompt_words",
            surprise: 2,
            sentence: `${stats.avg_prompt_words} words per prompt on average. You point, the AI runs.`,
        });
    }
    if (stats.corrections > 20) {
        candidates.push({
            key: "corrections",
            surprise: stats.corrections / 8,
            sentence: stats.override_success_rate > 0.7
                ? `You corrected the AI ${stats.corrections} times and were right ${Math.round(stats.override_success_rate * 100)}% of the time. Trust your instincts.`
                : `You pushed back ${stats.corrections} times. You know what you want.`,
        });
    }
    if (stats.late_night_rate > 0.3) {
        candidates.push({
            key: "late_night_rate",
            surprise: stats.late_night_rate * 4,
            sentence: `${Math.round(stats.late_night_rate * 100)}% of your coding happened after midnight. Your best ideas come when everyone else is asleep.`,
        });
    }
    if (stats.reasoning_rate > 0.1) {
        candidates.push({
            key: "reasoning_rate",
            surprise: stats.reasoning_rate * 8,
            sentence: `You explained your reasoning in ${Math.round(stats.reasoning_rate * 100)}% of turns. You don't just ask — you think out loud.`,
        });
    }
    // ─── The AI's Habits ──
    if (stats.longest_tool_chain > 50) {
        candidates.push({
            key: "longest_tool_chain",
            surprise: stats.longest_tool_chain / 20,
            sentence: stats.longest_tool_chain > 500
                ? `The AI ran ${stats.longest_tool_chain} tool calls in one burst without you saying a word. That's not delegation — that's trust.`
                : `Longest burst: ${stats.longest_tool_chain} tool calls in a row. The AI had a lot to say.`,
        });
    }
    if (stats.self_corrections > 100) {
        candidates.push({
            key: "self_corrections",
            surprise: stats.self_corrections / 50,
            sentence: stats.self_corrections > 1000
                ? `The AI corrected itself ${stats.self_corrections.toLocaleString()} times. It was learning on the job.`
                : `${stats.self_corrections} self-corrections — the AI kept fixing its own mistakes without being asked.`,
        });
    }
    if (stats.test_runs > 50) {
        const failRate = stats.failed_tests / stats.test_runs;
        candidates.push({
            key: "test_runs",
            surprise: stats.test_runs / 20,
            sentence: failRate > 0.3
                ? `${stats.test_runs} test runs, ${stats.failed_tests} failures. ${Math.round(failRate * 100)}% fail rate — real debugging, not happy paths.`
                : `${stats.test_runs} test runs with a ${Math.round((1 - failRate) * 100)}% pass rate. The code actually works.`,
        });
    }
    if (stats.apologies > 5) {
        candidates.push({
            key: "apologies",
            surprise: stats.apologies / 3,
            sentence: `The AI apologized ${stats.apologies} times. It knew it was struggling.`,
        });
    }
    if (stats.read_write_ratio > 4) {
        candidates.push({
            key: "read_write_ratio",
            surprise: stats.read_write_ratio / 2,
            sentence: `Read:write ratio of ${stats.read_write_ratio}:1. You understand the code before you change it.`,
        });
    }
    else if (stats.read_write_ratio < 1.2 && stats.bash_commands > 30) {
        candidates.push({
            key: "read_write_ratio",
            surprise: 2.5,
            sentence: `Read:write ratio of ${stats.read_write_ratio}:1 and ${stats.bash_commands} bash commands. Ship first, ask questions later.`,
        });
    }
    // ─── The Back-and-forth ──
    if (stats.longest_autopilot > 50) {
        candidates.push({
            key: "longest_autopilot",
            surprise: stats.longest_autopilot / 20,
            sentence: stats.longest_autopilot > 500
                ? `You gave the AI a ${stats.longest_autopilot.toLocaleString()}-turn leash. At that point it's not assistance — it's a coworker.`
                : `Longest leash: ${stats.longest_autopilot} turns without correcting. You know when to get out of the way.`,
        });
    }
    if (stats.redirects_per_hour < 0.5 && stats.total_duration_min > 60) {
        candidates.push({
            key: "redirects_per_hour",
            surprise: 3 - stats.redirects_per_hour * 4,
            sentence: `${stats.redirects_per_hour} redirects per hour. You barely touch the wheel.`,
        });
    }
    else if (stats.redirects_per_hour > 5) {
        candidates.push({
            key: "redirects_per_hour",
            surprise: stats.redirects_per_hour / 2,
            sentence: `${stats.redirects_per_hour} redirects per hour. Every few minutes, you're course-correcting.`,
        });
    }
    if (stats.first_blood_min > 30) {
        candidates.push({
            key: "first_blood_min",
            surprise: stats.first_blood_min / 15,
            sentence: `First correction at ${stats.first_blood_min} minutes on average. You give the AI a long leash before pulling it back.`,
        });
    }
    if (stats.scope_creep > 5) {
        candidates.push({
            key: "scope_creep",
            surprise: stats.scope_creep / 2,
            sentence: `${stats.scope_creep} scope creep moments. "While we're at it" is your catchphrase.`,
        });
    }
    const totalLeaks = (stats.secret_leaks_user || 0) + (stats.secret_leaks_ai || 0);
    if (totalLeaks > 0) {
        candidates.push({
            key: "secret_leaks",
            surprise: totalLeaks * 5,
            sentence: totalLeaks > 10
                ? `${totalLeaks} secrets exposed across your sessions. You and the AI both need to be more careful.`
                : stats.secret_leaks_user > stats.secret_leaks_ai
                    ? `You leaked ${stats.secret_leaks_user} secret${stats.secret_leaks_user > 1 ? "s" : ""} to the AI. It happens.`
                    : `The AI leaked ${stats.secret_leaks_ai} secret${stats.secret_leaks_ai > 1 ? "s" : ""} in its responses. Check your code.`,
        });
    }
    if (stats.interruptions > 5) {
        candidates.push({
            key: "interruptions",
            surprise: stats.interruptions / 2,
            sentence: `You interrupted the AI ${stats.interruptions} times. Sometimes you just know it's going the wrong way.`,
        });
    }
    // Sort by surprise descending
    candidates.sort((a, b) => b.surprise - a.surprise);
    return candidates;
}
//# sourceMappingURL=narrative.js.map