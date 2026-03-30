import { describe, it, expect } from "vitest";
import { bridgeToAnalyzer, aggregateChildStats, deduplicateChildren, childDedupeKey, cleanAssistantText, mergeActiveIntervals, sumIntervalMs } from "./bridge.js";
import type { Session } from "./analyzer.js";
import type { SessionAnalysis as ParserOutput, RawEntry } from "./parsers/types.js";

function makeEntry(overrides: Partial<RawEntry> & { type: string }): RawEntry {
  return {
    uuid: crypto.randomUUID(),
    timestamp: "2026-03-20T10:00:00.000Z",
    sessionId: "test-session",
    version: "2.1.80",
    ...overrides,
  } as RawEntry;
}

function makeParserOutput(overrides: Partial<ParserOutput> = {}): ParserOutput {
  return {
    source: "claude",
    turns: 2,
    tool_calls: [],
    files_touched: [],
    duration_ms: 300_000,
    wall_clock_ms: 300_000,
    loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
    raw_entries: [],
    start_time: "2026-03-20T10:00:00.000Z",
    end_time: "2026-03-20T10:05:00.000Z",
    ...overrides,
  };
}

describe("bridgeToAnalyzer", () => {
  it("maps basic fields correctly", () => {
    const parsed = makeParserOutput({ duration_ms: 2_700_000 });
    const result = bridgeToAnalyzer(parsed, {
      sessionId: "abc-123",
      projectName: "my-project",
    });

    expect(result.id).toBe("abc-123");
    expect(result.projectName).toBe("my-project");
    expect(result.durationMinutes).toBe(45);
    expect(result.date).toBe("2026-03-20T10:00:00.000Z");
  });

  it("extracts title from first user prompt", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          message: { role: "user", content: "Fix the login bug" },
        }),
        makeEntry({
          type: "assistant",
          message: { role: "assistant", content: [{ type: "text", text: "Sure" }] },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.title).toBe("Fix the login bug");
  });

  it("truncates long titles", () => {
    const longPrompt = "A".repeat(200);
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          message: { role: "user", content: longPrompt },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.title.length).toBeLessThanOrEqual(120);
    expect(result.title).toContain("...");
  });

  it("defaults to 'Untitled session' when no user prompts", () => {
    const parsed = makeParserOutput({ raw_entries: [] });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.title).toBe("Untitled session");
  });

  it("converts user string messages to prompt turns", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          timestamp: "2026-03-20T10:00:00.000Z",
          message: { role: "user", content: "Help me refactor" },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].type).toBe("prompt");
    expect(result.turns[0].content).toBe("Help me refactor");
  });

  it("converts assistant text blocks to response turns", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Here is my analysis" }],
          },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].type).toBe("response");
    expect(result.turns[0].content).toBe("Here is my analysis");
  });

  it("converts assistant tool_use blocks to tool turns", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_001",
                name: "Read",
                input: { file_path: "/app/main.ts" },
              },
            ],
          },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].type).toBe("tool");
    expect(result.turns[0].toolName).toBe("Read");
    expect(result.turns[0].toolInput).toBe("/app/main.ts");
  });

  it("skips user entries with tool_result content", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          message: {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "toolu_001" }] as any,
          },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns).toHaveLength(0);
  });

  it("computes per-file changes from Write tool calls", () => {
    const parsed = makeParserOutput({
      tool_calls: [
        { id: "t1", name: "Write", input: { file_path: "/app/new.ts", content: "line1\nline2\nline3\n" } },
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.filesChanged).toHaveLength(1);
    expect(result.filesChanged[0].path).toBe("/app/new.ts");
    expect(result.filesChanged[0].additions).toBe(4); // 3 lines + trailing newline split
    expect(result.filesChanged[0].deletions).toBe(0);
  });

  it("computes per-file changes from Edit tool calls", () => {
    const parsed = makeParserOutput({
      tool_calls: [
        {
          id: "t2",
          name: "Edit",
          input: {
            file_path: "/app/main.ts",
            old_string: "old line",
            new_string: "new line 1\nnew line 2",
          },
        },
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.filesChanged).toHaveLength(1);
    expect(result.filesChanged[0].additions).toBe(2);
    expect(result.filesChanged[0].deletions).toBe(1);
  });

  it("deduplicates multiple writes to same file", () => {
    const parsed = makeParserOutput({
      tool_calls: [
        { id: "t1", name: "Write", input: { file_path: "/app/config.ts", content: "v1\n" } },
        { id: "t2", name: "Write", input: { file_path: "/app/config.ts", content: "v2\nv2b\n" } },
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.filesChanged).toHaveLength(1);
    // Last write: "v2\nv2b\n" = 3 lines
    expect(result.filesChanged[0].additions).toBe(3);
  });

  it("resets Edit accumulations when a Write overwrites the file", () => {
    const parsed = makeParserOutput({
      tool_calls: [
        // Three Edits on the same file
        { id: "t1", name: "Edit", input: { file_path: "/app/main.ts", old_string: "a\nb\nc\nd\ne", new_string: "x\ny\nz\nw\nv\nq\nr\ns" } },
        { id: "t2", name: "Edit", input: { file_path: "/app/main.ts", old_string: "old1\nold2\nold3", new_string: "new1\nnew2\nnew3" } },
        { id: "t3", name: "Edit", input: { file_path: "/app/main.ts", old_string: "foo\nbar", new_string: "baz\nqux\nquux\nquuz" } },
        // Then a full Write replaces everything
        { id: "t4", name: "Write", input: { file_path: "/app/main.ts", content: "line1\nline2\nline3\nline4\nline5" } },
      ],
      loc_stats: {
        // Parser computes correct totals (Write replaces all prior Edits)
        loc_added: 5,
        loc_removed: 0,
        loc_net: 5,
        files_changed: ["/app/main.ts"],
      },
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.filesChanged).toHaveLength(1);

    const file = result.filesChanged[0];
    // Per-file stats should match session total: only the Write counts
    expect(file.additions).toBe(5);
    expect(file.deletions).toBe(0);

    // locTotal should match the sum of per-file changes
    expect(result.locTotal).toBe(file.additions + file.deletions);
  });

  it("handles Edit-only files alongside Write-after-Edit files", () => {
    const parsed = makeParserOutput({
      tool_calls: [
        // File A: Edit then Write (Write-after-Edit)
        { id: "t1", name: "Edit", input: { file_path: "/app/a.ts", old_string: "old", new_string: "new\nstuff" } },
        { id: "t2", name: "Write", input: { file_path: "/app/a.ts", content: "final\ncontent" } },
        // File B: Edit only (no Write, so Edits stand)
        { id: "t3", name: "Edit", input: { file_path: "/app/b.ts", old_string: "x\ny", new_string: "a\nb\nc" } },
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.filesChanged).toHaveLength(2);

    const fileA = result.filesChanged.find((f) => f.path === "/app/a.ts")!;
    const fileB = result.filesChanged.find((f) => f.path === "/app/b.ts")!;

    // File A: Write replaced everything — only Write counts
    expect(fileA.additions).toBe(2); // "final\ncontent" = 2 lines
    expect(fileA.deletions).toBe(0);

    // File B: Edit-only — Edits stand
    expect(fileB.additions).toBe(3);
    expect(fileB.deletions).toBe(2);
  });

  it("builds raw log from entries", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          message: { role: "user", content: "What is this?" },
        }),
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "This is a module." },
              { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/app/mod.ts" } },
            ],
          },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.rawLog).toContain("> What is this?");
    expect(result.rawLog).toContain("This is a module.");
    expect(result.rawLog.some((l) => l.includes("[Read]"))).toBe(true);
  });

  it("extracts toolInput for Bash command", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } },
            ],
          },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns[0].toolInput).toBe("npm test");
  });

  it("extracts toolInput for Grep pattern", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", id: "t1", name: "Grep", input: { pattern: "TODO", path: "/app" } },
            ],
          },
        }),
      ],
    });

    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    // pattern takes priority over path in extractToolInput since it checks pattern before path
    expect(result.turns[0].toolInput).toBe("TODO");
  });

  it("passes endTime from parser end_time", () => {
    const parsed = makeParserOutput({
      end_time: "2026-03-20T10:05:00.000Z",
    });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.endTime).toBe("2026-03-20T10:05:00.000Z");
  });

  it("omits endTime when end_time is null", () => {
    const parsed = makeParserOutput({ end_time: null });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.endTime).toBeUndefined();
  });

  it("floors durationMinutes at 1 for sub-30s sessions", () => {
    const parsed = makeParserOutput({ duration_ms: 15_000 }); // 15 seconds
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.durationMinutes).toBe(1);
  });

  it("returns 0 durationMinutes when duration_ms is 0", () => {
    const parsed = makeParserOutput({ duration_ms: 0 });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.durationMinutes).toBe(0);
  });

  it("floors wallClockMinutes at 1 for short sessions", () => {
    const parsed = makeParserOutput({ wall_clock_ms: 20_000 }); // 20 seconds
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.wallClockMinutes).toBe(1);
  });

  it("passes agentRole and parentSessionId through", () => {
    const parsed = makeParserOutput();
    const result = bridgeToAnalyzer(parsed, {
      sessionId: "child-1",
      projectName: "p",
      agentRole: "frontend-dev",
      parentSessionId: "parent-1",
    });
    expect(result.agentRole).toBe("frontend-dev");
    expect(result.parentSessionId).toBe("parent-1");
  });
});

