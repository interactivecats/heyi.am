import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claudeParser, computeLocStats } from "./claude.js";
import { parseSession, listSessions } from "./index.js";
import type { RawEntry } from "./types.js";

// --- Test fixtures based on real Claude Code JSONL structure ---

function makeEntry(overrides: Partial<RawEntry> & { type: string }): RawEntry {
  return {
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: "test-session-001",
    version: "2.1.80",
    ...overrides,
  } as RawEntry;
}

function userEntry(content: string | object[], ts?: string): RawEntry {
  return makeEntry({
    type: "user",
    timestamp: ts ?? "2026-03-20T10:00:00.000Z",
    message: {
      role: "user",
      content: typeof content === "string" ? content : content,
    },
  });
}

function assistantEntry(
  contentBlocks: object[],
  ts?: string,
): RawEntry {
  return makeEntry({
    type: "assistant",
    timestamp: ts ?? "2026-03-20T10:00:05.000Z",
    message: {
      role: "assistant",
      model: "claude-opus-4-6",
      id: "msg_test",
      content: contentBlocks as any,
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  });
}

function systemEntry(subtype: string, ts?: string): RawEntry {
  return makeEntry({
    type: "system",
    subtype,
    timestamp: ts ?? "2026-03-20T10:00:06.000Z",
    ...(subtype === "turn_duration" ? { durationMs: 5000 } : {}),
  });
}

function progressEntry(ts?: string): RawEntry {
  return makeEntry({
    type: "progress",
    timestamp: ts ?? "2026-03-20T10:00:01.000Z",
  });
}

// Realistic session: user asks question, assistant reads a file, responds
const BASIC_SESSION: RawEntry[] = [
  userEntry("How does the router work?", "2026-03-20T10:00:00.000Z"),
  progressEntry("2026-03-20T10:00:01.000Z"),
  assistantEntry(
    [
      { type: "thinking", thinking: "Let me read the router..." },
      {
        type: "tool_use",
        id: "toolu_001",
        name: "Read",
        input: { file_path: "/app/router.ex" },
      },
    ],
    "2026-03-20T10:00:02.000Z",
  ),
  // tool_result comes back in a user entry
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_001", content: [{ type: "tool_reference", tool_name: "Read" }] }],
    "2026-03-20T10:00:03.000Z",
  ),
  assistantEntry(
    [{ type: "text", text: "The router defines your routes..." }],
    "2026-03-20T10:00:05.000Z",
  ),
  systemEntry("turn_duration", "2026-03-20T10:00:06.000Z"),
];

// Session with Write and Edit tool calls for LOC testing
const LOC_SESSION: RawEntry[] = [
  userEntry("Create a helper module", "2026-03-20T11:00:00.000Z"),
  assistantEntry(
    [
      {
        type: "tool_use",
        id: "toolu_010",
        name: "Write",
        input: {
          file_path: "/app/helpers.ts",
          content: "export function add(a: number, b: number) {\n  return a + b;\n}\n",
        },
      },
    ],
    "2026-03-20T11:00:05.000Z",
  ),
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_010", content: [] }],
    "2026-03-20T11:00:06.000Z",
  ),
  assistantEntry(
    [
      {
        type: "tool_use",
        id: "toolu_011",
        name: "Edit",
        input: {
          file_path: "/app/index.ts",
          old_string: "console.log('hello');",
          new_string: "import { add } from './helpers.js';\nconsole.log(add(1, 2));",
        },
      },
    ],
    "2026-03-20T11:00:10.000Z",
  ),
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_011", content: [] }],
    "2026-03-20T11:00:11.000Z",
  ),
  assistantEntry(
    [{ type: "text", text: "Done! I created the helper and updated index." }],
    "2026-03-20T11:00:15.000Z",
  ),
  systemEntry("turn_duration", "2026-03-20T11:00:16.000Z"),
];

