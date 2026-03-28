import { describe, it, expect } from "vitest";
import {
  exportSessionContext,
  estimateTokens,
  extractSessionSignals,
  type ExportTier,
} from "./context-export.js";
import type { Session, ParsedTurn, ExecutionStep, FileChange } from "./analyzer.js";

// ── Test fixtures ──────────────────────────────────────────────

function makeTurn(overrides: Partial<ParsedTurn> = {}): ParsedTurn {
  return {
    timestamp: "14:00:00",
    type: "response",
    content: "",
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-001",
    title: "Security hardening & input validation",
    date: "2026-03-22T10:00:00Z",
    durationMinutes: 47,
    turns: 34,
    linesOfCode: 842,
    status: "draft",
    projectName: "heyi-am",
    rawLog: [],
    skills: ["Security", "Elixir", "TypeScript"],
    executionPath: [
      { stepNumber: 1, title: "Audit review findings", description: "Read security report, identified 3 vectors", type: "analysis" },
      { stepNumber: 2, title: "Fix prompt injection", description: "Content-type fencing for user input", type: "implementation" },
      { stepNumber: 3, title: "Write invariant tests", description: "4 test modules, 18 assertions", type: "testing" },
    ],
    toolBreakdown: [
      { tool: "Edit", count: 12 },
      { tool: "Read", count: 8 },
      { tool: "Bash", count: 5 },
    ],
    filesChanged: [
      { path: "lib/vibe_api_controller.ex", additions: 45, deletions: 12 },
      { path: "cli/src/server.ts", additions: 28, deletions: 3 },
      { path: "test/security_test.exs", additions: 89, deletions: 0 },
    ],
    turnTimeline: [],
    toolCalls: 25,
    source: "claude",
    context: "Post-review hardening sprint addressing 3 high-severity issues.",
    ...overrides,
  };
}

function makeTurns(): ParsedTurn[] {
  return [
    makeTurn({ type: "prompt", content: "Fix the prompt injection vulnerability in the publish pipeline" }),
    makeTurn({ type: "response", content: "I'll start by auditing the current prompt assembly in the vibe API controller." }),
    makeTurn({ type: "tool", content: "Read lib/vibe_api_controller.ex", toolName: "Read", toolInput: "lib/vibe_api_controller.ex" }),
    makeTurn({ type: "tool", content: "Edit lib/vibe_api_controller.ex", toolName: "Edit", toolInput: "lib/vibe_api_controller.ex" }),
    makeTurn({ type: "response", content: "Added content-type fencing around user input blocks. Now writing tests." }),
    makeTurn({ type: "tool", content: "Write test/security_test.exs", toolName: "Write", toolInput: "test/security_test.exs" }),
    makeTurn({ type: "tool", content: "Bash mix test", toolName: "Bash", toolInput: "mix test" }),
    makeTurn({ type: "thinking", content: "Let me think about whether there are other injection vectors..." }),
    makeTurn({ type: "response", content: "All 18 assertions pass. The publish pipeline is now hardened against injection." }),
  ];
}

// ── estimateTokens ─────────────────────────────────────────────

describe("estimateTokens", () => {
  it("estimates ~1 token per 4 characters", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(100))).toBe(25);
    expect(estimateTokens("a".repeat(101))).toBe(26);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

// ── compact tier ───────────────────────────────────────────────

describe("exportSessionContext — compact", () => {
  it("includes metadata header", () => {
    const session = makeSession();
    const result = exportSessionContext(session, [], { tier: "compact" });

    expect(result.content).toContain("# Session: Security hardening & input validation");
    expect(result.content).toContain("Project: heyi-am");
    expect(result.content).toContain("Source: Claude Code");
    expect(result.content).toContain("Mar 22, 2026");
    expect(result.content).toContain("47m");
    expect(result.content).toContain("34 turns");
    expect(result.content).toContain("842 LOC");
    expect(result.content).toContain("Skills: Security, Elixir, TypeScript");
    expect(result.tier).toBe("compact");
  });

  it("includes context block", () => {
    const session = makeSession();
    const result = exportSessionContext(session, [], { tier: "compact" });
    expect(result.content).toContain("## Context");
    expect(result.content).toContain("Post-review hardening sprint");
  });

  it("includes execution path", () => {
    const session = makeSession();
    const result = exportSessionContext(session, [], { tier: "compact" });
    expect(result.content).toContain("## Execution Path");
    expect(result.content).toContain("1. Audit review findings");
    expect(result.content).toContain("2. Fix prompt injection");
  });

  it("does NOT include key exchanges or files changed", () => {
    const session = makeSession();
    const turns = makeTurns();
    const result = exportSessionContext(session, turns, { tier: "compact" });
    expect(result.content).not.toContain("## Key Exchanges");
    expect(result.content).not.toContain("## Files Changed");
  });

  it("has token estimate", () => {
    const result = exportSessionContext(makeSession(), [], { tier: "compact" });
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.tokens).toBe(Math.ceil(result.content.length / 4));
  });
});

