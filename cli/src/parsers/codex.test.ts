import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { codexParser, discoverCodexSessions } from "./codex.js";

function codexLine(type: string, payload: Record<string, unknown>, ts?: string): string {
  return JSON.stringify({
    timestamp: ts ?? "2026-03-20T10:00:00.000Z",
    type,
    payload,
  });
}

function sessionMetaLine(cwd: string, id: string, ts?: string): string {
  return codexLine("session_meta", {
    id,
    cwd,
    cli_version: "0.108.0-alpha.12",
    originator: "Codex Desktop",
    source: "vscode",
    model_provider: "openai",
  }, ts ?? "2026-03-20T10:00:00.000Z");
}

function userMessageLine(message: string, ts?: string): string {
  return codexLine("event_msg", {
    type: "user_message",
    message,
    images: [],
  }, ts ?? "2026-03-20T10:00:05.000Z");
}

function taskStartedLine(ts?: string): string {
  return codexLine("event_msg", {
    type: "task_started",
    turn_id: "turn-" + Date.now(),
    model_context_window: 258400,
  }, ts ?? "2026-03-20T10:00:05.000Z");
}

function functionCallLine(name: string, args: Record<string, unknown>, callId: string, ts?: string): string {
  return codexLine("response_item", {
    type: "function_call",
    name,
    arguments: JSON.stringify(args),
    call_id: callId,
  }, ts ?? "2026-03-20T10:00:10.000Z");
}

function functionCallOutputLine(callId: string, output: string, ts?: string): string {
  return codexLine("response_item", {
    type: "function_call_output",
    call_id: callId,
    output,
  }, ts ?? "2026-03-20T10:00:11.000Z");
}

function assistantMessageLine(text: string, ts?: string): string {
  return codexLine("response_item", {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  }, ts ?? "2026-03-20T10:00:15.000Z");
}

function agentMessageLine(message: string, ts?: string): string {
  return codexLine("event_msg", {
    type: "agent_message",
    message,
    phase: "commentary",
  }, ts ?? "2026-03-20T10:00:12.000Z");
}

function applyPatchLine(patch: string, callId: string, ts?: string): string {
  return codexLine("response_item", {
    type: "custom_tool_call",
    status: "completed",
    name: "apply_patch",
    input: patch,
    call_id: callId,
  }, ts ?? "2026-03-20T10:00:20.000Z");
}

function tokenCountLine(ts?: string): string {
  return codexLine("event_msg", {
    type: "token_count",
    info: {
      total_token_usage: { input_tokens: 5000, output_tokens: 200, total_tokens: 5200 },
    },
  }, ts ?? "2026-03-20T10:00:16.000Z");
}

const BASIC_SESSION = [
  sessionMetaLine("/Users/test/myproject", "session-001", "2026-03-20T10:00:00.000Z"),
  taskStartedLine("2026-03-20T10:00:01.000Z"),
  userMessageLine("List the files in this project", "2026-03-20T10:00:02.000Z"),
  agentMessageLine("Looking at the project structure.", "2026-03-20T10:00:03.000Z"),
  assistantMessageLine("Looking at the project structure.", "2026-03-20T10:00:04.000Z"),
  functionCallLine("exec_command", { cmd: "rg --files .", workdir: "/Users/test/myproject" }, "call_001", "2026-03-20T10:00:05.000Z"),
  functionCallOutputLine("call_001", "src/main.ts\nsrc/utils.ts\n", "2026-03-20T10:00:06.000Z"),
  assistantMessageLine("Found 2 files: src/main.ts and src/utils.ts", "2026-03-20T10:00:07.000Z"),
  tokenCountLine("2026-03-20T10:00:08.000Z"),
].join("\n") + "\n";

