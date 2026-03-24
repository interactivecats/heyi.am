// ─── Helpers ─────────────────────────────────────────────────────────────
/** How far above a threshold a value is, log-scaled to prevent extreme values from dominating. */
function overThreshold(value, threshold) {
    if (threshold === 0)
        return value > 0 ? Math.log2(1 + value) : 0;
    if (value <= threshold)
        return 0;
    return Math.log2(1 + (value - threshold) / threshold);
}
/** For "less than" conditions: how far below threshold. */
function underThreshold(value, threshold) {
    if (value >= threshold)
        return 0;
    return (threshold - value) / threshold;
}
// ─── Primary Archetypes ──────────────────────────────────────────────────
export const PRIMARY_ARCHETYPES = [
    {
        id: "night-owl",
        name: "The Night Owl",
        tagline: "Codes when the world sleeps.",
        conditions: [(s) => s.late_night_rate > 0.3],
        impliedStats: ["late_night_rate"],
        score: (s) => overThreshold(s.late_night_rate, 0.3),
    },
    {
        id: "backseat-driver",
        name: "The Backseat Driver",
        tagline: "Knows when the AI is wrong.",
        conditions: [
            (s) => s.corrections > 10,
            (s) => s.override_success_rate > 0.6,
        ],
        impliedStats: ["corrections", "override_success_rate"],
        score: (s) => (overThreshold(s.corrections, 10) + overThreshold(s.override_success_rate, 0.6)) / 2,
    },
    {
        id: "delegator",
        name: "The Delegator",
        tagline: "Points and lets the AI run.",
        conditions: [
            (s) => s.longest_autopilot > 15,
            (s) => s.redirects_per_hour < 2,
        ],
        impliedStats: ["longest_autopilot", "redirects_per_hour"],
        score: (s) => 
        // Autopilot is the defining trait — weight it 2x
        (overThreshold(s.longest_autopilot, 15) * 2 + underThreshold(s.redirects_per_hour, 2)) / 3,
    },
    {
        id: "cowboy",
        name: "The Cowboy",
        tagline: "Writes first, reads later.",
        conditions: [
            (s) => s.read_write_ratio < 1.5,
            (s) => s.bash_commands > 50,
        ],
        impliedStats: ["read_write_ratio", "bash_commands"],
        score: (s) => (underThreshold(s.read_write_ratio, 1.5) + overThreshold(s.bash_commands, 50)) / 2,
    },
    {
        id: "overthinker",
        name: "The Overthinker",
        tagline: "Every prompt is a paragraph.",
        conditions: [
            (s) => s.avg_prompt_words > 80,
            (s) => s.question_rate > 0.4,
        ],
        impliedStats: ["avg_prompt_words", "question_rate"],
        score: (s) => (overThreshold(s.avg_prompt_words, 80) + overThreshold(s.question_rate, 0.4)) / 2,
    },
    {
        id: "speed-runner",
        name: "The Speed Runner",
        tagline: "In and out. No wasted time.",
        conditions: [
            (s) => s.turn_density > 3,
            (s) => s.avg_prompt_words < 20,
        ],
        impliedStats: ["turn_density", "avg_prompt_words"],
        score: (s) => (overThreshold(s.turn_density, 3) + underThreshold(s.avg_prompt_words, 20)) / 2,
    },
    {
        id: "debugger",
        name: "The Debugger",
        tagline: "Tests, fails, fixes, repeats.",
        conditions: [
            (s) => s.failed_tests > 10,
            (s) => s.test_runs > 30,
            (s) => s.failed_tests / Math.max(1, s.test_runs) > 0.15,
        ],
        impliedStats: ["failed_tests", "test_runs"],
        score: (s) => (overThreshold(s.failed_tests, 10) + overThreshold(s.test_runs, 30) +
            overThreshold(s.failed_tests / Math.max(1, s.test_runs), 0.15)) / 3,
    },
    {
        id: "diplomat",
        name: "The Diplomat",
        tagline: "Thanks the AI, trusts the AI.",
        conditions: [
            (s) => s.please_rate > 0.4,
            (s) => s.corrections < 3,
        ],
        impliedStats: ["please_rate", "corrections"],
        score: (s) => (overThreshold(s.please_rate, 0.4) + underThreshold(s.corrections, 3)) / 2,
    },
    {
        id: "architect",
        name: "The Architect",
        tagline: "Reads 5x more than writes.",
        conditions: [
            (s) => s.read_write_ratio > 5,
            (s) => s.avg_prompt_words > 50,
        ],
        impliedStats: ["read_write_ratio", "avg_prompt_words"],
        score: (s) => (overThreshold(s.read_write_ratio, 5) + overThreshold(s.avg_prompt_words, 50)) / 2,
    },
    {
        id: "pair-programmer",
        name: "The Pair Programmer",
        tagline: "Treats the AI like a colleague.",
        conditions: [
            (s) => s.turn_density > 1.5,
            (s) => s.corrections > 10,
        ],
        impliedStats: ["turn_density", "corrections"],
        score: (s) => (overThreshold(s.turn_density, 1.5) + overThreshold(s.corrections, 10)) / 2,
    },
    {
        id: "marathon-runner",
        name: "The Marathon Runner",
        tagline: "Sessions that never end.",
        conditions: [
            (s) => s.total_duration_min / Math.max(1, s.session_count) > 120,
            (s) => s.avg_daily_hours > 4,
        ],
        impliedStats: ["avg_daily_hours"],
        score: (s) => (overThreshold(s.total_duration_min / Math.max(1, s.session_count), 120) +
            overThreshold(s.avg_daily_hours, 4)) / 2,
    },
    {
        id: "scientist",
        name: "The Scientist",
        tagline: "Hypothesize, test, repeat.",
        conditions: [
            (s) => s.test_runs > 50,
            (s) => s.question_rate > 0.3,
            (s) => s.reasoning_rate > 0.1,
        ],
        impliedStats: ["test_runs", "question_rate", "reasoning_rate"],
        score: (s) => (overThreshold(s.test_runs, 50) + overThreshold(s.question_rate, 0.3) +
            overThreshold(s.reasoning_rate, 0.1)) / 3,
    },
    {
        id: "puppeteer",
        name: "The Puppeteer",
        tagline: "Pulls every string.",
        conditions: [
            (s) => s.redirects_per_hour > 5,
            (s) => s.corrections > 15,
            (s) => s.longest_autopilot < 10,
        ],
        impliedStats: ["redirects_per_hour", "corrections", "longest_autopilot"],
        score: (s) => (overThreshold(s.redirects_per_hour, 5) + overThreshold(s.corrections, 15) +
            underThreshold(s.longest_autopilot, 10)) / 3,
    },
    {
        id: "weekend-warrior",
        name: "The Weekend Warrior",
        tagline: "Saves the real coding for Saturday.",
        conditions: [
            (s) => s.weekend_rate > 0.4,
        ],
        impliedStats: ["weekend_rate"],
        score: (s) => overThreshold(s.weekend_rate, 0.4),
    },
    {
        id: "orchestrator",
        name: "The Orchestrator",
        tagline: "Spawns agents like they're threads.",
        conditions: [
            (s) => s.agent_spawns > 10,
            (s) => s.plan_mode_uses > 5,
        ],
        impliedStats: ["agent_spawns", "plan_mode_uses"],
        score: (s) => (overThreshold(s.agent_spawns, 10) + overThreshold(s.plan_mode_uses, 5)) / 2,
    },
    {
        id: "minimalist",
        name: "The Minimalist",
        tagline: "Says less. Gets more.",
        conditions: [
            (s) => s.avg_prompt_words < 12,
            (s) => s.one_word_turn_rate > 0.2,
            (s) => s.total_turns > 100,
        ],
        impliedStats: ["avg_prompt_words", "one_word_turn_rate"],
        score: (s) => (underThreshold(s.avg_prompt_words, 12) + overThreshold(s.one_word_turn_rate, 0.2)) / 2,
    },
    {
        id: "secret-spiller",
        name: "The Secret Spiller",
        tagline: "Accidentally shares everything.",
        conditions: [
            (s) => (s.secret_leaks_user + s.secret_leaks_ai) > 5,
        ],
        impliedStats: ["secret_leaks_user", "secret_leaks_ai"],
        score: (s) => overThreshold(s.secret_leaks_user + s.secret_leaks_ai, 5),
    },
];
export const FALLBACK_ARCHETYPE = {
    id: "vibe-coder",
    name: "The Vibe Coder",
    tagline: "Vibes with the AI.",
    conditions: [],
    impliedStats: [],
    score: () => 0,
};
// ─── Modifier Traits ─────────────────────────────────────────────────────
export const MODIFIER_TRAITS = [
    {
        id: "says-please",
        phrase: "who says please",
        condition: (s) => s.please_rate > 0.3,
        statKey: "please_rate",
        score: (s) => overThreshold(s.please_rate, 0.3),
    },
    {
        id: "codes-at-3am",
        phrase: "who codes at 3am",
        condition: (s) => s.late_night_rate > 0.5,
        statKey: "late_night_rate",
        score: (s) => overThreshold(s.late_night_rate, 0.5),
    },
    {
        id: "reads-5x-more",
        phrase: "who reads 5x more than writes",
        condition: (s) => s.read_write_ratio > 5,
        statKey: "read_write_ratio",
        score: (s) => overThreshold(s.read_write_ratio, 5),
    },
    {
        id: "never-tests",
        phrase: "who never tests",
        condition: (s) => s.test_runs === 0,
        statKey: "test_runs",
        score: (s) => s.test_runs === 0 ? 1 : 0,
    },
    {
        id: "cusses-under-pressure",
        phrase: "who cusses under pressure",
        condition: (s) => s.expletives > 5,
        statKey: "expletives",
        score: (s) => overThreshold(s.expletives, 5),
    },
    {
        id: "writes-essays",
        phrase: "who writes essays for prompts",
        condition: (s) => s.avg_prompt_words > 100,
        statKey: "avg_prompt_words",
        score: (s) => overThreshold(s.avg_prompt_words, 100),
    },
    {
        id: "lets-ai-cook",
        phrase: "who lets the AI cook",
        condition: (s) => s.longest_autopilot > 20,
        statKey: "longest_autopilot",
        score: (s) => overThreshold(s.longest_autopilot, 20),
    },
    {
        id: "asks-more-than-tells",
        phrase: "who asks more than tells",
        condition: (s) => s.question_rate > 0.5,
        statKey: "question_rate",
        score: (s) => overThreshold(s.question_rate, 0.5),
    },
    {
        id: "scope-creeps",
        phrase: "who scope-creeps every session",
        condition: (s) => s.scope_creep > 3,
        statKey: "scope_creep",
        score: (s) => overThreshold(s.scope_creep, 3),
    },
    {
        id: "ships-on-weekends",
        phrase: "who ships on weekends",
        condition: (s) => s.weekend_rate > 0.3,
        statKey: "weekend_rate",
        score: (s) => overThreshold(s.weekend_rate, 0.3),
    },
    {
        id: "spawns-agents",
        phrase: "who spawns agents for everything",
        condition: (s) => s.agent_spawns > 10,
        statKey: "agent_spawns",
        score: (s) => overThreshold(s.agent_spawns, 10),
    },
    {
        id: "plans-first",
        phrase: "who plans before coding",
        condition: (s) => s.plan_mode_uses > 5,
        statKey: "plan_mode_uses",
        score: (s) => overThreshold(s.plan_mode_uses, 5),
    },
    {
        id: "interrupts-often",
        phrase: "who interrupts mid-thought",
        condition: (s) => s.interruptions > 10,
        statKey: "interruptions",
        score: (s) => overThreshold(s.interruptions, 10),
    },
    {
        id: "marathon-sessions",
        phrase: "who codes for hours straight",
        condition: (s) => s.avg_daily_hours > 5,
        statKey: "avg_daily_hours",
        score: (s) => overThreshold(s.avg_daily_hours, 5),
    },
    {
        id: "one-word-prompts",
        phrase: "who speaks in commands",
        condition: (s) => s.one_word_turn_rate > 0.25,
        statKey: "one_word_turn_rate",
        score: (s) => overThreshold(s.one_word_turn_rate, 0.25),
    },
    {
        id: "leaks-secrets",
        phrase: "who leaks secrets to the AI",
        condition: (s) => s.secret_leaks_user > 3,
        statKey: "secret_leaks_user",
        score: (s) => overThreshold(s.secret_leaks_user, 3),
    },
];
// ─── Matching Algorithm ──────────────────────────────────────────────────
export function matchArchetype(stats) {
    // 1. Score all primaries where ALL conditions pass
    let bestPrimary = null;
    let bestScore = -1;
    for (const archetype of PRIMARY_ARCHETYPES) {
        const allPass = archetype.conditions.every((cond) => cond(stats));
        if (!allPass)
            continue;
        const score = archetype.score(stats);
        if (score > bestScore) {
            bestScore = score;
            bestPrimary = archetype;
        }
    }
    const primary = bestPrimary ?? FALLBACK_ARCHETYPE;
    // 2. Pick best modifier, excluding stats implied by the primary
    const impliedStats = new Set(primary.impliedStats);
    let bestModifier = null;
    let bestModScore = -1;
    for (const modifier of MODIFIER_TRAITS) {
        if (impliedStats.has(modifier.statKey))
            continue;
        if (!modifier.condition(stats))
            continue;
        const score = modifier.score(stats);
        if (score > bestModScore) {
            bestModScore = score;
            bestModifier = modifier;
        }
    }
    // 3. Compose headline
    const headline = bestModifier
        ? `${primary.name} ${bestModifier.phrase}`
        : primary.name;
    return { primary, modifier: bestModifier, headline };
}
//# sourceMappingURL=archetypes.js.map