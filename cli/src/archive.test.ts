import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { writeFile, mkdir, rm, stat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { archiveSessionFiles } from "./archive.js";
import type { SessionMeta } from "./parsers/index.js";

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

  it("skips virtual paths (cursor:// URLs)", async () => {
    const sessions: SessionMeta[] = [
      makeSession({ path: "cursor://abc-123?name=test", sessionId: "abc-123", source: "cursor" }),
    ];

    const result = await archiveSessionFiles(sessions, tmpDir);
    expect(result.archived).toBe(0);
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