// ── summary tier (default) ─────────────────────────────────────

describe("exportSessionContext — summary", () => {
  it("defaults to summary tier", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.tier).toBe("summary");
  });

  it("includes key exchanges section", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).toContain("## Key Exchanges");
    expect(result.content).toContain("[User]: Fix the prompt injection");
  });

  it("includes user prompts as key exchanges", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).toContain("[User]:");
  });

  it("includes assistant responses before tool use", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).toContain("[Assistant]: I'll start by auditing");
  });

  it("includes Edit and Write tool turns", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).toContain("[Tool:Edit]: lib/vibe_api_controller.ex");
    expect(result.content).toContain("[Tool:Write]: test/security_test.exs");
  });

  it("excludes thinking blocks", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).not.toContain("think about whether");
  });

  it("excludes Read tool turns (non-key)", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).not.toContain("[Tool:Read]");
  });

  it("includes files changed section", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).toContain("## Files Changed");
    expect(result.content).toContain("lib/vibe_api_controller.ex (+45, -12)");
  });
});

// ── full tier ──────────────────────────────────────────────────

describe("exportSessionContext — full", () => {
  it("includes all turns in Conversation section", () => {
    const result = exportSessionContext(makeSession(), makeTurns(), { tier: "full" });
    expect(result.content).toContain("## Conversation");
    expect(result.content).toContain("[User]: Fix the prompt injection");
    expect(result.content).toContain("[Tool:Read]: lib/vibe_api_controller.ex");
    expect(result.content).toContain("[Tool:Bash]: mix test");
    expect(result.tier).toBe("full");
  });

  it("excludes thinking blocks even in full tier", () => {
    const result = exportSessionContext(makeSession(), makeTurns(), { tier: "full" });
    expect(result.content).not.toContain("think about whether");
  });

  it("summarizes large tool outputs", () => {
    const turns = [
      makeTurn({
        type: "tool",
        content: "Read big-file.ts",
        toolName: "Read",
        toolInput: "big-file.ts",
        toolOutput: "x".repeat(600),
      }),
    ];
    const result = exportSessionContext(makeSession(), turns, { tier: "full" });
    expect(result.content).toContain("[600 chars]");
    expect(result.content).toContain("...");
  });

  it("includes short tool output inline", () => {
    const turns = [
      makeTurn({
        type: "tool",
        content: "Bash echo hello",
        toolName: "Bash",
        toolInput: "echo hello",
        toolOutput: "hello",
      }),
    ];
    const result = exportSessionContext(makeSession(), turns, { tier: "full" });
    expect(result.content).toContain("→ hello");
  });
});

// ── edge cases ─────────────────────────────────────────────────