describe("cleanAssistantText", () => {
  it("removes antml_thinking blocks", () => {
    const input = "Hello <antml_thinking>internal reasoning here</antml_thinking> world";
    expect(cleanAssistantText(input)).toBe("Hello  world");
  });

  it("removes system-reminder blocks", () => {
    const input = "Some text <system-reminder>injected context</system-reminder> more text";
    expect(cleanAssistantText(input)).toBe("Some text  more text");
  });

  it("removes multiline antml blocks", () => {
    const input = "Before\n<antml_thinking>\nline 1\nline 2\n</antml_thinking>\nAfter";
    expect(cleanAssistantText(input)).toBe("Before\n\nAfter");
  });

  it("removes multiple different tag types", () => {
    const input = "<antml_thinking>thought</antml_thinking>Visible<system-reminder>reminder</system-reminder>";
    expect(cleanAssistantText(input)).toBe("Visible");
  });

  it("handles antml_reasoning_effort tags", () => {
    const input = "Text <antml_reasoning_effort>high</antml_reasoning_effort> here";
    expect(cleanAssistantText(input)).toBe("Text  here");
  });

  it("returns empty string when only internal tags remain", () => {
    const input = "<antml_thinking>just thinking</antml_thinking>";
    expect(cleanAssistantText(input)).toBe("");
  });

  it("passes through text with no internal tags", () => {
    const input = "Normal assistant response with <code>html</code> tags";
    expect(cleanAssistantText(input)).toBe("Normal assistant response with <code>html</code> tags");
  });

  it("removes teammate-message blocks with attributes", () => {
    const input = 'Before <teammate-message teammate_id="team-lead">internal coordination</teammate-message> after';
    expect(cleanAssistantText(input)).toBe("Before  after");
  });

  it("removes function_calls blocks", () => {
    const input = "Text <function_calls><invoke>tool</invoke></function_calls> more";
    expect(cleanAssistantText(input)).toBe("Text  more");
  });

  it("removes fast_mode_info blocks", () => {
    const input = "<fast_mode_info>Fast mode uses same model</fast_mode_info>Answer here";
    expect(cleanAssistantText(input)).toBe("Answer here");
  });

  it("removes user-prompt-submit-hook blocks", () => {
    const input = "Response <user-prompt-submit-hook>hook output</user-prompt-submit-hook> end";
    expect(cleanAssistantText(input)).toBe("Response  end");
  });

  it("collapses excessive newlines after tag removal", () => {
    const input = "Before\n\n\n<antml_thinking>thought</antml_thinking>\n\n\nAfter";
    expect(cleanAssistantText(input)).toBe("Before\n\nAfter");
  });

  it("removes environment_context blocks (Codex)", () => {
    const input = "<environment_context><cwd>/Users/ben/project</cwd></environment_context>Fix the bug";
    expect(cleanAssistantText(input)).toBe("Fix the bug");
  });

  it("removes local-command-* blocks", () => {
    const input = "Text <local-command-stdout>output here</local-command-stdout> end";
    expect(cleanAssistantText(input)).toBe("Text  end");
  });

  it("removes command-name and command-message blocks", () => {
    const input = "<command-name>compact</command-name><command-message>do it</command-message>Real text";
    expect(cleanAssistantText(input)).toBe("Real text");
  });
});

