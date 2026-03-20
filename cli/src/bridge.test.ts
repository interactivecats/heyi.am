import { describe, it, expect } from "vitest";
import { bridgeToAnalyzer, aggregateChildStats } from "./bridge.js";
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
