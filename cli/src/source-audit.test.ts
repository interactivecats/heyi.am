import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock listSessions and parseSession before importing the module under test
vi.mock("./parsers/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./parsers/index.js")>();
  return {
    ...actual,
    listSessions: vi.fn().mockResolvedValue([]),
    parseSession: vi.fn().mockResolvedValue({ source: "claude" }),
  };
});

import { getSourceAudit, getArchiveStats } from "./source-audit.js";
import { listSessions, parseSession } from "./parsers/index.js";
import type { SessionMeta } from "./parsers/index.js";

const mockedListSessions = vi.mocked(listSessions);
const mockedParseSession = vi.mocked(parseSession);

let tmpDir: string;
let archiveDir: string;

const JSONL_LINE =
  '{"type":"user","uuid":"1","timestamp":"2026-03-20T10:00:00Z","sessionId":"test","version":"2.1.80"}\n';

function makeMeta(overrides: Partial<SessionMeta>): SessionMeta {
  return {
    path: "/fake/path.jsonl",
    source: "claude",
    sessionId: "sess-1",
    projectDir: "-Users-test-Dev-myproject",
    isSubagent: false,
    ...overrides,
  };
}

beforeAll(async () => {
  tmpDir = join(tmpdir(), `source-audit-test-${Date.now()}`);
  archiveDir = join(tmpDir, "sessions");
  await mkdir(archiveDir, { recursive: true });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("getSourceAudit", () => {
  it("returns empty sources when no sessions exist", async () => {
    mockedListSessions.mockResolvedValue([]);
    const result = await getSourceAudit(tmpDir);
    expect(result.sources).toEqual([]);
  });

  it("groups live sessions by source and counts them", async () => {
    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "c1" }),
      makeMeta({ source: "claude", sessionId: "c2" }),
      makeMeta({ source: "cursor", sessionId: "cu1" }),
    ]);

    const result = await getSourceAudit(tmpDir);

    const claude = result.sources.find((s) => s.name === "Claude Code");
    const cursor = result.sources.find((s) => s.name === "Cursor");
    expect(claude).toBeDefined();
    expect(claude!.liveCount).toBe(2);
    expect(cursor).toBeDefined();
    expect(cursor!.liveCount).toBe(1);
  });

  it("excludes subagent sessions from live counts", async () => {
    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "parent" }),
      makeMeta({ source: "claude", sessionId: "child", isSubagent: true }),
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude!.liveCount).toBe(1);
  });

  it("flags Claude Code with 30-day retention risk", async () => {
    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "c1" }),
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude!.retentionRisk).toBe("30-day");
  });

  it("does not flag Cursor with retention risk", async () => {
    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "cursor", sessionId: "cu1" }),
    ]);

    const result = await getSourceAudit(tmpDir);
    const cursor = result.sources.find((s) => s.name === "Cursor");
    expect(cursor!.retentionRisk).toBeUndefined();
  });

  it("counts archived sessions from the archive directory", async () => {
    // Create an archived session file
    const projectPath = join(archiveDir, "-Users-test-Dev-myproject");
    await mkdir(projectPath, { recursive: true });
    await writeFile(join(projectPath, "archived-1.jsonl"), JSONL_LINE);
    await writeFile(join(projectPath, "archived-2.jsonl"), JSONL_LINE);

    mockedParseSession.mockResolvedValue({
      source: "claude",
      turns: 1,
      tool_calls: [],
      files_touched: [],
      duration_ms: 1000,
      wall_clock_ms: 1000,
      loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
      raw_entries: [],
      start_time: "2026-03-20T10:00:00Z",
      end_time: "2026-03-20T10:01:00Z",
    });

    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "live-1" }),
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude).toBeDefined();
    expect(claude!.archivedCount).toBe(2);
  });

  it("assesses health as warning when Claude has no archive", async () => {
    // Use a fresh tmpDir with no archive files
    const freshTmp = join(tmpdir(), `source-audit-fresh-${Date.now()}`);
    const freshArchive = join(freshTmp, "sessions");
    await mkdir(freshArchive, { recursive: true });

    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "c1" }),
      makeMeta({ source: "claude", sessionId: "c2" }),
      makeMeta({ source: "claude", sessionId: "c3" }),
    ]);

    const result = await getSourceAudit(freshTmp);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude!.health).toBe("warning");

    await rm(freshTmp, { recursive: true, force: true });
  });

  it("assesses health as healthy when archive covers well", async () => {
    // Archive dir already has 2 files from previous test
    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "c1" }),
    ]);

    mockedParseSession.mockResolvedValue({
      source: "claude",
      turns: 1,
      tool_calls: [],
      files_touched: [],
      duration_ms: 1000,
      wall_clock_ms: 1000,
      loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
      raw_entries: [],
      start_time: "2026-03-20T10:00:00Z",
      end_time: "2026-03-20T10:01:00Z",
    });

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude!.health).toBe("healthy");
  });

  it("sorts sources by archived count descending", async () => {
    // Create cursor archive
    const cursorProject = join(archiveDir, "-Users-test-cursor-project");
    await mkdir(cursorProject, { recursive: true });
    for (let i = 0; i < 5; i++) {
      await writeFile(join(cursorProject, `cursor-${i}.jsonl`), JSONL_LINE);
    }

    mockedParseSession.mockImplementation(async (path: string) => {
      const isCursor = path.includes("cursor-project");
      return {
        source: isCursor ? "cursor" : "claude",
        turns: 1,
        tool_calls: [],
        files_touched: [],
        duration_ms: 1000,
        wall_clock_ms: 1000,
        loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
        raw_entries: [],
        start_time: "2026-03-20T10:00:00Z",
        end_time: "2026-03-20T10:01:00Z",
      };
    });

    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "c1" }),
      makeMeta({ source: "cursor", sessionId: "cu1" }),
    ]);

    const result = await getSourceAudit(tmpDir);
    // Cursor has 5 archived, Claude has 2 — cursor should come first
    expect(result.sources[0].name).toBe("Cursor");
    expect(result.sources[1].name).toBe("Claude Code");
  });
});