describe("exportSessionContext — edge cases", () => {
  it("handles session with no turns", () => {
    const result = exportSessionContext(makeSession({ turns: 0 }), []);
    expect(result.content).toContain("# Session:");
    expect(result.content).not.toContain("## Key Exchanges");
  });

  it("handles session with no skills", () => {
    const result = exportSessionContext(makeSession({ skills: [] }), []);
    expect(result.content).not.toContain("Skills:");
  });

  it("handles session with no context", () => {
    const result = exportSessionContext(makeSession({ context: undefined }), []);
    expect(result.content).not.toContain("## Context");
  });

  it("handles session with no execution path", () => {
    const result = exportSessionContext(makeSession({ executionPath: [] }), []);
    expect(result.content).not.toContain("## Execution Path");
  });

  it("handles session with no files changed", () => {
    const result = exportSessionContext(makeSession({ filesChanged: [] }), []);
    expect(result.content).not.toContain("## Files Changed");
  });

  it("formats LOC over 1000 as 'k'", () => {
    const result = exportSessionContext(makeSession({ linesOfCode: 2400 }), []);
    expect(result.content).toContain("2.4k LOC");
  });

  it("handles unknown source gracefully", () => {
    const result = exportSessionContext(makeSession({ source: undefined }), []);
    expect(result.content).toContain("Source: Unknown");
  });

  it("truncates long user prompts", () => {
    const turns = [makeTurn({ type: "prompt", content: "a".repeat(500) })];
    const result = exportSessionContext(makeSession(), turns);
    expect(result.content).toContain("...");
    // The truncated content should not exceed 303 chars ([User]: + 300)
    const userLine = result.content.split("\n").find((l) => l.startsWith("[User]:"))!;
    expect(userLine.length).toBeLessThanOrEqual(311);
  });

  it("includes error turns as key exchanges in summary", () => {
    const turns = [
      makeTurn({ type: "error", content: "Module not found: missing_dep" }),
    ];
    const result = exportSessionContext(makeSession(), turns);
    expect(result.content).toContain("[Error]: Module not found");
  });

  it("includes Bash tool output with errors in summary", () => {
    const turns = [
      makeTurn({
        type: "tool",
        content: "Bash npm test",
        toolName: "Bash",
        toolInput: "npm test",
        toolOutput: "Error: test failed",
      }),
    ];
    const result = exportSessionContext(makeSession(), turns);
    expect(result.content).toContain("[Tool:Bash]");
  });
});

// ── tool breakdown in metadata ────────────────────────────────

describe("exportSessionContext — tool breakdown", () => {
  it("includes tool breakdown in metadata header", () => {
    const result = exportSessionContext(makeSession(), []);
    expect(result.content).toContain("Tools: Edit(12), Read(8), Bash(5)");
  });

  it("includes tool call count in duration line", () => {
    const result = exportSessionContext(makeSession(), []);
    expect(result.content).toContain("25 tool calls");
  });

  it("omits tool breakdown when empty", () => {
    const result = exportSessionContext(makeSession({ toolBreakdown: [] }), []);
    expect(result.content).not.toContain("Tools:");
  });
});

// ── session signals ───────────────────────────────────────────

describe("extractSessionSignals", () => {
  it("counts errors from turns", () => {
    const turns = [
      makeTurn({ type: "error", content: "Module not found" }),
      makeTurn({ type: "error", content: "Cannot compile" }),
      makeTurn({ type: "prompt", content: "fix it" }),
    ];
    const signals = extractSessionSignals(turns);
    expect(signals.errors).toBe(2);
  });

  it("counts corrections from user prompts", () => {
    const turns = [
      makeTurn({ type: "prompt", content: "no, don't use that approach" }),
      makeTurn({ type: "prompt", content: "actually, try the other way" }),
      makeTurn({ type: "prompt", content: "looks good" }),
    ];
    const signals = extractSessionSignals(turns);
    expect(signals.corrections).toBe(2);
  });

  it("computes effort breakdown by tool category", () => {
    const turns = [
      makeTurn({ type: "tool", content: "", toolName: "Read" }),
      makeTurn({ type: "tool", content: "", toolName: "Read" }),
      makeTurn({ type: "tool", content: "", toolName: "Grep" }),
      makeTurn({ type: "tool", content: "", toolName: "Edit" }),
      makeTurn({ type: "tool", content: "", toolName: "Bash" }),
    ];
    const signals = extractSessionSignals(turns);
    expect(signals.effortBreakdown.reading).toBe(60);
    expect(signals.effortBreakdown.writing).toBe(20);
    expect(signals.effortBreakdown.running).toBe(20);
  });

  it("extracts first user prompt", () => {
    const turns = [
      makeTurn({ type: "response", content: "Hello" }),
      makeTurn({ type: "prompt", content: "Fix the auth bug" }),
      makeTurn({ type: "prompt", content: "Also check the tests" }),
    ];
    const signals = extractSessionSignals(turns);
    expect(signals.firstPrompt).toBe("Fix the auth bug");
  });
});

