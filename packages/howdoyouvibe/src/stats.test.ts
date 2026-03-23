import { describe, it, expect } from "vitest";
import { _patterns, computeVibeStats } from "./stats.js";
import type { RawEntry, SessionAnalysis } from "./parsers/types.js";
import type { ParsedSession } from "./types.js";

const {
  EXPLETIVE_RE,
  CORRECTION_START_RE,
  CORRECTION_PHRASE_RE,
  POLITE_RE,
  REASONING_RE,
  TEST_CMD_RE,
  SCOPE_CREEP_RE,
  APOLOGY_RE,
} = _patterns;

// ─── Regex pattern tests ─────────────────────────────────────────────────

describe("EXPLETIVE_RE", () => {
  // True positives
  it.each([
    "shit", "shitty", "bullshit",
    "fuck", "fucking", "fucked", "fucks",
    "damn", "damnit", "dammit",
    "wtf", "wth", "ffs",
    "crap", "crappy",
    "asshole",
    "what the hell",
  ])("matches: %s", (text) => {
    expect(EXPLETIVE_RE.test(text)).toBe(true);
    EXPLETIVE_RE.lastIndex = 0;
  });

  // False positives that MUST NOT match
  it.each([
    "class", "classify", "classical",
    "assembly", "assemble",
    "assertion", "assert",
    "assign", "assignment",
    "asset", "assets",
    "associate", "association",
    "assume", "assumption",
    "shell", "hello",
    "grass", "bassist", "brass", "harass",
  ])("does NOT match: %s", (text) => {
    EXPLETIVE_RE.lastIndex = 0;
    expect(EXPLETIVE_RE.test(text)).toBe(false);
  });

  it("counts multiple expletives in one message", () => {
    const text = "what the fuck, this is bullshit";
    const matches = text.match(new RegExp(EXPLETIVE_RE.source, EXPLETIVE_RE.flags));
    expect(matches).toHaveLength(2);
  });
});

describe("CORRECTION_START_RE", () => {
  // True positives
  it.each([
    "no, that's not what I meant",
    "No that's wrong",
    "no!",
    "no",
    "stop, don't do that",
    "stop!",
    "stop",
    "actually, I want something else",
    "wait, let me think",
  ])("matches: %s", (text) => {
    expect(CORRECTION_START_RE.test(text)).toBe(true);
  });

  // False positives
  it.each([
    "I have no idea",
    "there is no way",
    "it's actually fine",
    "let's not stop here",
    "the answer is no longer relevant",
    "I noticed the stop function",
    "can you also wait for the response",
  ])("does NOT match: %s", (text) => {
    expect(CORRECTION_START_RE.test(text)).toBe(false);
  });
});

describe("CORRECTION_PHRASE_RE", () => {
  it.each([
    "that's wrong, try again",
    "that's not right",
    "that's not what I asked",
    "that's not what I meant",
    "not what I wanted here",
    "undo that please",
    "revert that change",
    "go back to the previous version",
    "I said use TypeScript",
    "I meant the other file",
    "don't do that",
    "wrong file, try src/index.ts",
    "wrong approach",
  ])("matches: %s", (text) => {
    expect(CORRECTION_PHRASE_RE.test(text)).toBe(true);
  });
});

describe("POLITE_RE", () => {
  it.each([
    "please fix this",
    "can you please help",
    "thank you for that",
    "thanks!",
    "thx",
    "thank u",
  ])("matches: %s", (text) => {
    expect(POLITE_RE.test(text)).toBe(true);
  });

  it.each([
    "pleasing result",
    "thanksgiving",
    "thankless task",
  ])("does NOT match: %s", (text) => {
    expect(POLITE_RE.test(text)).toBe(false);
  });
});

describe("REASONING_RE", () => {
  it.each([
    "because I think it's better",
    "the trade-off here is",
    "the tradeoff is worth it",
    "instead of using a map",
    "my approach would be",
    "I think we should",
    "the reason is simple",
    "I'd rather use streams",
    "Because the API is slow",
    "ok. because it might break",
    "the downside of that",
    "pros and cons of each",
  ])("matches: %s", (text) => {
    expect(REASONING_RE.test(text)).toBe(true);
  });

  it.each([
    "the build failed because of a missing dep",
    "error: because is not defined",
  ])("does NOT match mid-sentence 'because' without multi-word: %s", (text) => {
    expect(REASONING_RE.test(text)).toBe(false);
  });
});