describe("getArchiveStats", () => {
  it("returns zero stats for empty archive", async () => {
    const emptyTmp = join(tmpdir(), `archive-stats-empty-${Date.now()}`);
    const emptyArchive = join(emptyTmp, "sessions");
    await mkdir(emptyArchive, { recursive: true });

    mockedListSessions.mockResolvedValue([]);

    const stats = await getArchiveStats(emptyTmp);
    expect(stats.total).toBe(0);
    expect(stats.oldest).toBe("none");
    expect(stats.sourcesCount).toBe(0);
    expect(stats.lastSync).toBe("never");

    await rm(emptyTmp, { recursive: true, force: true });
  });

  it("counts total archived files across project dirs", async () => {
    // tmpDir/sessions/ already has files from getSourceAudit tests
    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "c1" }),
    ]);

    const stats = await getArchiveStats(tmpDir);
    expect(stats.total).toBeGreaterThanOrEqual(2);
  });

  it("reports source count from live session discovery", async () => {
    mockedListSessions.mockResolvedValue([
      makeMeta({ source: "claude", sessionId: "c1" }),
      makeMeta({ source: "cursor", sessionId: "cu1" }),
      makeMeta({ source: "codex", sessionId: "co1" }),
    ]);

    const stats = await getArchiveStats(tmpDir);
    expect(stats.sourcesCount).toBe(3);
  });

  it("formats oldest date as month + year", async () => {
    mockedListSessions.mockResolvedValue([]);
    const stats = await getArchiveStats(tmpDir);
    // Archive has files, so oldest should be a formatted date
    if (stats.total > 0) {
      expect(stats.oldest).toMatch(/\w{3} \d{4}/);
    }
  });

  it("returns 'never' for lastSync when archive dir missing", async () => {
    const noArchive = join(tmpdir(), `no-archive-${Date.now()}`);
    // Don't create the sessions dir
    await mkdir(noArchive, { recursive: true });

    mockedListSessions.mockResolvedValue([]);

    const stats = await getArchiveStats(noArchive);
    expect(stats.lastSync).toBe("never");

    await rm(noArchive, { recursive: true, force: true });
  });
});
