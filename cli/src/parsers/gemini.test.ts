import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  geminiParser,
  parseGeminiLog,
  groupBySession,
  analyzeSession,
  extractFileRefsFromText,
  hashProjectDir,
  resolveProjectDirs,
  discoverGeminiSessions,
  type GeminiSessionFile,
} from "./gemini.js";

// --- Fixtures ---

const SESSION_A = [
  { sessionId: "aaa-111", messageId: 0, type: "user", message: "Describe the architecture.", timestamp: "2025-06-26T08:00:00.000Z" },
  { sessionId: "aaa-111", messageId: 1, type: "user", message: "Read @src/router.ts and explain it.", timestamp: "2025-06-26T08:01:00.000Z" },
  { sessionId: "aaa-111", messageId: 2, type: "user", message: "Now update @src/config.ts", timestamp: "2025-06-26T08:03:00.000Z" },
];

const SESSION_B = [
  { sessionId: "bbb-222", messageId: 0, type: "user", message: "Fix the bug in /app/server.ts", timestamp: "2025-06-26T09:00:00.000Z" },
];

const MIXED_LOG = [...SESSION_A, ...SESSION_B];

const SESSION_WITH_GAP = [
  { sessionId: "gap-001", messageId: 0, type: "user", message: "Start work", timestamp: "2025-06-26T10:00:00.000Z" },
  { sessionId: "gap-001", messageId: 1, type: "user", message: "Back after break", timestamp: "2025-06-26T10:30:00.000Z" },
  { sessionId: "gap-001", messageId: 2, type: "user", message: "Continue", timestamp: "2025-06-26T10:31:00.000Z" },
];

function toJson(entries: object[]): string {
  return JSON.stringify(entries, null, 2);
}

let tmpDir: string;