describe("TEST_CMD_RE", () => {
  it.each([
    "npm test",
    "npx vitest",
    "npx jest",
    "pytest",
    "mix test",
    "cargo test",
    "go test ./...",
    "make test",
    "bun test",
    "yarn test",
    "test",
  ])("matches: %s", (text) => {
    expect(TEST_CMD_RE.test(text)).toBe(true);
  });

  it.each([
    "echo test123",
    "testify",
    "contest",
    "latest",
    "testing the connection",
  ])("does NOT match: %s", (text) => {
    TEST_CMD_RE.lastIndex = 0;
    expect(TEST_CMD_RE.test(text)).toBe(false);
  });
});

describe("SCOPE_CREEP_RE", () => {
  it.each([
    "while we're at it, fix the tests",
    "one more thing — can you add logging",
    "before I forget, also update the README",
    "actually can you also rename the function",
    "wait, also change the import",
    "oh and add a comment there",
    "oh also do the other file",
    "also, fix the types",
    "also: please do X",
  ])("matches: %s", (text) => {
    SCOPE_CREEP_RE.lastIndex = 0;
    expect(SCOPE_CREEP_RE.test(text)).toBe(true);
  });

  it.each([
    "I also noticed a typo",
    "this also affects the other module",
    "it's also worth noting",
    "you should also test edge cases",
  ])("does NOT match mid-sentence 'also': %s", (text) => {
    SCOPE_CREEP_RE.lastIndex = 0;
    expect(SCOPE_CREEP_RE.test(text)).toBe(false);
  });
});

describe("APOLOGY_RE", () => {
  it.each([
    "I'm sorry about that",
    "I apologize for the confusion",
    "My apologies",
    "sorry, let me fix that",
    "my mistake, I'll correct it",
    "my bad",
  ])("matches: %s", (text) => {
    expect(APOLOGY_RE.test(text)).toBe(true);
  });

  it.each([
    "the sorry state of affairs",
  ])("matches even in context: %s", (text) => {
    // "sorry" as a word is still an apology signal
    expect(APOLOGY_RE.test(text)).toBe(true);
  });
});

// ─── Integration: computeVibeStats ───────────────────────────────────────

function makeEntry(type: string, content: string | Record<string, unknown>[], timestamp?: string): RawEntry {
  const ts = timestamp ?? "2025-03-15T14:30:00Z";
  if (typeof content === "string") {
    return {
      type,
      uuid: `test-${Math.random().toString(36).slice(2)}`,
      timestamp: ts,
      sessionId: "test-session",
      message: { role: type === "user" ? "user" : "assistant", content },
    };
  }
  return {
    type,
    uuid: `test-${Math.random().toString(36).slice(2)}`,
    timestamp: ts,
    sessionId: "test-session",
    message: { role: type === "user" ? "user" : "assistant", content: content as any },
  };
}

function makeToolEntry(toolName: string, input: Record<string, unknown>, timestamp?: string): RawEntry {
  return makeEntry("assistant", [
    { type: "tool_use", id: `tool-${Math.random().toString(36).slice(2)}`, name: toolName, input },
  ], timestamp);
}

function makeSession(entries: RawEntry[], durationMs = 600_000): ParsedSession {
  const timestamps = entries
    .filter(e => e.timestamp)
    .map(e => new Date(e.timestamp).getTime());

  return {
    source: "claude",
    analysis: {
      source: "claude",
      turns: Math.floor(entries.filter(e => e.type === "assistant").length),
      tool_calls: [],
      files_touched: [],
      duration_ms: durationMs,
      wall_clock_ms: durationMs,
      loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
      raw_entries: entries,
      start_time: entries[0]?.timestamp ?? null,
      end_time: entries[entries.length - 1]?.timestamp ?? null,
    },
  };
}