describe("bridgeToAnalyzer - cleanAssistantText integration", () => {
  it("strips antml tags from assistant response turns", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "<antml_thinking>hmm</antml_thinking>Here is my answer" }],
          },
        }),
      ],
    });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].content).toBe("Here is my answer");
  });

  it("strips tags from session title", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          message: { role: "user", content: '<teammate-message teammate_id="team-lead">task details</teammate-message>Fix the auth bug' },
        }),
      ],
    });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.title).toBe("Fix the auth bug");
  });

  it("skips user prompts that are only internal tags", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          message: { role: "user", content: '<teammate-message teammate_id="team-lead">coordination only</teammate-message>' },
        }),
        makeEntry({
          type: "user",
          message: { role: "user", content: "Real prompt" },
        }),
      ],
    });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.title).toBe("Real prompt");
  });

  it("cleans tags from user prompt turns", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "user",
          message: { role: "user", content: '<teammate-message teammate_id="lead">info</teammate-message>Do the thing' },
        }),
      ],
    });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns[0].content).toBe("Do the thing");
  });

  it("skips turns that become empty after cleaning", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "<antml_thinking>only thinking</antml_thinking>" }],
          },
        }),
      ],
    });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.turns).toHaveLength(0);
  });

  it("strips system-reminder from raw log entries", () => {
    const parsed = makeParserOutput({
      raw_entries: [
        makeEntry({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Visible text<system-reminder>hidden</system-reminder>" }],
          },
        }),
      ],
    });
    const result = bridgeToAnalyzer(parsed, { sessionId: "x", projectName: "p" });
    expect(result.rawLog).toHaveLength(1);
    expect(result.rawLog[0]).toBe("Visible text");
  });
});

