import { describe, it, expect, vi } from "vitest";
import { encodeDirPath, decodeDirPath, mergeSubdirectoryProjects, type SessionMeta } from "./index.js";
import type { SessionAnalysis } from "./types.js";

function makeMeta(overrides: Partial<SessionMeta> & { projectDir: string }): SessionMeta {
  return {
    path: `/fake/${overrides.projectDir}.jsonl`,
    source: "claude",
    sessionId: crypto.randomUUID(),
    isSubagent: false,
    ...overrides,
  };
}

function makeParsed(overrides: Partial<SessionAnalysis> = {}): SessionAnalysis {
  return {
    source: "claude",
    turns: 5,
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

// ── encodeDirPath ─────────────────────────────────────────────────

describe("encodeDirPath", () => {
  it("replaces slashes with dashes", () => {
    expect(encodeDirPath("/Users/ben/Dev/myapp")).toBe("-Users-ben-Dev-myapp");
  });

  it("replaces dots with dashes (matches Claude Code encoding)", () => {
    expect(encodeDirPath("/Users/ben/Dev/heyi.am")).toBe("-Users-ben-Dev-heyi-am");
  });

  it("preserves underscores", () => {
    expect(encodeDirPath("/Users/ben/Dev/heyi_am")).toBe("-Users-ben-Dev-heyi_am");
  });

  it("handles multiple dots and slashes", () => {
    expect(encodeDirPath("/Users/ben/my.app/src/v2.0")).toBe("-Users-ben-my-app-src-v2-0");
  });

  it("handles Windows backslash paths", () => {
    expect(encodeDirPath("C:\\Users\\ben\\Dev\\myapp")).toBe("C-Users-ben-Dev-myapp");
  });

  it("handles Windows paths with dots", () => {
    expect(encodeDirPath("C:\\Users\\ben\\Dev\\heyi.am")).toBe("C-Users-ben-Dev-heyi-am");
  });

  it("handles Windows drive colon", () => {
    expect(encodeDirPath("D:\\Projects\\app")).toBe("D-Projects-app");
  });
});

// ── decodeDirPath ─────────────────────────────────────────────────

describe("decodeDirPath", () => {
  it("decodes Unix-style encoded paths", () => {
    expect(decodeDirPath("-Users-ben-Dev-myapp")).toBe("/Users/ben/Dev/myapp");
  });

  it("decodes Windows-style encoded paths", () => {
    expect(decodeDirPath("C-Users-ben-Dev-myapp")).toBe("C:/Users/ben/Dev/myapp");
  });

  it("returns null for unrecognizable format", () => {
    expect(decodeDirPath("")).toBe(null);
  });
});

// ── mergeSubdirectoryProjects ─────────────────────────────────────

describe("mergeSubdirectoryProjects", () => {
  const noRealPaths = new Map<string, string>();

  it("does not merge unrelated projects", async () => {
    const parseFn = vi.fn();
    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-appA" }),
      makeMeta({ projectDir: "-Users-ben-Dev-appB" }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(result.map(s => s.projectDir)).toEqual([
      "-Users-ben-Dev-appA",
      "-Users-ben-Dev-appB",
    ]);
    expect(parseFn).not.toHaveBeenCalled();
  });

  it("merges child into parent when files prove same codebase", async () => {
    const parseFn = vi.fn().mockResolvedValue(
      makeParsed({
        files_touched: ["/Users/ben/Dev/heyi.am/lib/app.ex", "/Users/ben/Dev/heyi.am/cli/src/main.ts"],
      }),
    );

    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-heyi-am" }),
      makeMeta({ projectDir: "-Users-ben-Dev-heyi-am-cli" }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(result.every(s => s.projectDir === "-Users-ben-Dev-heyi-am")).toBe(true);
  });

  it("does NOT merge when child files stay within subdirectory", async () => {
    const parseFn = vi.fn().mockResolvedValue(
      makeParsed({
        files_touched: [
          "/Users/ben/Dev/mono-standalone-app/src/index.ts",
          "/Users/ben/Dev/mono-standalone-app/package.json",
        ],
      }),
    );

    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-mono" }),
      makeMeta({ projectDir: "-Users-ben-Dev-mono-standalone-app" }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(result[0].projectDir).toBe("-Users-ben-Dev-mono");
    expect(result[1].projectDir).toBe("-Users-ben-Dev-mono-standalone-app");
  });

  it("does NOT merge /Dev into /Dev/project (parent too broad)", async () => {
    const parseFn = vi.fn().mockResolvedValue(
      makeParsed({
        files_touched: ["/Users/ben/Dev/heyi.am/src/main.ts"],
      }),
    );

    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev" }),
      makeMeta({ projectDir: "-Users-ben-Dev-heyi-am" }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    // heyi-am files encode to -Users-ben-Dev-heyi-am, not -Users-ben-Dev
    expect(result[1].projectDir).toBe("-Users-ben-Dev-heyi-am");
  });

  it("uses tool_calls as fallback when files_touched is empty", async () => {
    const parseFn = vi.fn().mockResolvedValue(
      makeParsed({
        files_touched: [],
        tool_calls: [
          { id: "1", name: "Read", input: { file_path: "/Users/ben/Dev/myapp/README.md" } },
          { id: "2", name: "Edit", input: { file_path: "/Users/ben/Dev/myapp/frontend/src/App.tsx" } },
        ],
      }),
    );

    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-myapp" }),
      makeMeta({ projectDir: "-Users-ben-Dev-myapp-frontend" }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(result.every(s => s.projectDir === "-Users-ben-Dev-myapp")).toBe(true);
  });

  it("skips subagent sessions when sampling", async () => {
    const parseFn = vi.fn();
    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-parent" }),
      makeMeta({ projectDir: "-Users-ben-Dev-parent-sub", isSubagent: true }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(result[1].projectDir).toBe("-Users-ben-Dev-parent-sub");
    expect(parseFn).not.toHaveBeenCalled();
  });

  it("handles parse failures gracefully", async () => {
    const parseFn = vi.fn().mockRejectedValue(new Error("parse failed"));
    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-proj" }),
      makeMeta({ projectDir: "-Users-ben-Dev-proj-sub" }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(result[1].projectDir).toBe("-Users-ben-Dev-proj-sub");
  });

  it("chains merges: grandchild merges through child to grandparent", async () => {
    const parseFn = vi.fn().mockResolvedValue(
      makeParsed({
        files_touched: ["/Users/ben/Dev/mono/tsconfig.json"],
      }),
    );

    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-mono" }),
      makeMeta({ projectDir: "-Users-ben-Dev-mono-packages" }),
      makeMeta({ projectDir: "-Users-ben-Dev-mono-packages-ui" }),
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(result.every(s => s.projectDir === "-Users-ben-Dev-mono")).toBe(true);
  });

  it("only parses up to 2 non-subagent sessions per candidate", async () => {
    const parseFn = vi.fn().mockResolvedValue(
      makeParsed({ files_touched: ["/elsewhere/file.ts"] }),
    );

    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-parent" }),
      makeMeta({ projectDir: "-Users-ben-Dev-parent-child" }),
      makeMeta({ projectDir: "-Users-ben-Dev-parent-child" }),
      makeMeta({ projectDir: "-Users-ben-Dev-parent-child" }),
    ];

    await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    expect(parseFn).toHaveBeenCalledTimes(2);
  });

  it("preserves original session data when merging", async () => {
    const parseFn = vi.fn().mockResolvedValue(
      makeParsed({
        files_touched: ["/Users/ben/Dev/app/lib/core.ex"],
      }),
    );

    const child = makeMeta({
      projectDir: "-Users-ben-Dev-app-frontend",
      source: "cursor",
      sessionId: "child-123",
    });
    const sessions = [
      makeMeta({ projectDir: "-Users-ben-Dev-app" }),
      child,
    ];

    const result = await mergeSubdirectoryProjects(sessions, noRealPaths, parseFn);
    const merged = result.find(s => s.sessionId === "child-123")!;
    expect(merged.projectDir).toBe("-Users-ben-Dev-app");
    expect(merged.source).toBe("cursor");
    expect(merged.sessionId).toBe("child-123");
  });
});
