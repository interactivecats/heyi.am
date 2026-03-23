import { describe, it, expect } from "vitest";
import { matchArchetype, PRIMARY_ARCHETYPES, MODIFIER_TRAITS, } from "./archetypes.js";
/** Create a VibeStats with all zeros, then override specific fields */
function makeStats(overrides = {}) {
    return {
        expletives: 0,
        corrections: 0,
        please_rate: 0,
        avg_prompt_words: 30,
        longest_prompt_words: 50,
        question_rate: 0,
        one_word_turn_rate: 0,
        reasoning_rate: 0,
        late_night_rate: 0,
        weekend_rate: 0,
        apologies: 0,
        read_write_ratio: 2,
        test_runs: 1,
        failed_tests: 0,
        longest_tool_chain: 0,
        self_corrections: 0,
        bash_commands: 0,
        override_success_rate: 0,
        longest_autopilot: 0,
        first_blood_min: 0,
        redirects_per_hour: 0,
        turn_density: 1,
        scope_creep: 0,
        interruptions: 0,
        secret_leaks_user: 0,
        secret_leaks_ai: 0,
        plan_mode_uses: 0,
        agent_spawns: 0,
        avg_daily_hours: 0,
        total_turns: 100,
        session_count: 5,
        total_duration_min: 60,
        sources: ["claude"],
        source_breakdown: { claude: 5 },
        ...overrides,
    };
}
// ─── Primary archetype matching ──────────────────────────────────────────
describe("Primary archetypes", () => {
    it("matches Night Owl", () => {
        const stats = makeStats({ late_night_rate: 0.5 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("night-owl");
    });
    it("matches Backseat Driver", () => {
        const stats = makeStats({ corrections: 15, override_success_rate: 0.8 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("backseat-driver");
    });
    it("matches Delegator", () => {
        const stats = makeStats({ longest_autopilot: 25, redirects_per_hour: 0.5 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("delegator");
    });
    it("matches Cowboy", () => {
        const stats = makeStats({ read_write_ratio: 0.8, bash_commands: 80 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("cowboy");
    });
    it("matches Overthinker", () => {
        const stats = makeStats({ avg_prompt_words: 120, question_rate: 0.6 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("overthinker");
    });
    it("matches Speed Runner", () => {
        const stats = makeStats({ turn_density: 5, avg_prompt_words: 10 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("speed-runner");
    });
    it("matches Debugger", () => {
        const stats = makeStats({ failed_tests: 25, test_runs: 80 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("debugger");
    });
    it("matches Diplomat", () => {
        const stats = makeStats({ please_rate: 0.6, corrections: 1 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("diplomat");
    });
    it("matches Architect", () => {
        const stats = makeStats({ read_write_ratio: 8, avg_prompt_words: 70 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("architect");
    });
    it("matches Pair Programmer", () => {
        const stats = makeStats({ turn_density: 2.5, corrections: 15 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("pair-programmer");
    });
    it("falls back to Vibe Coder when nothing qualifies", () => {
        const stats = makeStats(); // all defaults, no thresholds met
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("vibe-coder");
        expect(match.primary.name).toBe("The Vibe Coder");
    });
});
// ─── Scoring: picks strongest match ──────────────────────────────────────
describe("Scoring picks strongest primary", () => {
    it("picks the archetype with higher score when multiple qualify", () => {
        // Night Owl barely qualifies, Diplomat strongly qualifies
        const stats = makeStats({
            late_night_rate: 0.31,
            please_rate: 0.9,
            corrections: 0,
        });
        const match = matchArchetype(stats);
        // Diplomat score: overThreshold(0.9, 0.4) + underThreshold(0, 3) = 1.25 + 1 = 2.25/2
        // Night Owl score: overThreshold(0.31, 0.3) ≈ 0.033
        expect(match.primary.id).toBe("diplomat");
    });
});
// ─── Modifier traits ─────────────────────────────────────────────────────
describe("Modifier traits", () => {
    it("adds 'who says please' modifier", () => {
        // Set corrections high enough to disqualify Diplomat (needs corrections < 3)
        const stats = makeStats({ please_rate: 0.5, corrections: 5 });
        // No primary qualifies → Vibe Coder + modifier
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("vibe-coder");
        expect(match.modifier?.id).toBe("says-please");
        expect(match.headline).toBe("The Vibe Coder who says please");
    });
    it("adds 'who codes at 3am' modifier", () => {
        // Diplomat qualifies: please_rate > 0.4, corrections < 3
        // Night Owl also qualifies but Diplomat must score higher
        // Set Diplomat very strong so it wins over Night Owl
        const stats = makeStats({ late_night_rate: 0.6, please_rate: 0.95, corrections: 0 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("diplomat");
        // Diplomat implies please_rate + corrections; "codes at 3am" uses late_night_rate — not excluded
        expect(match.modifier?.id).toBe("codes-at-3am");
    });
    it("adds 'who never tests' modifier", () => {
        const stats = makeStats({ test_runs: 0 });
        const match = matchArchetype(stats);
        expect(match.modifier?.id).toBe("never-tests");
    });
    it("adds 'who cusses under pressure' modifier", () => {
        const stats = makeStats({ expletives: 12 });
        const match = matchArchetype(stats);
        expect(match.modifier?.id).toBe("cusses-under-pressure");
    });
    it("adds 'who writes essays' modifier", () => {
        const stats = makeStats({ avg_prompt_words: 150 });
        const match = matchArchetype(stats);
        expect(match.modifier?.id).toBe("writes-essays");
    });
    it("adds 'who lets the AI cook' modifier", () => {
        // Use Night Owl as primary. Autopilot 25 qualifies "lets AI cook" modifier (>20)
        // but Delegator also needs autopilot>15 AND redirects_per_hour<2.
        // Set redirects_per_hour high to disqualify Delegator.
        const stats = makeStats({ late_night_rate: 0.5, longest_autopilot: 25, redirects_per_hour: 5 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("night-owl");
        expect(match.modifier?.id).toBe("lets-ai-cook");
    });
    it("adds 'who scope-creeps every session' modifier", () => {
        const stats = makeStats({ scope_creep: 8 });
        const match = matchArchetype(stats);
        expect(match.modifier?.id).toBe("scope-creeps");
    });
    it("adds 'who ships on weekends' modifier", () => {
        const stats = makeStats({ weekend_rate: 0.5 });
        const match = matchArchetype(stats);
        expect(match.modifier?.id).toBe("ships-on-weekends");
    });
});
// ─── Modifier exclusion logic ────────────────────────────────────────────
describe("Modifier exclusion", () => {
    it("excludes 'who codes at 3am' when primary is Night Owl (same stat)", () => {
        const stats = makeStats({ late_night_rate: 0.7 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("night-owl");
        // "codes at 3am" uses late_night_rate which is implied by Night Owl
        expect(match.modifier?.id).not.toBe("codes-at-3am");
    });
    it("excludes 'who says please' when primary is Diplomat", () => {
        const stats = makeStats({ please_rate: 0.6, corrections: 1 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("diplomat");
        // Diplomat implies please_rate
        expect(match.modifier?.id).not.toBe("says-please");
    });
    it("excludes 'who reads 5x more' when primary is Architect", () => {
        const stats = makeStats({ read_write_ratio: 8, avg_prompt_words: 70 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("architect");
        expect(match.modifier?.id).not.toBe("reads-5x-more");
    });
    it("excludes 'who lets the AI cook' when primary is Delegator", () => {
        const stats = makeStats({ longest_autopilot: 25, redirects_per_hour: 0.5 });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("delegator");
        expect(match.modifier?.id).not.toBe("lets-ai-cook");
    });
});
// ─── Headline composition ────────────────────────────────────────────────
describe("Headline composition", () => {
    it("composes primary + modifier headline", () => {
        const stats = makeStats({
            late_night_rate: 0.5,
            expletives: 10,
        });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("night-owl");
        expect(match.modifier?.id).toBe("cusses-under-pressure");
        expect(match.headline).toBe("The Night Owl who cusses under pressure");
    });
    it("returns primary name only when no modifier qualifies", () => {
        const stats = makeStats({ late_night_rate: 0.5 });
        // Night Owl qualifies, late_night_rate excluded from modifiers.
        // With test_runs: 1 in defaults, no other modifier qualifies.
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("night-owl");
        expect(match.headline).toBe("The Night Owl");
        expect(match.modifier).toBeNull();
    });
    it("returns 'The Vibe Coder' with 'who never tests' for zero-test stats", () => {
        const stats = makeStats({
            avg_prompt_words: 0,
            read_write_ratio: 0,
            turn_density: 0,
            test_runs: 0,
        });
        const match = matchArchetype(stats);
        expect(match.primary.id).toBe("vibe-coder");
        // test_runs: 0 qualifies "who never tests"
        expect(match.modifier?.id).toBe("never-tests");
    });
});
// ─── Edge cases ──────────────────────────────────────────────────────────
describe("Edge cases", () => {
    it("handles extreme values without crashing", () => {
        const stats = makeStats({
            expletives: 999,
            corrections: 500,
            please_rate: 1,
            avg_prompt_words: 1000,
            question_rate: 1,
            late_night_rate: 1,
            weekend_rate: 1,
            read_write_ratio: 100,
            test_runs: 200,
            failed_tests: 100,
            longest_autopilot: 500,
            bash_commands: 1000,
            turn_density: 50,
            scope_creep: 100,
            override_success_rate: 1,
        });
        const match = matchArchetype(stats);
        expect(match.primary).toBeDefined();
        expect(match.headline).toBeTruthy();
    });
    it("all 10 primaries have unique IDs", () => {
        const ids = PRIMARY_ARCHETYPES.map((a) => a.id);
        expect(new Set(ids).size).toBe(10);
    });
    it("all 10 modifiers have unique IDs", () => {
        const ids = MODIFIER_TRAITS.map((m) => m.id);
        expect(new Set(ids).size).toBe(10);
    });
    it("conditions fail partially — only all-pass archetypes qualify", () => {
        // Backseat Driver needs corrections > 10 AND override_success_rate > 0.6
        // Only corrections qualifies
        const stats = makeStats({ corrections: 15, override_success_rate: 0.3 });
        const match = matchArchetype(stats);
        expect(match.primary.id).not.toBe("backseat-driver");
    });
});
//# sourceMappingURL=archetypes.test.js.map