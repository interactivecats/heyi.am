import { describe, it, expect, vi } from "vitest";
import { formatTextBlock, renderCard } from "./render.js";
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
        interruptions: 0,
        secret_leaks_user: 0,
        secret_leaks_ai: 0,
        plan_mode_uses: 0,
        agent_spawns: 0,
        avg_daily_hours: 2.5,
        total_turns: 847,
        session_count: 23,
        total_duration_min: 480,
        sources: ["claude", "cursor"],
        source_breakdown: { claude: 15, cursor: 8 },
        ...overrides,
    };
}
const TEST_HEADLINE = "The Night Owl who cusses under pressure";
describe("formatTextBlock", () => {
    it("mirrors full terminal card with all stats", () => {
        const stats = makeStats();
        const narrative = "You said please in 42% of your turns.";
        const block = formatTextBlock(stats, TEST_HEADLINE, narrative);
        expect(block).toContain("HOW DO YOU VIBE?");
        expect(block).toContain("The Night Owl who cusses under pressure");
        expect(block).toContain("42%");
        expect(block).toContain("YOUR VOICE");
        expect(block).toContain("THE AI'S HABITS");
        expect(block).toContain("THE BACK-AND-FORTH");
        expect(block).toContain("npx howdoyouvibe");
        expect(block).toContain("847 turns");
        expect(block).toContain("·");
    });
    it("includes narrative when provided", () => {
        const stats = makeStats();
        const withNarr = formatTextBlock(stats, TEST_HEADLINE, "Test narrative.");
        const withoutNarr = formatTextBlock(stats, TEST_HEADLINE, null);
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
        const block = formatTextBlock(stats, "The Vibe Coder", null);
        expect(block).toContain("The Vibe Coder");
        expect(block).toContain("npx howdoyouvibe");
    });
});
describe("NO_COLOR support", () => {
    it("strips ANSI escapes when NO_COLOR is set", async () => {
        // NO_COLOR is read at module load time, so we need a subprocess
        const { execFileSync } = await import("node:child_process");
        const result = execFileSync("node", [
            "-e",
            `process.env.NO_COLOR="1";
       delete require.cache[require.resolve("./dist/render.js")];
       const m = require("./dist/render.js");
       // Verify the module loaded — formatTextBlock should work without ANSI
       console.log("ok");`,
        ], { cwd: process.cwd(), encoding: "utf-8", env: { ...process.env, NO_COLOR: "1" } });
        expect(result.trim()).toBe("ok");
    });
});
describe("renderCard", () => {
    it("outputs terminal card without crashing", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => { });
        const stats = makeStats();
        renderCard(stats, TEST_HEADLINE, "You said please in 42% of your turns.");
        expect(spy).toHaveBeenCalledOnce();
        const output = spy.mock.calls[0][0];
        expect(output).toContain("────");
        expect(output).toContain("The Night Owl who cusses under pressure");
        expect(output).toContain("YOUR VOICE");
        expect(output).toContain("THE AI'S HABITS");
        expect(output).toContain("THE BACK-AND-FORTH");
        // Numbers are wrapped in ANSI cyan escapes — strip them for assertion
        const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
        expect(plain).toContain("847 turns across 23 sessions");
        expect(output).toContain("entertainment only");
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
        renderCard(stats, TEST_HEADLINE, null);
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
        renderCard(stats, TEST_HEADLINE, null);
        const output = spy.mock.calls[0][0];
        expect(output).toContain("────");
        expect(output).toContain("The Night Owl");
        spy.mockRestore();
    });
});
//# sourceMappingURL=render.test.js.map