const PATCH_SESSION = [
  sessionMetaLine("/Users/test/patchproject", "session-002", "2026-03-20T11:00:00.000Z"),
  taskStartedLine("2026-03-20T11:00:01.000Z"),
  userMessageLine("Fix the bug", "2026-03-20T11:00:02.000Z"),
  functionCallLine("exec_command", { cmd: "cat src/app.ts", workdir: "/Users/test/patchproject" }, "call_010", "2026-03-20T11:00:03.000Z"),
  functionCallOutputLine("call_010", "const x = 1;", "2026-03-20T11:00:04.000Z"),
  applyPatchLine(
    "*** Begin Patch\n*** Update File: /Users/test/patchproject/src/app.ts\n@@\n-const x = 1;\n+const x = 2;\n*** End Patch\n",
    "call_011",
    "2026-03-20T11:00:05.000Z",
  ),
  assistantMessageLine("Fixed the value.", "2026-03-20T11:00:06.000Z"),
].join("\n") + "\n";

const MULTI_TURN_SESSION = [
  sessionMetaLine("/Users/test/multi", "session-003", "2026-03-20T12:00:00.000Z"),
  taskStartedLine("2026-03-20T12:00:01.000Z"),
  userMessageLine("Hello", "2026-03-20T12:00:02.000Z"),
  assistantMessageLine("Hi there", "2026-03-20T12:00:03.000Z"),
  taskStartedLine("2026-03-20T12:06:00.000Z"),
  userMessageLine("Do something else", "2026-03-20T12:06:01.000Z"),
  assistantMessageLine("Done", "2026-03-20T12:06:02.000Z"),
  taskStartedLine("2026-03-20T12:12:00.000Z"),
  userMessageLine("One more thing", "2026-03-20T12:12:01.000Z"),
  assistantMessageLine("Finished", "2026-03-20T12:12:02.000Z"),
].join("\n") + "\n";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = join(tmpdir(), `codex-parser-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("codexParser.detect", () => {
  it("detects a valid Codex session file", async () => {
    const path = join(tmpDir, "valid-codex.jsonl");
    await writeFile(path, BASIC_SESSION);
    expect(await codexParser.detect(path)).toBe(true);
  });

  it("rejects non-jsonl files", async () => {
    const path = join(tmpDir, "readme.txt");
    await writeFile(path, "just text");
    expect(await codexParser.detect(path)).toBe(false);
  });

  it("rejects Claude sessions (no session_meta)", async () => {
    const path = join(tmpDir, "claude.jsonl");
    await writeFile(path, JSON.stringify({ type: "user", sessionId: "abc", version: "2.1.80", uuid: "x", timestamp: "2026-01-01T00:00:00Z" }) + "\n");
    expect(await codexParser.detect(path)).toBe(false);
  });

  it("rejects non-existent files", async () => {
    expect(await codexParser.detect(join(tmpDir, "nope.jsonl"))).toBe(false);
  });
});

describe("codexParser.parse — basic session", () => {
  let result: Awaited<ReturnType<typeof codexParser.parse>>;

  beforeAll(async () => {
    const path = join(tmpDir, "basic-codex.jsonl");
    await writeFile(path, BASIC_SESSION);
    result = await codexParser.parse(path);
  });

  it("identifies source as codex", () => {
    expect(result.source).toBe("codex");
  });

  it("extracts cwd from session_meta", () => {
    expect(result.cwd).toBe("/Users/test/myproject");
  });

  it("counts turns from task_started events", () => {
    expect(result.turns).toBe(1);
  });

  it("extracts tool calls and normalizes exec_command to Bash", () => {
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0].name).toBe("Bash");
    expect(result.tool_calls[0].input.cmd).toBe("rg --files .");
  });

  it("extracts files touched from workdir", () => {
    expect(result.files_touched).toContain("/Users/test/myproject");
  });

  it("computes duration from timestamps", () => {
    expect(result.duration_ms).toBe(8000);
    expect(result.wall_clock_ms).toBe(8000);
  });

  it("captures start and end times", () => {
    expect(result.start_time).toBe("2026-03-20T10:00:00.000Z");
    expect(result.end_time).toBe("2026-03-20T10:00:08.000Z");
  });

  it("converts to raw entries", () => {
    expect(result.raw_entries.length).toBeGreaterThan(0);
    expect(result.raw_entries[0].sessionId).toBe("session-001");
  });
});

describe("codexParser.parse — apply_patch session", () => {
  let result: Awaited<ReturnType<typeof codexParser.parse>>;

  beforeAll(async () => {
    const path = join(tmpDir, "patch-codex.jsonl");
    await writeFile(path, PATCH_SESSION);
    result = await codexParser.parse(path);
  });

  it("extracts apply_patch as Edit tool call", () => {
    const editCalls = result.tool_calls.filter((c) => c.name === "Edit");
    expect(editCalls).toHaveLength(1);
  });

  it("extracts files from patch content", () => {
    expect(result.files_touched).toContain("/Users/test/patchproject/src/app.ts");
  });

  it("computes LOC stats from patches", () => {
    expect(result.loc_stats.loc_added).toBe(1);
    expect(result.loc_stats.loc_removed).toBe(1);
    expect(result.loc_stats.loc_net).toBe(0);
    expect(result.loc_stats.files_changed).toContain("/Users/test/patchproject/src/app.ts");
  });
});

describe("codexParser.parse — multi-turn session", () => {
  let result: Awaited<ReturnType<typeof codexParser.parse>>;

  beforeAll(async () => {
    const path = join(tmpDir, "multi-turn-codex.jsonl");
    await writeFile(path, MULTI_TURN_SESSION);
    result = await codexParser.parse(path);
  });

  it("counts 3 turns from task_started events", () => {
    expect(result.turns).toBe(3);
  });

  it("computes active duration excluding idle gaps", () => {
    // Gaps: 12:00:00->03 (3s), 12:00:03->12:06:00 (idle >5min),
    // 12:06:00->02 (2s), 12:06:02->12:12:00 (idle >5min),
    // 12:12:00->02 (2s) => 3+2+2 = 7s active
    expect(result.duration_ms).toBe(7000);
  });

  it("wall clock covers full span", () => {
    // 12:00:00 -> 12:12:02 = 722000ms
    expect(result.wall_clock_ms).toBe(722000);
  });
});

describe("codexParser.parse — raw entry conversion", () => {
  it("maps user_message events to user type", async () => {
    const path = join(tmpDir, "raw-entries.jsonl");
    await writeFile(path, BASIC_SESSION);
    const result = await codexParser.parse(path);
    const userEntries = result.raw_entries.filter((e) => e.type === "user");
    expect(userEntries.length).toBeGreaterThan(0);
    expect(userEntries[0].message?.role).toBe("user");
  });

  it("maps agent_message events to assistant type", async () => {
    const path = join(tmpDir, "raw-entries-agent.jsonl");
    await writeFile(path, BASIC_SESSION);
    const result = await codexParser.parse(path);
    const assistantEntries = result.raw_entries.filter(
      (e) => e.type === "assistant" && e.message?.role === "assistant",
    );
    expect(assistantEntries.length).toBeGreaterThan(0);
  });
});

describe("codexParser.parse — edge cases", () => {
  it("handles empty file", async () => {
    const path = join(tmpDir, "empty-codex.jsonl");
    await writeFile(path, "");
    const result = await codexParser.parse(path);
    expect(result.turns).toBe(1);
    expect(result.tool_calls).toHaveLength(0);
    expect(result.raw_entries).toHaveLength(0);
  });

  it("handles malformed lines gracefully", async () => {
    const path = join(tmpDir, "malformed-codex.jsonl");
    const content = sessionMetaLine("/test", "s1") + "\n{broken\n" + assistantMessageLine("ok") + "\n";
    await writeFile(path, content);
    const result = await codexParser.parse(path);
    expect(result.raw_entries).toHaveLength(2);
  });
});

describe("discoverCodexSessions", () => {
  it("discovers sessions from ~/.codex/sessions/ structure", async () => {
    // This test reads real filesystem — just verify it returns an array
    const sessions = await discoverCodexSessions();
    expect(Array.isArray(sessions)).toBe(true);
    for (const s of sessions) {
      expect(s).toHaveProperty("path");
      expect(s).toHaveProperty("sessionId");
      expect(s).toHaveProperty("cwd");
    }
  });
});