describe("aggregateChildStats", () => {
  it("sums LOC and duration across children", () => {
    const children = [
      { linesOfCode: 100, durationMinutes: 10 } as Session,
      { linesOfCode: 200, durationMinutes: 20 } as Session,
    ];
    const stats = aggregateChildStats(children);
    expect(stats.totalLoc).toBe(300);
    expect(stats.totalDurationMinutes).toBe(30);
    expect(stats.agentCount).toBe(2);
  });

  it("returns zeros for empty children", () => {
    const stats = aggregateChildStats([]);
    expect(stats.totalLoc).toBe(0);
    expect(stats.totalDurationMinutes).toBe(0);
    expect(stats.agentCount).toBe(0);
  });
});

describe("deduplicateChildren", () => {
  function makeSession(overrides: Partial<Session>): Session {
    return {
      id: "s1",
      title: "Test",
      date: "2026-03-20T10:00:00.000Z",
      durationMinutes: 5,
      turns: 10,
      linesOfCode: 50,
      status: "draft",
      projectName: "p",
      rawLog: [],
      skills: [],
      executionPath: [],
      toolBreakdown: [],
      filesChanged: [],
      turnTimeline: [],
      toolCalls: 5,
      ...overrides,
    };
  }

  it("keeps agents with same role but start times >30s apart", () => {
    const children = [
      makeSession({ id: "a", agentRole: "dev", date: "2026-03-20T10:00:00.000Z", turns: 5 }),
      makeSession({ id: "b", agentRole: "dev", date: "2026-03-20T10:00:31.000Z", turns: 5 }),
    ];
    const result = deduplicateChildren(children);
    expect(result).toHaveLength(2);
  });

  it("deduplicates agents with same role within 30s bucket", () => {
    const children = [
      makeSession({ id: "a", agentRole: "dev", date: "2026-03-20T10:00:00.000Z", turns: 3 }),
      makeSession({ id: "b", agentRole: "dev", date: "2026-03-20T10:00:15.000Z", turns: 8 }),
    ];
    const result = deduplicateChildren(children);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b"); // keeps the one with more turns
  });

  it("does not merge agents with different roles in same bucket", () => {
    const children = [
      makeSession({ id: "a", agentRole: "frontend", date: "2026-03-20T10:00:00.000Z", turns: 5 }),
      makeSession({ id: "b", agentRole: "backend", date: "2026-03-20T10:00:00.000Z", turns: 5 }),
    ];
    const result = deduplicateChildren(children);
    expect(result).toHaveLength(2);
  });
});