describe("computeVibeStats", () => {
  it("computes basic stats from a simple conversation", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "please help me fix this bug"),
      makeEntry("assistant", "I'll take a look at that."),
      makeEntry("user", "thanks, that worked!"),
      makeEntry("assistant", "Glad I could help."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.total_turns).toBe(2);
    expect(stats.session_count).toBe(1);
    expect(stats.please_rate).toBeGreaterThan(0);
    expect(stats.expletives).toBe(0);
  });

  it("counts expletives in user messages only", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "this is fucking broken, what the hell"),
      makeEntry("assistant", "I'm sorry about that, let me fix it."),
      makeEntry("user", "damn, the tests are still failing"),
      makeEntry("assistant", "Let me try again."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    // "fucking" + "hell" + "damn" = 3
    expect(stats.expletives).toBe(3);
    expect(stats.apologies).toBe(1);
  });

  it("detects corrections after assistant turns", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "fix the login page"),
      makeToolEntry("Edit", { file_path: "login.ts", old_string: "a", new_string: "b" }),
      makeEntry("user", "no, that's wrong. Use the other approach"),
      makeEntry("assistant", "Let me try a different approach."),
      makeToolEntry("Edit", { file_path: "login.ts", old_string: "b", new_string: "c" }),
      makeEntry("user", "that's not what I asked for"),
      makeEntry("assistant", "I understand, let me reconsider."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.corrections).toBe(2);
  });

  it("does NOT count 'no' mid-sentence as correction", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "start the project"),
      makeEntry("assistant", "Sure, I'll set it up."),
      makeEntry("user", "I have no preference on the framework"),
      makeEntry("assistant", "OK, I'll pick one."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.corrections).toBe(0);
  });

  it("computes late night and weekend rates", () => {
    // Use local time offsets to avoid timezone issues in tests.
    // Create dates at specific local hours.
    const lateNight1 = new Date(2025, 2, 15, 23, 0, 0); // Sat 11pm local
    const lateNight2 = new Date(2025, 2, 16, 2, 0, 0);  // Sun 2am local
    const daytime   = new Date(2025, 2, 17, 10, 0, 0);   // Mon 10am local

    const entries: RawEntry[] = [
      makeEntry("user", "fix this", lateNight1.toISOString()),
      makeEntry("assistant", "On it.", lateNight1.toISOString()),
      makeEntry("user", "another fix", lateNight2.toISOString()),
      makeEntry("assistant", "Done.", lateNight2.toISOString()),
      makeEntry("user", "review this", daytime.toISOString()),
      makeEntry("assistant", "Looks good.", daytime.toISOString()),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    // 2 of 3 user turns are late night (23:00 and 02:00)
    expect(stats.late_night_rate).toBeCloseTo(0.67, 1);
    // 2 of 3 user turns are weekend (Sat + Sun)
    expect(stats.weekend_rate).toBeCloseTo(0.67, 1);
  });

  it("computes read:write ratio from tool calls", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "read and update the config"),
      makeToolEntry("Read", { file_path: "config.ts" }),
      makeToolEntry("Read", { file_path: "utils.ts" }),
      makeToolEntry("Grep", { pattern: "export" }),
      makeToolEntry("Glob", { pattern: "*.ts" }),
      makeToolEntry("Edit", { file_path: "config.ts", old_string: "a", new_string: "b" }),
      makeEntry("user", "looks good"),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    // 4 reads (Read + Read + Grep + Glob) / 1 write (Edit) = 4.0
    expect(stats.read_write_ratio).toBe(4);
  });

  it("detects test runs and failures", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "run the tests"),
      makeToolEntry("Bash", { command: "npm test" }),
      makeEntry("user", [
        { type: "tool_result", tool_use_id: "t1", content: "FAILED: 2 tests failed" },
      ]),
      makeToolEntry("Edit", { file_path: "fix.ts", old_string: "a", new_string: "b" }),
      makeToolEntry("Bash", { command: "npm test" }),
      makeEntry("user", [
        { type: "tool_result", tool_use_id: "t2", content: "All tests passed" },
      ]),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.test_runs).toBe(2);
    expect(stats.failed_tests).toBe(1);
    expect(stats.bash_commands).toBe(2);
  });

  it("computes longest autopilot and tool chain", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "set up the project"),
      makeToolEntry("Read", { file_path: "a.ts" }),
      makeToolEntry("Edit", { file_path: "a.ts", old_string: "x", new_string: "y" }),
      makeToolEntry("Read", { file_path: "b.ts" }),
      makeEntry("assistant", "I've updated both files."),
      makeToolEntry("Bash", { command: "npm run build" }),
      makeEntry("user", "great, thanks"),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    // 5 consecutive assistant entries (3 tools + 1 text + 1 tool)
    expect(stats.longest_autopilot).toBe(5);
    // Tool chain: 3 tools, then text resets? No — tool chain counts
    // consecutive tool_use blocks across assistant entries.
    // Actually: Read(1) + Edit(2) + Read(3) + text(still assistant, chain continues with 3)
    // + Bash(4). But the text entry has no tool_use, so chain isn't reset until user turn.
    // The chain counter increments per tool_use block, resets on user turn.
    expect(stats.longest_tool_chain).toBe(4);
  });

  it("detects self-corrections (AI admits mistake + re-edits same file)", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "fix the component"),
      makeToolEntry("Edit", { file_path: "comp.tsx", old_string: "a", new_string: "b" }),
      // AI realizes it made a mistake
      makeEntry("assistant", "That's not right, let me fix that."),
      makeToolEntry("Edit", { file_path: "comp.tsx", old_string: "b", new_string: "c" }),
      makeEntry("user", "ok"),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.self_corrections).toBe(1);
  });

  it("does NOT count normal re-edits as self-corrections", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "fix the component"),
      makeToolEntry("Edit", { file_path: "comp.tsx", old_string: "a", new_string: "b" }),
      // AI edits same file again but doesn't admit a mistake
      makeEntry("assistant", "Now I'll add the props."),
      makeToolEntry("Edit", { file_path: "comp.tsx", old_string: "b", new_string: "c" }),
      makeEntry("user", "ok"),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.self_corrections).toBe(0);
  });

  it("computes scope creep count", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "fix the login bug"),
      makeEntry("assistant", "Fixed."),
      makeEntry("user", "oh and also add a loading spinner"),
      makeEntry("assistant", "Added."),
      makeEntry("user", "while we're at it, refactor the auth module"),
      makeEntry("assistant", "Done."),
      makeEntry("user", "one more thing — add error handling"),
      makeEntry("assistant", "Complete."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.scope_creep).toBe(3);
  });

  it("computes question rate", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "what does this function do?"),
      makeEntry("assistant", "It handles authentication."),
      makeEntry("user", "can you refactor it?"),
      makeEntry("assistant", "Sure."),
      makeEntry("user", "use TypeScript please"),
      makeEntry("assistant", "Done."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    // 2 of 3 turns end with ?
    expect(stats.question_rate).toBeCloseTo(0.67, 1);
  });

  it("computes one-word turn rate", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "yes"),
      makeEntry("assistant", "OK."),
      makeEntry("user", "do it"),
      makeEntry("assistant", "Done."),
      makeEntry("user", "now refactor the entire authentication module to use OAuth"),
      makeEntry("assistant", "Working on it."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    // "yes" (1 word), "do it" (2 words) = 2 short turns out of 3
    expect(stats.one_word_turn_rate).toBeCloseTo(0.67, 1);
  });

  it("handles empty sessions", () => {
    const stats = computeVibeStats([]);
    expect(stats.total_turns).toBe(0);
    expect(stats.session_count).toBe(0);
    expect(stats.please_rate).toBe(0);
    expect(stats.read_write_ratio).toBe(0);
  });

  it("aggregates across multiple sessions", () => {
    const session1 = makeSession([
      makeEntry("user", "damn, fix this"),
      makeEntry("assistant", "OK."),
    ]);
    const session2 = makeSession([
      makeEntry("user", "shit, another bug"),
      makeEntry("assistant", "On it."),
    ]);

    const stats = computeVibeStats([session1, session2]);

    expect(stats.expletives).toBe(2);
    expect(stats.session_count).toBe(2);
    expect(stats.sources).toEqual(["claude"]);
  });

  it("avoids false positive: 'class' is not an expletive", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "add a new class to the component"),
      makeEntry("assistant", "Added."),
      makeEntry("user", "the assembly needs updating"),
      makeEntry("assistant", "Updated."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.expletives).toBe(0);
  });

  it("correctly handles override success rate", () => {
    const entries: RawEntry[] = [
      makeEntry("user", "fix the bug"),
      makeToolEntry("Edit", { file_path: "a.ts", old_string: "x", new_string: "y" }),
      // Correction
      makeEntry("user", "no, that's wrong"),
      // AI fixes it successfully
      makeToolEntry("Edit", { file_path: "a.ts", old_string: "y", new_string: "z" }),
      makeEntry("user", [
        { type: "tool_result", tool_use_id: "t1", content: "file updated successfully" },
      ]),
      makeEntry("assistant", "Fixed with the correct approach."),
    ];

    const stats = computeVibeStats([makeSession(entries)]);

    expect(stats.corrections).toBe(1);
    expect(stats.override_success_rate).toBe(1);
  });
});
