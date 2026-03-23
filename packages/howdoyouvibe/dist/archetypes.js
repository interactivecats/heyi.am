// ─── Helpers ─────────────────────────────────────────────────────────────
/** How far above a threshold a value is, as a ratio. 0 = at threshold, 1 = double. */
function overThreshold(value, threshold) {
    if (threshold === 0)
        return value > 0 ? value : 0;
    return Math.max(0, (value - threshold) / threshold);
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
            (s) => s.one_word_turn_rate > 0.3,
        ],
        impliedStats: ["longest_autopilot", "one_word_turn_rate"],
        score: (s) => (overThreshold(s.longest_autopilot, 15) + overThreshold(s.one_word_turn_rate, 0.3)) / 2,
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
            (s) => s.failed_tests > 3,
            (s) => s.test_runs > 5,
        ],
        impliedStats: ["failed_tests", "test_runs"],
        score: (s) => (overThreshold(s.failed_tests, 3) + overThreshold(s.test_runs, 5)) / 2,
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