// Session with duplicate writes to same file (last write wins)
const OVERWRITE_SESSION: RawEntry[] = [
  userEntry("Write and then rewrite the config", "2026-03-20T12:00:00.000Z"),
  assistantEntry(
    [
      {
        type: "tool_use",
        id: "toolu_020",
        name: "Write",
        input: {
          file_path: "/app/config.ts",
          content: "export const PORT = 3000;\n",
        },
      },
    ],
    "2026-03-20T12:00:02.000Z",
  ),
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_020", content: [] }],
    "2026-03-20T12:00:03.000Z",
  ),
  assistantEntry(
    [
      {
        type: "tool_use",
        id: "toolu_021",
        name: "Write",
        input: {
          file_path: "/app/config.ts",
          content: "export const PORT = 8080;\nexport const HOST = 'localhost';\n",
        },
      },
    ],
    "2026-03-20T12:00:05.000Z",
  ),
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_021", content: [] }],
    "2026-03-20T12:00:06.000Z",
  ),
  assistantEntry(
    [{ type: "text", text: "Updated config with host." }],
    "2026-03-20T12:00:08.000Z",
  ),
];

function toJsonl(entries: RawEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

// --- Tests ---

let tmpDir: string;

beforeAll(async () => {
  tmpDir = join(tmpdir(), `claude-parser-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("claudeParser.detect", () => {
  it("detects a valid Claude session file", async () => {
    const path = join(tmpDir, "valid.jsonl");
    await writeFile(path, toJsonl(BASIC_SESSION));
    expect(await claudeParser.detect(path)).toBe(true);
  });

  it("rejects non-jsonl files", async () => {
    const path = join(tmpDir, "readme.txt");
    await writeFile(path, "just text");
    expect(await claudeParser.detect(path)).toBe(false);
  });

  it("rejects jsonl without sessionId", async () => {
    const path = join(tmpDir, "other.jsonl");
    await writeFile(path, JSON.stringify({ type: "event", data: "stuff" }) + "\n");
    expect(await claudeParser.detect(path)).toBe(false);
  });

  it("rejects non-existent files", async () => {
    expect(await claudeParser.detect(join(tmpDir, "nope.jsonl"))).toBe(false);
  });
});

describe("claudeParser.parse — basic session", () => {
  let result: Awaited<ReturnType<typeof claudeParser.parse>>;

  beforeAll(async () => {
    const path = join(tmpDir, "basic-session.jsonl");
    await writeFile(path, toJsonl(BASIC_SESSION));
    result = await claudeParser.parse(path);
  });

  it("identifies source as claude", () => {
    expect(result.source).toBe("claude");
  });

  it("counts turns correctly", () => {
    // user -> assistant (with tool_use) -> user (tool_result) -> assistant (text)
    // Turn 1: first user -> first assistant
    // The tool_result user entry followed by second assistant = Turn 2
    expect(result.turns).toBe(2);
  });

  it("extracts tool calls", () => {
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0].name).toBe("Read");
    expect(result.tool_calls[0].input.file_path).toBe("/app/router.ex");
  });

  it("extracts files touched", () => {
    expect(result.files_touched).toContain("/app/router.ex");
  });

  it("computes duration from timestamps", () => {
    // 10:00:00 to 10:00:06 = 6000ms
    expect(result.duration_ms).toBe(6000);
  });

  it("captures start and end times", () => {
    expect(result.start_time).toBe("2026-03-20T10:00:00.000Z");
    expect(result.end_time).toBe("2026-03-20T10:00:06.000Z");
  });

  it("preserves raw entries", () => {
    expect(result.raw_entries).toHaveLength(BASIC_SESSION.length);
  });
});

describe("computeLocStats", () => {
  it("counts lines from Write calls", () => {
    const stats = computeLocStats(LOC_SESSION);
    // Write: "export function add(a: number, b: number) {\n  return a + b;\n}\n" = 4 lines (trailing newline creates empty last)
    expect(stats.loc_added).toBeGreaterThan(0);
    expect(stats.files_changed).toContain("/app/helpers.ts");
    expect(stats.files_changed).toContain("/app/index.ts");
  });

  it("counts added and removed lines from Edit calls", () => {
    const stats = computeLocStats(LOC_SESSION);
    // Edit: old_string is 1 line, new_string is 2 lines
    // So removed >= 1, added includes the 2 from Edit plus Write lines
    expect(stats.loc_removed).toBe(1);
  });

  it("deduplicates multiple writes to the same file (last write wins)", () => {
    const stats = computeLocStats(OVERWRITE_SESSION);
    // First write: 2 lines ("export const PORT = 3000;\n")
    // Second write: 3 lines ("export const PORT = 8080;\nexport const HOST = 'localhost';\n")
    // After dedup, only the second write's 3 lines count
    expect(stats.loc_added).toBe(3);
    expect(stats.files_changed).toEqual(["/app/config.ts"]);
  });

  it("handles empty session", () => {
    const stats = computeLocStats([]);
    expect(stats.loc_added).toBe(0);
    expect(stats.loc_removed).toBe(0);
    expect(stats.loc_net).toBe(0);
    expect(stats.files_changed).toEqual([]);
  });

  it("computes net correctly", () => {
    const stats = computeLocStats(LOC_SESSION);
    expect(stats.loc_net).toBe(stats.loc_added - stats.loc_removed);
  });
});

describe("parseSession (registry)", () => {
  it("auto-detects and parses a Claude session", async () => {
    const path = join(tmpDir, "registry-test.jsonl");
    await writeFile(path, toJsonl(BASIC_SESSION));
    const result = await parseSession(path);
    expect(result.source).toBe("claude");
    expect(result.turns).toBeGreaterThan(0);
  });

  it("throws for unrecognized format", async () => {
    const path = join(tmpDir, "unknown.jsonl");
    await writeFile(path, JSON.stringify({ weird: true }) + "\n");
    await expect(parseSession(path)).rejects.toThrow("No parser detected");
  });
});

describe("listSessions", () => {
  it("finds session files in a directory tree", async () => {
    const scanDir = join(tmpDir, "scan-test");
    const projectDir = join(scanDir, "my-project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "abc-123.jsonl"), toJsonl(BASIC_SESSION));
    await writeFile(join(projectDir, "not-a-session.txt"), "nope");

    const sessions = await listSessions(scanDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("abc-123");
    expect(sessions[0].source).toBe("claude");
  });

  it("returns empty array for non-existent path", async () => {
    const sessions = await listSessions(join(tmpDir, "does-not-exist"));
    expect(sessions).toEqual([]);
  });
});

describe("edge cases", () => {
  it("handles session with only system entries", async () => {
    const path = join(tmpDir, "system-only.jsonl");
    const entries = [
      systemEntry("compact_boundary", "2026-03-20T10:00:00.000Z"),
      systemEntry("turn_duration", "2026-03-20T10:00:01.000Z"),
    ];
    await writeFile(path, toJsonl(entries));
    // Won't detect as Claude (no version field in system entries by default)
    // Let's make proper entries
    const properEntries = entries.map((e) => ({ ...e, version: "2.1.80" }));
    await writeFile(path, toJsonl(properEntries as RawEntry[]));
    const result = await claudeParser.parse(path);
    expect(result.turns).toBe(0);
    expect(result.tool_calls).toHaveLength(0);
  });

  it("handles malformed lines gracefully", async () => {
    const path = join(tmpDir, "malformed.jsonl");
    const content =
      JSON.stringify({ ...BASIC_SESSION[0], version: "2.1.80" }) +
      "\n{broken json\n" +
      JSON.stringify({ ...BASIC_SESSION[1], version: "2.1.80" }) +
      "\n";
    await writeFile(path, content);
    const result = await claudeParser.parse(path);
    // Should parse 2 entries, skip the broken one
    expect(result.raw_entries).toHaveLength(2);
  });

  it("handles assistant entry with string content (not array)", async () => {
    const path = join(tmpDir, "string-content.jsonl");
    const entries = [
      userEntry("hello", "2026-03-20T10:00:00.000Z"),
      makeEntry({
        type: "assistant",
        timestamp: "2026-03-20T10:00:01.000Z",
        message: { role: "assistant", content: "plain text response" },
      }),
    ];
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.turns).toBe(1);
    expect(result.tool_calls).toHaveLength(0);
  });
});