describe("childDedupeKey", () => {
  it("uses 'agent' as fallback when agentRole is undefined", () => {
    const key = childDedupeKey(undefined, "2026-03-20T10:00:00.000Z");
    expect(key).toMatch(/^agent::\d+$/);
  });

  it("uses the provided agentRole", () => {
    const key = childDedupeKey("frontend-dev", "2026-03-20T10:00:00.000Z");
    expect(key).toMatch(/^frontend-dev::\d+$/);
  });

  it("produces same key for times within same 30-second bucket", () => {
    const key1 = childDedupeKey("dev", "2026-03-20T10:00:00.000Z");
    const key2 = childDedupeKey("dev", "2026-03-20T10:00:15.000Z");
    expect(key1).toBe(key2);
  });

  it("produces different keys for times in different 30-second buckets", () => {
    const key1 = childDedupeKey("dev", "2026-03-20T10:00:00.000Z");
    const key2 = childDedupeKey("dev", "2026-03-20T10:00:31.000Z");
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different roles in same bucket", () => {
    const key1 = childDedupeKey("frontend", "2026-03-20T10:00:00.000Z");
    const key2 = childDedupeKey("backend", "2026-03-20T10:00:00.000Z");
    expect(key1).not.toBe(key2);
  });

  it("uses consistent fallback — two undefined roles produce same key", () => {
    const key1 = childDedupeKey(undefined, "2026-03-20T10:00:00.000Z");
    const key2 = childDedupeKey(undefined, "2026-03-20T10:00:10.000Z");
    expect(key1).toBe(key2);
  });
});

describe("mergeActiveIntervals", () => {
  it("returns empty for empty input", () => {
    expect(mergeActiveIntervals([])).toEqual([]);
  });

  it("returns single interval unchanged", () => {
    expect(mergeActiveIntervals([[100, 200]])).toEqual([[100, 200]]);
  });

  it("merges two fully overlapping intervals", () => {
    // Session A: 0-60min, Session B: 0-60min (identical parallel sessions)
    const result = mergeActiveIntervals([[0, 60], [0, 60]]);
    expect(result).toEqual([[0, 60]]);
  });

  it("merges two partially overlapping intervals", () => {
    // Session A: 0-60, Session B: 30-90
    const result = mergeActiveIntervals([[0, 60], [30, 90]]);
    expect(result).toEqual([[0, 90]]);
  });

  it("keeps non-overlapping intervals separate", () => {
    // Session A: 0-30, idle gap, Session A: 60-90
    const result = mergeActiveIntervals([[0, 30], [60, 90]]);
    expect(result).toEqual([[0, 30], [60, 90]]);
  });

  it("handles three parallel sessions for 1 hour: human hours = 1h", () => {
    const hour = 3_600_000;
    const result = mergeActiveIntervals([
      [0, hour],
      [0, hour],
      [0, hour],
    ]);
    expect(result).toEqual([[0, hour]]);
    expect(sumIntervalMs(result)).toBe(hour);
  });

  it("handles session with idle gap + another session during the gap", () => {
    // Session A: active 0-30, idle 30-60, active 60-90
    // Session B: active 40-50 (during A's idle gap)
    const result = mergeActiveIntervals([
      [0, 30], [60, 90],  // Session A intervals
      [40, 50],            // Session B interval
    ]);
    expect(result).toEqual([[0, 30], [40, 50], [60, 90]]);
    expect(sumIntervalMs(result)).toBe(30 + 10 + 30); // 70
  });

  it("handles adjacent intervals (touching but not overlapping)", () => {
    const result = mergeActiveIntervals([[0, 30], [30, 60]]);
    expect(result).toEqual([[0, 60]]);
  });

  it("sorts unsorted input correctly", () => {
    const result = mergeActiveIntervals([[60, 90], [0, 30], [20, 40]]);
    expect(result).toEqual([[0, 40], [60, 90]]);
  });

  it("does not mutate original array", () => {
    const original: [number, number][] = [[60, 90], [0, 30]];
    mergeActiveIntervals(original);
    expect(original).toEqual([[60, 90], [0, 30]]);
  });
});

describe("sumIntervalMs", () => {
  it("returns 0 for empty intervals", () => {
    expect(sumIntervalMs([])).toBe(0);
  });

  it("sums multiple intervals", () => {
    expect(sumIntervalMs([[0, 100], [200, 350]])).toBe(250);
  });
});
