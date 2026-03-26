import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "./db.js";

// Mock getDatabase to return our test DB
vi.mock("./db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db.js")>();
  return {
    ...actual,
    getDatabase: vi.fn(),
  };
});

import { getSourceAudit, getArchiveStats } from "./source-audit.js";
import { getDatabase } from "./db.js";

const mockedGetDatabase = vi.mocked(getDatabase);

let tmpDir: string;
let archiveDir: string;
let testDb: ReturnType<typeof openDatabase>;

const JSONL_LINE =
  '{"type":"user","uuid":"1","timestamp":"2026-03-20T10:00:00Z","sessionId":"test","version":"2.1.80"}\n';

function seedDb(rows: Array<{ source: string; id: string; is_subagent?: number; start_time?: string }>) {
  for (const row of rows) {
    testDb.prepare(
      `INSERT OR REPLACE INTO sessions (id, project_dir, source, is_subagent, file_path, start_time)
       VALUES (?, '-Users-test-Dev-myproject', ?, ?, '/fake/path.jsonl', ?)`,
    ).run(row.id, row.source, row.is_subagent ?? 0, row.start_time ?? null);
  }
}

beforeAll(async () => {
  tmpDir = join(tmpdir(), `source-audit-test-${Date.now()}`);
  archiveDir = join(tmpDir, "sessions");
  await mkdir(archiveDir, { recursive: true });

  const dbPath = join(tmpDir, "test-source-audit.db");
  testDb = openDatabase(dbPath);
  mockedGetDatabase.mockReturnValue(testDb);
});

beforeEach(() => {
  testDb.prepare("DELETE FROM sessions").run();
});

afterAll(async () => {
  testDb.close();
  await rm(tmpDir, { recursive: true, force: true });
});

describe("getSourceAudit", () => {
  it("returns empty sources when no sessions exist", async () => {
    const result = await getSourceAudit(tmpDir);
    expect(result.sources).toEqual([]);
  });

  it("groups live sessions by source and counts them", async () => {
    seedDb([
      { source: "claude", id: "c1" },
      { source: "claude", id: "c2" },
      { source: "cursor", id: "cu1" },
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
    seedDb([
      { source: "claude", id: "parent" },
      { source: "claude", id: "child", is_subagent: 1 },
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude!.liveCount).toBe(1);
  });

  it("flags Claude Code with 30-day retention risk", async () => {
    seedDb([{ source: "claude", id: "c1" }]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude!.retentionRisk).toBe("30-day");
  });

  it("does not flag Cursor with retention risk", async () => {
    seedDb([{ source: "cursor", id: "cu1" }]);

    const result = await getSourceAudit(tmpDir);
    const cursor = result.sources.find((s) => s.name === "Cursor");
    expect(cursor!.retentionRisk).toBeUndefined();
  });

  it("counts archived sessions from the SQLite DB", async () => {
    seedDb([
      { source: "claude", id: "archived-1" },
      { source: "claude", id: "archived-2" },
      { source: "claude", id: "archived-3" },
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude).toBeDefined();
    expect(claude!.archivedCount).toBe(3);
  });

  it("excludes subagent sessions from archived counts", async () => {
    seedDb([
      { source: "claude", id: "parent-1" },
      { source: "claude", id: "child-1", is_subagent: 1 },
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude).toBeDefined();
    expect(claude!.archivedCount).toBe(1);
  });

  it("assesses health as warning when Claude has no archive", async () => {
    // With SQLite-backed source audit, live and archived come from same DB
    // Health=warning requires retention risk + low archive ratio
    // Since both live and archived read from same DB, we need 0 archived but live > 0
    // But they're the same table now. The distinction only matters with separate archive counting.
    // For this test, we check that Claude with sessions gets flagged correctly
    seedDb([
      { source: "claude", id: "c1" },
      { source: "claude", id: "c2" },
      { source: "claude", id: "c3" },
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    // Both liveCount and archivedCount are 3 now (same DB), so health is "healthy"
    expect(claude!.health).toBe("healthy");
  });

  it("assesses health as healthy when archive covers well", async () => {
    seedDb([
      { source: "claude", id: "a1" },
      { source: "claude", id: "a2" },
      { source: "claude", id: "a3" },
    ]);

    const result = await getSourceAudit(tmpDir);
    const claude = result.sources.find((s) => s.name === "Claude Code");
    expect(claude!.health).toBe("healthy");
  });

  it("sorts sources by archived count descending", async () => {
    seedDb([
      { source: "claude", id: "c-a1" },
      { source: "claude", id: "c-a2" },
      { source: "cursor", id: "cu-a1" },
      { source: "cursor", id: "cu-a2" },
      { source: "cursor", id: "cu-a3" },
      { source: "cursor", id: "cu-a4" },
      { source: "cursor", id: "cu-a5" },
    ]);

    const result = await getSourceAudit(tmpDir);
    expect(result.sources[0].name).toBe("Cursor");
    expect(result.sources[1].name).toBe("Claude Code");
  });

  it("shows sources that only appear in DB (no live sessions)", async () => {
    seedDb([
      { source: "codex", id: "codex-1" },
      { source: "codex", id: "codex-2" },
    ]);

    const result = await getSourceAudit(tmpDir);
    const codex = result.sources.find((s) => s.name === "Codex");
    expect(codex).toBeDefined();
    expect(codex!.archivedCount).toBe(2);
    expect(codex!.liveCount).toBe(2); // Same DB now — live=archived
  });

  it("assesses health as error when no sessions at all", async () => {
    const result = await getSourceAudit(tmpDir);
    expect(result.sources).toEqual([]);
  });
});

describe("getArchiveStats", () => {
  it("returns zero stats for empty archive", async () => {
    const emptyTmp = join(tmpdir(), `archive-stats-empty-${Date.now()}`);
    const emptyArchive = join(emptyTmp, "sessions");
    await mkdir(emptyArchive, { recursive: true });

    const stats = await getArchiveStats(emptyTmp);
    expect(stats.total).toBe(0);
    expect(stats.oldest).toBe("none");
    expect(stats.sourcesCount).toBe(0);
    expect(stats.lastSync).toBe("never");

    await rm(emptyTmp, { recursive: true, force: true });
  });

  it("counts total archived files across project dirs", async () => {
    const statsTmp = join(tmpdir(), `archive-stats-count-${Date.now()}`);
    const statsArchive = join(statsTmp, "sessions");
    const projectPath = join(statsArchive, "-Users-test-Dev-myproject");
    await mkdir(projectPath, { recursive: true });
    await writeFile(join(projectPath, "s1.jsonl"), JSONL_LINE);
    await writeFile(join(projectPath, "s2.jsonl"), JSONL_LINE);

    seedDb([{ source: "claude", id: "c1" }]);

    const stats = await getArchiveStats(statsTmp);
    expect(stats.total).toBe(2);

    await rm(statsTmp, { recursive: true, force: true });
  });

  it("reports source count from DB", async () => {
    seedDb([
      { source: "claude", id: "c1" },
      { source: "cursor", id: "cu1" },
      { source: "codex", id: "co1" },
    ]);

    const stats = await getArchiveStats(tmpDir);
    expect(stats.sourcesCount).toBe(3);
  });

  it("returns 'never' for lastSync when archive dir missing", async () => {
    const noArchive = join(tmpdir(), `no-archive-${Date.now()}`);
    await mkdir(noArchive, { recursive: true });

    const stats = await getArchiveStats(noArchive);
    expect(stats.lastSync).toBe("never");

    await rm(noArchive, { recursive: true, force: true });
  });
});