beforeAll(async () => {
  tmpDir = join(tmpdir(), `gemini-parser-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// --- parseGeminiLog ---

describe("parseGeminiLog", () => {
  it("parses valid JSON array", () => {
    const entries = parseGeminiLog(toJson(SESSION_A));
    expect(entries).toHaveLength(3);
    expect(entries[0].sessionId).toBe("aaa-111");
  });

  it("returns empty for invalid JSON", () => {
    expect(parseGeminiLog("{broken")).toEqual([]);
  });

  it("returns empty for non-array JSON", () => {
    expect(parseGeminiLog('{"key": "value"}')).toEqual([]);
  });

  it("filters entries missing required fields", () => {
    const entries = parseGeminiLog(JSON.stringify([
      { sessionId: "ok", messageId: 0, type: "user", message: "hi", timestamp: "2025-01-01T00:00:00Z" },
      { messageId: 1, type: "user", message: "no sessionId" },
      { sessionId: "ok2", messageId: 2, type: "user", message: "no timestamp" },
    ]));
    expect(entries).toHaveLength(1);
  });
});

// --- groupBySession ---

describe("groupBySession", () => {
  it("groups entries by sessionId", () => {
    const entries = parseGeminiLog(toJson(MIXED_LOG));
    const groups = groupBySession(entries);
    expect(groups.size).toBe(2);
    expect(groups.get("aaa-111")).toHaveLength(3);
    expect(groups.get("bbb-222")).toHaveLength(1);
  });
});

// --- extractFileRefsFromText ---

describe("extractFileRefsFromText", () => {
  it("extracts @-prefixed file references", () => {
    const refs = extractFileRefsFromText("Read @src/router.ts and @lib/utils.ts");
    expect(refs).toContain("src/router.ts");
    expect(refs).toContain("lib/utils.ts");
  });

  it("extracts absolute paths", () => {
    const refs = extractFileRefsFromText("Error in /Users/ben/app/server.ts:42");
    expect(refs).toContain("/Users/ben/app/server.ts");
  });

  it("returns empty for no file refs", () => {
    expect(extractFileRefsFromText("just a normal message")).toEqual([]);
  });
});

// --- analyzeSession ---

describe("analyzeSession", () => {
  it("computes turns from user messages", () => {
    const entries = parseGeminiLog(toJson(SESSION_A));
    const result = analyzeSession(entries);
    expect(result.turns).toBe(3);
  });

  it("sets source to gemini", () => {
    const entries = parseGeminiLog(toJson(SESSION_A));
    const result = analyzeSession(entries);
    expect(result.source).toBe("gemini");
  });

  it("extracts files from message text", () => {
    const entries = parseGeminiLog(toJson(SESSION_A));
    const result = analyzeSession(entries);
    expect(result.files_touched).toContain("src/router.ts");
    expect(result.files_touched).toContain("src/config.ts");
  });

  it("computes active duration excluding idle gaps", () => {
    const entries = parseGeminiLog(toJson(SESSION_WITH_GAP));
    const result = analyzeSession(entries);
    // 10:00 → 10:30 = 30min gap (idle, excluded)
    // 10:30 → 10:31 = 1min (active)
    expect(result.duration_ms).toBe(60_000);
    expect(result.wall_clock_ms).toBe(31 * 60_000);
  });

  it("captures start and end times", () => {
    const entries = parseGeminiLog(toJson(SESSION_A));
    const result = analyzeSession(entries);
    expect(result.start_time).toBe("2025-06-26T08:00:00.000Z");
    expect(result.end_time).toBe("2025-06-26T08:03:00.000Z");
  });

  it("returns zero LOC stats (no structured tool calls)", () => {
    const entries = parseGeminiLog(toJson(SESSION_A));
    const result = analyzeSession(entries);
    expect(result.loc_stats).toEqual({ loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] });
  });

  it("converts to raw entries", () => {
    const entries = parseGeminiLog(toJson(SESSION_A));
    const result = analyzeSession(entries);
    expect(result.raw_entries).toHaveLength(3);
    expect(result.raw_entries[0].type).toBe("user");
    expect(result.raw_entries[0].sessionId).toBe("aaa-111");
  });

  it("handles empty input", () => {
    const result = analyzeSession([]);
    expect(result.turns).toBe(0);
    expect(result.duration_ms).toBe(0);
    expect(result.start_time).toBeNull();
  });
});

// --- geminiParser.detect ---

describe("geminiParser.detect", () => {
  it("detects a valid Gemini log file", async () => {
    const path = join(tmpDir, "valid-logs.json");
    await writeFile(path, toJson(SESSION_A));
    expect(await geminiParser.detect(path)).toBe(true);
  });

  it("rejects non-json files", async () => {
    const path = join(tmpDir, "readme.txt");
    await writeFile(path, "just text");
    expect(await geminiParser.detect(path)).toBe(false);
  });

  it("rejects empty array", async () => {
    const path = join(tmpDir, "empty.json");
    await writeFile(path, "[]");
    expect(await geminiParser.detect(path)).toBe(false);
  });

  it("rejects JSON without Gemini fields", async () => {
    const path = join(tmpDir, "other.json");
    await writeFile(path, JSON.stringify([{ type: "event", data: "stuff" }]));
    expect(await geminiParser.detect(path)).toBe(false);
  });

  it("rejects non-existent files", async () => {
    expect(await geminiParser.detect(join(tmpDir, "nope.json"))).toBe(false);
  });
});

// --- geminiParser.parse ---

describe("geminiParser.parse", () => {
  it("parses a file with multiple sessions (merged)", async () => {
    const path = join(tmpDir, "multi-session.json");
    await writeFile(path, toJson(MIXED_LOG));
    const result = await geminiParser.parse(path);
    expect(result.source).toBe("gemini");
    expect(result.turns).toBe(4); // 3 from A + 1 from B
    expect(result.files_touched).toContain("/app/server.ts");
    expect(result.files_touched).toContain("src/router.ts");
  });

  it("handles empty file", async () => {
    const path = join(tmpDir, "empty-log.json");
    await writeFile(path, "[]");
    const result = await geminiParser.parse(path);
    expect(result.turns).toBe(0);
    expect(result.start_time).toBeNull();
  });
});

// --- hashProjectDir ---

describe("hashProjectDir", () => {
  it("returns a 64-char hex string", () => {
    const hash = hashProjectDir("/Users/ben/Dev/myproject");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    const a = hashProjectDir("/Users/ben/Dev/myproject");
    const b = hashProjectDir("/Users/ben/Dev/myproject");
    expect(a).toBe(b);
  });

  it("differs for different paths", () => {
    const a = hashProjectDir("/Users/ben/project-a");
    const b = hashProjectDir("/Users/ben/project-b");
    expect(a).not.toBe(b);
  });
});

// --- resolveProjectDirs ---

describe("resolveProjectDirs", () => {
  it("resolves hashes to known directories", () => {
    const dir = "/Users/ben/Dev/myproject";
    const hash = hashProjectDir(dir);
    const sessions: GeminiSessionFile[] = [
      { path: "/fake/logs.json", sessionId: "s1", projectHash: hash },
      { path: "/fake/logs.json", sessionId: "s2", projectHash: "unknown-hash" },
    ];

    const resolved = resolveProjectDirs(sessions, [dir]);
    expect(resolved[0].projectDir).toBe(dir);
    expect(resolved[1].projectDir).toBeUndefined();
  });
});
