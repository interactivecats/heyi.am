import { describe, it, expect, vi } from "vitest";
import { formatTextBlock, renderCard } from "./render.js";
import { FALLBACK_ARCHETYPE } from "./archetypes.js";
function makeStats(overrides = {}) {
    return {
        expletives: 14,
        corrections: 23,
        please_rate: 0.42,
        avg_prompt_words: 47,
        longest_prompt_words: 200,
        question_rate: 0.31,
        one_word_turn_rate: 0.1,
        reasoning_rate: 0.15,
        late_night_rate: 0.62,
        weekend_rate: 0.2,
        apologies: 7,
        read_write_ratio: 4.2,
        test_runs: 12,
        failed_tests: 4,
        longest_tool_chain: 8,
        self_corrections: 3,
        bash_commands: 45,
        override_success_rate: 0.75,
        longest_autopilot: 23,
        first_blood_min: 4,
        redirects_per_hour: 2.3,
        turn_density: 1.8,
        scope_creep: 2,
        total_turns: 847,
        session_count: 23,
        total_duration_min: 480,
        sources: ["claude", "cursor"],
        source_breakdown: { claude: 15, cursor: 8 },
        ...overrides,
    };
}
function makeMatch(headline = "The Night Owl who cusses under pressure") {
    return {
        primary: {
            id: "night-owl",
            name: "The Night Owl",
            tagline: "Codes when the world sleeps.",
            conditions: [],
            impliedStats: [],
            score: () => 1,
        },
        modifier: {
            id: "cusses-under-pressure",
            phrase: "who cusses under pressure",
            condition: () => true,
            statKey: "expletives",
            score: () => 1,
        },
        headline,
    };
}
describe("formatTextBlock", () => {
    it("mirrors full terminal card with all stats", () => {
        const stats = makeStats();
        const match = makeMatch();
        const narrative = "You said please in 42% of your turns.";
        const block = formatTextBlock(stats, match, narrative);
        // Has the full card structure
        expect(block).toContain("HOW DO YOU VIBE?");
        expect(block).toContain("The Night Owl who cusses under pressure");
        expect(block).toContain("42%");
        expect(block).toContain("Your Voice");
        expect(block).toContain("The AI's Habits");
        expect(block).toContain("The Back-and-forth");
        expect(block).toContain("npx howdoyouvibe");
        expect(block).toContain("847 turns");
        // Has box-drawing line
        expect(block).toContain("────");
    });
    it("includes narrative when provided", () => {
        const stats = makeStats();
        const match = makeMatch();
        const withNarr = formatTextBlock(stats, match, "Test narrative.");
        const withoutNarr = formatTextBlock(stats, match, null);
        expect(withNarr).toContain("Test narrative.");
        expect(withoutNarr).not.toContain("Test narrative.");
    });
    it("handles all-zero stats gracefully", () => {
        const stats = makeStats({
            expletives: 0,
            corrections: 0,
            please_rate: 0,
            override_success_rate: 0,
            read_write_ratio: 0,
            late_night_rate: 0,
            longest_autopilot: 0,
            scope_creep: 0,
        });
        const match = {
            primary: FALLBACK_ARCHETYPE,
            modifier: null,
            headline: "The Vibe Coder",
        };
        const block = formatTextBlock(stats, match, null);
        expect(block).toContain("The Vibe Coder");
        expect(block).toContain("npx howdoyouvibe");
    });
});
describe("renderCard", () => {
    it("outputs terminal card without crashing", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => { });
        const stats = makeStats();
        const match = makeMatch();
        renderCard(stats, match, "You said please in 42% of your turns.");
        expect(spy).toHaveBeenCalledOnce();
        const output = spy.mock.calls[0][0];
        expect(output).toContain("────");
        expect(output).toContain("The Night Owl who cusses under pressure");
        expect(output).toContain("Your Voice");
        expect(output).toContain("The AI's Habits");
        expect(output).toContain("The Back-and-forth");
        expect(output).toContain("847 turns across 23 sessions");
        expect(output).toContain("All analysis ran locally");
        spy.mockRestore();
    });
    it("hides zero stats", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => { });
        const stats = makeStats({
            expletives: 0,
            scope_creep: 0,
            apologies: 0,
            self_corrections: 0,
        });
        const match = makeMatch();
        renderCard(stats, match, null);
        const output = spy.mock.calls[0][0];
        expect(output).not.toContain("Expletives:");
        expect(output).not.toContain("Scope creep:");
        expect(output).not.toContain("Apologies:");
        expect(output).not.toContain("Self-corrections:");
        spy.mockRestore();
    });
    it("renders without narrative", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => { });
        const stats = makeStats();
        const match = makeMatch();
        renderCard(stats, match, null);
        const output = spy.mock.calls[0][0];
        expect(output).toContain("────");
        expect(output).toContain("The Night Owl");
        spy.mockRestore();
    });
});
//# sourceMappingURL=render.test.js.map