describe("exportSessionContext — session signals section", () => {
  it("includes session signals in summary tier", () => {
    const turns = [
      makeTurn({ type: "prompt", content: "Fix the bug" }),
      makeTurn({ type: "tool", content: "", toolName: "Read" }),
      makeTurn({ type: "tool", content: "", toolName: "Edit" }),
      makeTurn({ type: "error", content: "Compile error" }),
      makeTurn({ type: "prompt", content: "no, actually use the other approach" }),
      makeTurn({ type: "tool", content: "", toolName: "Edit" }),
    ];
    const result = exportSessionContext(makeSession(), turns);
    expect(result.content).toContain("## Session Signals");
    expect(result.content).toContain("Effort:");
    expect(result.content).toContain("Errors encountered: 1");
    expect(result.content).toContain("Course corrections: 1");
  });

  it("omits signals section when no tools or errors", () => {
    const turns = [
      makeTurn({ type: "prompt", content: "explain this code" }),
      makeTurn({ type: "response", content: "sure" }),
    ];
    const result = exportSessionContext(makeSession(), turns);
    expect(result.content).not.toContain("## Session Signals");
  });
});

// ── enhanced data rendering ───────────────────────────────────

describe("exportSessionContext — enhanced data", () => {
  it("includes developer take when present", () => {
    const session = makeSession({
      developerTake: "The tricky part was threading the CSP headers through the proxy.",
    });
    const result = exportSessionContext(session, makeTurns());
    expect(result.content).toContain("## Developer Take");
    expect(result.content).toContain("threading the CSP headers");
  });

  it("omits developer take when absent", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).not.toContain("## Developer Take");
  });

  it("includes Q&A pairs when present", () => {
    const session = makeSession({
      qaPairs: [
        { question: "Why did you choose Ed25519?", answer: "Speed and small key size." },
        { question: "What about RSA?", answer: "Too slow for CLI use." },
      ],
    });
    const result = exportSessionContext(session, makeTurns());
    expect(result.content).toContain("## Q&A");
    expect(result.content).toContain("**Q:** Why did you choose Ed25519?");
    expect(result.content).toContain("**A:** Speed and small key size.");
  });

  it("omits Q&A when absent", () => {
    const result = exportSessionContext(makeSession(), makeTurns());
    expect(result.content).not.toContain("## Q&A");
  });

  it("uses first prompt as context when no enhanced context", () => {
    const session = makeSession({ context: undefined });
    const turns = [
      makeTurn({ type: "prompt", content: "Migrate the auth system to JWT tokens" }),
    ];
    const result = exportSessionContext(session, turns);
    expect(result.content).toContain("## Context");
    expect(result.content).toContain("Migrate the auth system to JWT tokens");
  });

  it("prefers enhanced context over first-prompt fallback", () => {
    const session = makeSession({ context: "Sprint cleanup after security audit." });
    const turns = [
      makeTurn({ type: "prompt", content: "Fix the injection" }),
    ];
    const result = exportSessionContext(session, turns);
    expect(result.content).toContain("Sprint cleanup after security audit.");
    // Should not have the first prompt as a separate context
    const contextSection = result.content.split("## Context")[1]?.split("##")[0] ?? "";
    expect(contextSection).not.toContain("Fix the injection");
  });

  it("compact tier includes developer take", () => {
    const session = makeSession({
      developerTake: "Hard-won lesson about CSP headers.",
    });
    const result = exportSessionContext(session, [], { tier: "compact" });
    expect(result.content).toContain("## Developer Take");
  });
});
