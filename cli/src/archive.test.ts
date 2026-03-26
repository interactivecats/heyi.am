import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { writeFile, mkdir, rm, stat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock parseSession for Cursor export tests
vi.mock("./parsers/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./parsers/index.js")>();
  return {
    ...actual,
    parseSession: vi.fn(),
  };
});

import { archiveSessionFiles } from "./archive.js";
import { parseSession } from "./parsers/index.js";
import type { SessionMeta } from "./parsers/index.js";

const mockedParseSession = vi.mocked(parseSession);

let tmpDir: string;
let archiveDir: string; // = tmpDir/sessions/ (from getArchiveDir)
let sourceDir: string;

function makeJsonl(content: string = '{"type":"user","uuid":"1","timestamp":"2026-03-20T10:00:00Z","sessionId":"test","version":"2.1.80"}\n'): string {
  return content;
}

beforeAll(async () => {
  tmpDir = join(tmpdir(), `archive-test-${Date.now()}`);
  sourceDir = join(tmpDir, "source");
  archiveDir = join(tmpDir, "sessions"); // matches getArchiveDir(tmpDir)
  await mkdir(sourceDir, { recursive: true });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeSession(overrides: Partial<SessionMeta> & { path: string; sessionId: string }): SessionMeta {
  return {
    source: "claude",
    projectDir: "-Users-test-Dev-myproject",
    isSubagent: false,
    ...overrides,
  };
}

describe("archiveSessionFiles", () => {
  it("creates hard links for Claude session files", async () => {
    const sessionPath = join(sourceDir, "session1.jsonl");
    await writeFile(sessionPath, makeJsonl());

    const sessions: SessionMeta[] = [
      makeSession({ path: sessionPath, sessionId: "session1" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);

    expect(result.archived).toBe(1);
    expect(result.alreadyArchived).toBe(0);
    expect(result.failed).toBe(0);

    // Verify the archive file exists
    const archivePath = join(archiveDir, "-Users-test-Dev-myproject", "session1.jsonl");
    const archiveStat = await stat(archivePath);
    expect(archiveStat.isFile()).toBe(true);

    // Verify same inode (hard link, not copy)
    const sourceStat = await stat(sessionPath);
    expect(archiveStat.ino).toBe(sourceStat.ino);
  });

  it("skips already-archived sessions (idempotent)", async () => {
    const sessionPath = join(sourceDir, "session2.jsonl");
    await writeFile(sessionPath, makeJsonl());

    const sessions: SessionMeta[] = [
      makeSession({ path: sessionPath, sessionId: "session2" }),
    ];

    // First archive
    const result1 = await archiveSessionFiles(sessions, tmpDir);
    expect(result1.archived).toBe(1);

    // Second archive — should skip
    const result2 = await archiveSessionFiles(sessions, tmpDir);
    expect(result2.archived).toBe(0);
    expect(result2.alreadyArchived).toBe(1);
  });

  it("archives all session sources (not just Claude)", async () => {
    const cursorPath = join(sourceDir, "cursor-session.jsonl");
    await writeFile(cursorPath, makeJsonl());

    const sessions: SessionMeta[] = [
      makeSession({ path: cursorPath, sessionId: "cursor-session", source: "cursor" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);
    expect(result.archived).toBe(1);

    const archivePath = join(archiveDir, "-Users-test-Dev-myproject", "cursor-session.jsonl");
    const archiveStat = await stat(archivePath);
    expect(archiveStat.isFile()).toBe(true);
  });

  it("archives subagent files and meta.json", async () => {
    const parentDir = join(sourceDir, "parent-project");
    const subagentsDir = join(parentDir, "parent1", "subagents");
    await mkdir(subagentsDir, { recursive: true });

    const parentPath = join(parentDir, "parent1.jsonl");
    const childPath = join(subagentsDir, "child1.jsonl");
    const metaPath = join(subagentsDir, "child1.meta.json");

    await writeFile(parentPath, makeJsonl());
    await writeFile(childPath, makeJsonl());
    await writeFile(metaPath, JSON.stringify({ agentType: "Explore", description: "test" }));

    const sessions: SessionMeta[] = [
      makeSession({
        path: parentPath,
        sessionId: "parent1",
        projectDir: "parent-project",
        children: [
          makeSession({
            path: childPath,
            sessionId: "child1",
            projectDir: "parent-project",
            isSubagent: true,
            parentSessionId: "parent1",
          }),
        ],
      }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);

    // Parent + child + meta.json = 3 archived
    expect(result.archived).toBe(3);
  });

  it("exports Cursor sessions as JSONL with correct content", async () => {
    const rawEntries = [
      { type: "user", message: { role: "user", content: "hello" } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } },
    ];

    mockedParseSession.mockResolvedValue({
      source: "cursor",
      turns: 1,
      tool_calls: [],
      files_touched: [],
      duration_ms: 5000,
      wall_clock_ms: 5000,
      loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
      raw_entries: rawEntries,
      start_time: "2026-03-20T10:00:00Z",
      end_time: "2026-03-20T10:00:05Z",
    });

    const sessions: SessionMeta[] = [
      makeSession({ path: "cursor://export-test-123?name=test", sessionId: "export-test-123", source: "cursor" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);

    expect(result.cursorExported).toBe(1);
    expect(result.archived).toBe(1);
    expect(result.failed).toBe(0);

    // Verify the exported JSONL file content
    const exportedPath = join(archiveDir, "-Users-test-Dev-myproject", "cursor-export-test-123.jsonl");
    const content = await readFile(exportedPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(rawEntries[0]);
    expect(JSON.parse(lines[1])).toEqual(rawEntries[1]);
  });

  it("Cursor export is idempotent (skips already-exported)", async () => {
    // The file from previous test already exists
    const sessions: SessionMeta[] = [
      makeSession({ path: "cursor://export-test-123?name=test", sessionId: "export-test-123", source: "cursor" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);
    expect(result.alreadyArchived).toBe(1);
    expect(result.cursorExported).toBe(0);
    expect(result.archived).toBe(0);
  });

  it("counts cursorExported separately from file-based archives", async () => {
    const rawEntries = [
      { type: "user", message: { role: "user", content: "test" } },
    ];

    mockedParseSession.mockResolvedValue({
      source: "cursor",
      turns: 1,
      tool_calls: [],
      files_touched: [],
      duration_ms: 1000,
      wall_clock_ms: 1000,
      loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
      raw_entries: rawEntries,
      start_time: "2026-03-20T10:00:00Z",
      end_time: "2026-03-20T10:00:01Z",
    });

    const filePath = join(sourceDir, "codex-alongside.jsonl");
    await writeFile(filePath, makeJsonl());

    const sessions: SessionMeta[] = [
      makeSession({ path: "cursor://mixed-test-456?name=mix", sessionId: "mixed-test-456", source: "cursor" }),
      makeSession({ path: filePath, sessionId: "codex-alongside", source: "codex" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);
    expect(result.cursorExported).toBe(1);
    // codex-alongside is file-based, cursor is exported
    expect(result.archived).toBe(2); // both count as archived
  });

  it("archives Codex session files via hard link", async () => {
    const codexPath = join(sourceDir, "rollout-codex-001.jsonl");
    await writeFile(codexPath, makeJsonl());

    const sessions: SessionMeta[] = [
      makeSession({ path: codexPath, sessionId: "rollout-codex-001", source: "codex", projectDir: "-Users-test-Dev-codexapp" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);
    expect(result.archived).toBe(1);

    const archivePath = join(archiveDir, "-Users-test-Dev-codexapp", "rollout-codex-001.jsonl");
    const archiveStat = await stat(archivePath);
    expect(archiveStat.isFile()).toBe(true);

    // Verify hard link (same inode)
    const sourceStat = await stat(codexPath);
    expect(archiveStat.ino).toBe(sourceStat.ino);
  });

  it("archives Gemini .json session files", async () => {
    const geminiContent = JSON.stringify({ model: "gemini-2.5-pro", messages: [{ role: "user", text: "hello" }] });
    const geminiPath = join(sourceDir, "abc123-logs.json");
    await writeFile(geminiPath, geminiContent);

    const sessions: SessionMeta[] = [
      makeSession({ path: geminiPath, sessionId: "abc123-logs", source: "gemini", projectDir: "-Users-test-Dev-geminiapp" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);
    expect(result.archived).toBe(1);

    const archivePath = join(archiveDir, "-Users-test-Dev-geminiapp", "abc123-logs.json");
    const content = await readFile(archivePath, "utf-8");
    expect(content).toBe(geminiContent);
  });

  it("handles missing source files gracefully", async () => {
    const sessions: SessionMeta[] = [
      makeSession({ path: join(sourceDir, "does-not-exist.jsonl"), sessionId: "ghost" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);
    // Missing source is not a failure — it's just not there
    expect(result.archived).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("respects archiveSessions: false setting", async () => {
    // Create a config dir with archiveSessions: false
    const configDir = join(tmpDir, "disabled-config");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "settings.json"), JSON.stringify({ archiveSessions: false }));

    const sessionPath = join(sourceDir, "should-not-archive.jsonl");
    await writeFile(sessionPath, makeJsonl());

    const sessions: SessionMeta[] = [
      makeSession({ path: sessionPath, sessionId: "should-not-archive" }),
    ];

    const result = await archiveSessionFiles(sessions, configDir);
    expect(result.archived).toBe(0);
    expect(result.alreadyArchived).toBe(0);
  });
});
