import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claudeParser, computeLocStats, mapAgentRole, extractAgentRoles, extractAgentIdFromEntries } from "./claude.js";
import { parseSession, listSessions } from "./index.js";
import type { RawEntry, ContentBlock } from "./types.js";

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

function userEntry(content: string | ContentBlock[], ts?: string): RawEntry {
  return makeEntry({
    type: "user",
    timestamp: ts ?? "2026-03-20T10:00:00.000Z",
    message: {
      role: "user",
      content,
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

// Session with Write(10) -> Edit(+5/-3) -> Write(8) pattern
// The final Write overwrites everything, so Edit additions/deletions should be reset
const WRITE_EDIT_WRITE_SESSION: RawEntry[] = [
  userEntry("Create and iterate on a file", "2026-03-20T13:00:00.000Z"),
  assistantEntry(
    [
      {
        type: "tool_use",
        id: "toolu_030",
        name: "Write",
        input: {
          file_path: "/app/service.ts",
          // 10 lines
          content: "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10",
        },
      },
    ],
    "2026-03-20T13:00:02.000Z",
  ),
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_030", content: [] }],
    "2026-03-20T13:00:03.000Z",
  ),
  assistantEntry(
    [
      {
        type: "tool_use",
        id: "toolu_031",
        name: "Edit",
        input: {
          file_path: "/app/service.ts",
          old_string: "line3\nline4\nline5",  // 3 lines removed
          new_string: "newA\nnewB\nnewC\nnewD\nnewE",  // 5 lines added
        },
      },
    ],
    "2026-03-20T13:00:05.000Z",
  ),
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_031", content: [] }],
    "2026-03-20T13:00:06.000Z",
  ),
  assistantEntry(
    [
      {
        type: "tool_use",
        id: "toolu_032",
        name: "Write",
        input: {
          file_path: "/app/service.ts",
          // 8 lines — final overwrite
          content: "final1\nfinal2\nfinal3\nfinal4\nfinal5\nfinal6\nfinal7\nfinal8",
        },
      },
    ],
    "2026-03-20T13:00:08.000Z",
  ),
  userEntry(
    [{ type: "tool_result", tool_use_id: "toolu_032", content: [] }],
    "2026-03-20T13:00:09.000Z",
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

  it("resets Edit accumulations when a subsequent Write overwrites the file", () => {
    const stats = computeLocStats(WRITE_EDIT_WRITE_SESSION);
    // Write(10 lines) -> Edit(+5/-3) -> Write(8 lines)
    // Without fix: added = 10 + 5 - 10 + 8 = 13, removed = 3
    // With fix: the final Write resets Edit accumulations:
    //   After Write(10): added=10, removed=0
    //   After Edit(+5/-3): added=15, removed=3, editAdded=5, editRemoved=3
    //   After Write(8): subtract editAdded(5) and editRemoved(3),
    //     then dedup write (subtract prev 10, add 8)
    //   Result: added = 15 - 5 - 10 + 8 = 8, removed = 3 - 3 = 0
    expect(stats.loc_added).toBe(8);
    expect(stats.loc_removed).toBe(0);
    expect(stats.loc_net).toBe(8);
    expect(stats.files_changed).toEqual(["/app/service.ts"]);
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

describe("extractFilesTouched — Glob/Grep exclusion", () => {
  it("does NOT count Glob paths as files touched", async () => {
    const entries: RawEntry[] = [
      userEntry("Search for files", "2026-03-20T10:00:00.000Z"),
      assistantEntry(
        [
          {
            type: "tool_use",
            id: "toolu_glob_001",
            name: "Glob",
            input: { path: "/app/src", pattern: "**/*.ts" },
          },
        ],
        "2026-03-20T10:00:02.000Z",
      ),
      assistantEntry(
        [{ type: "text", text: "Found files." }],
        "2026-03-20T10:00:05.000Z",
      ),
    ];

    const path = join(tmpDir, "glob-test.jsonl");
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.files_touched).not.toContain("/app/src");
    expect(result.files_touched).toHaveLength(0);
  });

  it("does NOT count Grep paths as files touched", async () => {
    const entries: RawEntry[] = [
      userEntry("Search for pattern", "2026-03-20T10:00:00.000Z"),
      assistantEntry(
        [
          {
            type: "tool_use",
            id: "toolu_grep_001",
            name: "Grep",
            input: { pattern: "TODO", path: "/app" },
          },
        ],
        "2026-03-20T10:00:02.000Z",
      ),
      assistantEntry(
        [{ type: "text", text: "Found matches." }],
        "2026-03-20T10:00:05.000Z",
      ),
    ];

    const path = join(tmpDir, "grep-test.jsonl");
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.files_touched).not.toContain("/app");
    expect(result.files_touched).toHaveLength(0);
  });

  it("still counts Read, Write, and Edit as files touched", async () => {
    const entries: RawEntry[] = [
      userEntry("Work on files", "2026-03-20T10:00:00.000Z"),
      assistantEntry(
        [
          { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/app/main.ts" } },
          { type: "tool_use", id: "t2", name: "Write", input: { file_path: "/app/new.ts", content: "x" } },
          { type: "tool_use", id: "t3", name: "Edit", input: { file_path: "/app/edit.ts", old_string: "a", new_string: "b" } },
          { type: "tool_use", id: "t4", name: "Glob", input: { path: "/app/src", pattern: "**/*" } },
          { type: "tool_use", id: "t5", name: "Grep", input: { pattern: "TODO", path: "/app" } },
        ],
        "2026-03-20T10:00:02.000Z",
      ),
    ];

    const path = join(tmpDir, "mixed-tools-test.jsonl");
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.files_touched).toContain("/app/main.ts");
    expect(result.files_touched).toContain("/app/new.ts");
    expect(result.files_touched).toContain("/app/edit.ts");
    expect(result.files_touched).not.toContain("/app/src");
    expect(result.files_touched).not.toContain("/app");
    expect(result.files_touched).toHaveLength(3);
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

// --- Agent role extraction ---

describe("mapAgentRole", () => {
  it("strips trc- prefix from teamrc agent names", () => {
    expect(mapAgentRole("trc-frontend-dev")).toBe("frontend-dev");
    expect(mapAgentRole("trc-backend-dev")).toBe("backend-dev");
    expect(mapAgentRole("trc-qa-engineer")).toBe("qa-engineer");
  });

  it("lowercases built-in subagent types", () => {
    expect(mapAgentRole("Explore")).toBe("explore");
    expect(mapAgentRole("Plan")).toBe("plan");
  });
});

describe("extractAgentRoles", () => {
  it("extracts roles from Agent tool calls with subagent_type", () => {
    const entries: RawEntry[] = [
      assistantEntry([
        {
          type: "tool_use",
          id: "toolu_agent_001",
          name: "Agent",
          input: { subagent_type: "trc-frontend-dev", prompt: "Build the UI" },
        },
      ]),
      assistantEntry([
        {
          type: "tool_use",
          id: "toolu_agent_002",
          name: "Agent",
          input: { subagent_type: "Explore", prompt: "Find the file" },
        },
      ]),
    ];
    const roles = extractAgentRoles(entries);
    expect(roles.get("toolu_agent_001")).toBe("frontend-dev");
    expect(roles.get("toolu_agent_002")).toBe("explore");
  });

  it("ignores non-Agent tool calls", () => {
    const entries: RawEntry[] = [
      assistantEntry([
        {
          type: "tool_use",
          id: "toolu_read_001",
          name: "Read",
          input: { file_path: "/app/main.ts" },
        },
      ]),
    ];
    const roles = extractAgentRoles(entries);
    expect(roles.size).toBe(0);
  });

  it("ignores Agent calls without subagent_type", () => {
    const entries: RawEntry[] = [
      assistantEntry([
        {
          type: "tool_use",
          id: "toolu_agent_003",
          name: "Agent",
          input: { prompt: "Do something" },
        },
      ]),
    ];
    const roles = extractAgentRoles(entries);
    expect(roles.size).toBe(0);
  });
});

describe("extractAgentIdFromEntries", () => {
  it("extracts agentId from first entry", () => {
    const entries: RawEntry[] = [
      { ...makeEntry({ type: "user" }), agentId: "agent-frontend-abc" } as any,
      makeEntry({ type: "assistant" }),
    ];
    expect(extractAgentIdFromEntries(entries)).toBe("agent-frontend-abc");
  });

  it("returns undefined when no agentId present", () => {
    const entries: RawEntry[] = [makeEntry({ type: "user" }), makeEntry({ type: "assistant" })];
    expect(extractAgentIdFromEntries(entries)).toBeUndefined();
  });
});

// --- Parent-child linking in listSessions ---

describe("listSessions — parent-child linking", () => {
  it("nests child sessions under parent and excludes them from top level", async () => {
    const scanDir = join(tmpDir, "linking-test");
    const projectDir = join(scanDir, "my-project");
    const parentId = "parent-uuid-001";
    const childId = "child-uuid-001";

    // Create parent session file
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, `${parentId}.jsonl`), toJsonl(BASIC_SESSION));

    // Create child session in {parentId}/subagents/
    const subagentsDir = join(projectDir, parentId, "subagents");
    await mkdir(subagentsDir, { recursive: true });
    await writeFile(join(subagentsDir, `${childId}.jsonl`), toJsonl(BASIC_SESSION));

    const sessions = await listSessions(scanDir);

    // Only the parent should appear at top level
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe(parentId);
    expect(sessions[0].isSubagent).toBe(false);

    // Child should be nested
    expect(sessions[0].children).toHaveLength(1);
    expect(sessions[0].children![0].sessionId).toBe(childId);
    expect(sessions[0].children![0].isSubagent).toBe(true);
    expect(sessions[0].children![0].parentSessionId).toBe(parentId);
  });

  it("handles parent with no children (no children array)", async () => {
    const scanDir = join(tmpDir, "no-children-test");
    const projectDir = join(scanDir, "solo-project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "solo-session.jsonl"), toJsonl(BASIC_SESSION));

    const sessions = await listSessions(scanDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].children).toBeUndefined();
  });

  it("handles multiple children under one parent", async () => {
    const scanDir = join(tmpDir, "multi-child-test");
    const projectDir = join(scanDir, "multi-project");
    const parentId = "parent-multi-001";

    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, `${parentId}.jsonl`), toJsonl(BASIC_SESSION));

    const subagentsDir = join(projectDir, parentId, "subagents");
    await mkdir(subagentsDir, { recursive: true });
    await writeFile(join(subagentsDir, "child-a.jsonl"), toJsonl(BASIC_SESSION));
    await writeFile(join(subagentsDir, "child-b.jsonl"), toJsonl(BASIC_SESSION));
    await writeFile(join(subagentsDir, "child-c.jsonl"), toJsonl(BASIC_SESSION));

    const sessions = await listSessions(scanDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].children).toHaveLength(3);
    const childIds = sessions[0].children!.map((c) => c.sessionId).sort();
    expect(childIds).toEqual(["child-a", "child-b", "child-c"]);
  });

  it("handles empty subagents directory", async () => {
    const scanDir = join(tmpDir, "empty-subagents-test");
    const projectDir = join(scanDir, "empty-project");
    const parentId = "parent-empty-001";

    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, `${parentId}.jsonl`), toJsonl(BASIC_SESSION));

    // Create empty subagents dir
    await mkdir(join(projectDir, parentId, "subagents"), { recursive: true });

    const sessions = await listSessions(scanDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].children).toBeUndefined();
  });

  it("handles orphan children (subagent dir without matching parent .jsonl)", async () => {
    const scanDir = join(tmpDir, "orphan-test");
    const projectDir = join(scanDir, "orphan-project");

    await mkdir(projectDir, { recursive: true });
    // No parent .jsonl, but subagents dir exists
    const subagentsDir = join(projectDir, "orphan-parent-id", "subagents");
    await mkdir(subagentsDir, { recursive: true });
    await writeFile(join(subagentsDir, "orphan-child.jsonl"), toJsonl(BASIC_SESSION));

    const sessions = await listSessions(scanDir);
    // Orphan children are not returned at the top level (no parent to attach to)
    expect(sessions).toHaveLength(0);
  });
});

// --- Token usage extraction ---

describe("token usage extraction", () => {
  it("aggregates token usage across assistant messages", async () => {
    const path = join(tmpDir, "token-usage.jsonl");
    await writeFile(path, toJsonl(BASIC_SESSION));
    const result = await claudeParser.parse(path);
    // BASIC_SESSION has 2 assistant entries with usage: { input_tokens: 100, output_tokens: 50 }
    expect(result.token_usage).toBeDefined();
    expect(result.token_usage!.input_tokens).toBe(200);
    expect(result.token_usage!.output_tokens).toBe(100);
  });

  it("returns undefined when no assistant messages have usage", async () => {
    const path = join(tmpDir, "no-usage.jsonl");
    const entries = [
      userEntry("hello", "2026-03-20T10:00:00.000Z"),
      makeEntry({
        type: "assistant",
        timestamp: "2026-03-20T10:00:01.000Z",
        message: { role: "assistant", content: "hi" },
      }),
    ];
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.token_usage).toBeUndefined();
  });
});

// --- Model extraction ---

describe("model extraction", () => {
  it("extracts unique models from assistant messages", async () => {
    const path = join(tmpDir, "models.jsonl");
    await writeFile(path, toJsonl(BASIC_SESSION));
    const result = await claudeParser.parse(path);
    // Both assistant entries in BASIC_SESSION use "claude-opus-4-6"
    expect(result.models_used).toEqual(["claude-opus-4-6"]);
  });

  it("returns undefined when no model info is present", async () => {
    const path = join(tmpDir, "no-models.jsonl");
    const entries = [
      userEntry("hello", "2026-03-20T10:00:00.000Z"),
      makeEntry({
        type: "assistant",
        timestamp: "2026-03-20T10:00:01.000Z",
        message: { role: "assistant", content: "hi" },
      }),
    ];
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.models_used).toBeUndefined();
  });
});

// --- Custom title and slug extraction ---

describe("session metadata extraction", () => {
  it("extracts custom-title when present", async () => {
    const path = join(tmpDir, "custom-title.jsonl");
    const entries: RawEntry[] = [
      ...BASIC_SESSION,
      makeEntry({ type: "custom-title", customTitle: "Fix the auth bug" } as any),
    ];
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.custom_title).toBe("Fix the auth bug");
  });

  it("extracts slug from first entry that has one", async () => {
    const path = join(tmpDir, "slug.jsonl");
    const entries: RawEntry[] = BASIC_SESSION.map((e, i) =>
      i === 0 ? { ...e, slug: "zesty-singing-newell" } : e
    );
    await writeFile(path, toJsonl(entries));
    const result = await claudeParser.parse(path);
    expect(result.slug).toBe("zesty-singing-newell");
  });

  it("returns undefined when no title/slug present", async () => {
    const path = join(tmpDir, "no-meta.jsonl");
    await writeFile(path, toJsonl(BASIC_SESSION));
    const result = await claudeParser.parse(path);
    expect(result.custom_title).toBeUndefined();
    expect(result.slug).toBeUndefined();
  });
});
