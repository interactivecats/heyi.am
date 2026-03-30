import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { claudeParser } from "./claude.js";
import { cursorParser, discoverCursorWorkspaces, listConversations, type CursorWorkspace } from "./cursor.js";
import { codexParser, discoverCodexSessions } from "./codex.js";
import { geminiParser, discoverGeminiSessions, resolveProjectDirs } from "./gemini.js";
import type { SessionParser, SessionAnalysis } from "./types.js";

export type { SessionAnalysis, SessionParser, SessionSource, ToolCall, LocStats, RawEntry } from "./types.js";

const parsers: SessionParser[] = [claudeParser, cursorParser, codexParser, geminiParser];

/** Detect which parser handles a given file and parse it */
export async function parseSession(path: string): Promise<SessionAnalysis> {
  for (const parser of parsers) {
    if (await parser.detect(path)) {
      return parser.parse(path);
    }
  }
  throw new Error(`No parser detected for: ${path}`);
}

export interface SessionMeta {
  path: string;
  source: string;
  sessionId: string;
  projectDir: string;
  isSubagent: boolean;
}

export function encodeDirPath(absolutePath: string): string {
  return absolutePath.replace(/[/.]/g, "-");
}

/**
 * Scan all supported tools for sessions.
 * Simplified version for howdoyouvibe — no subdirectory merging.
 */
export async function listSessions(): Promise<SessionMeta[]> {
  const allSessions: SessionMeta[] = [];

  // 1. Claude Code sessions
  const claudeSessions = await listClaudeSessions();
  allSessions.push(...claudeSessions);

  // 2. Cursor sessions
  const cursorSessions = await listCursorSessions();
  allSessions.push(...cursorSessions);

  // 3. Codex sessions
  try {
    const codexFiles = await discoverCodexSessions();
    for (const cf of codexFiles) {
      allSessions.push({
        path: cf.path,
        source: "codex",
        sessionId: cf.sessionId,
        projectDir: encodeDirPath(cf.cwd),
        isSubagent: false,
      });
    }
  } catch { /* codex discovery failed */ }

  // 4. Gemini sessions
  const knownDirs: string[] = [];
  try {
    for (const ws of await discoverCursorWorkspaces()) {
      knownDirs.push(ws.projectDir);
    }
  } catch {}
  try {
    for (const cf of await discoverCodexSessions()) {
      knownDirs.push(cf.cwd);
    }
  } catch {}
  for (const s of claudeSessions) {
    const decoded = s.projectDir.replace(/^-/, "/").replace(/-/g, "/");
    if (decoded.startsWith("/")) knownDirs.push(decoded);
  }

  try {
    let geminiFiles = await discoverGeminiSessions();
    geminiFiles = resolveProjectDirs(geminiFiles, knownDirs);
    for (const gf of geminiFiles) {
      const dir = gf.projectDir ?? gf.projectHash;
      allSessions.push({
        path: gf.path,
        source: "gemini",
        sessionId: gf.sessionId,
        projectDir: encodeDirPath(dir),
        isSubagent: false,
      });
    }
  } catch { /* gemini discovery failed */ }

  return allSessions;
}

/** Discover Cursor sessions and convert to SessionMeta[] */
async function listCursorSessions(): Promise<SessionMeta[]> {
  const sessions: SessionMeta[] = [];
  let workspaces: CursorWorkspace[];
  try {
    workspaces = await discoverCursorWorkspaces();
  } catch {
    return sessions;
  }

  const CURSOR_DATA_CUTOFF = new Date("2025-09-01").getTime();

  for (const ws of workspaces) {
    const conversations = await listConversations(ws);
    for (const conv of conversations) {
      if (!conv.name) continue;
      if (conv.createdAt < CURSOR_DATA_CUTOFF) continue;

      const params = new URLSearchParams();
      params.set("name", conv.name);
      if (conv.createdAt) params.set("createdAt", String(conv.createdAt));
      if (conv.lastUpdatedAt) params.set("lastUpdatedAt", String(conv.lastUpdatedAt));
      if (conv.totalLinesAdded) params.set("linesAdded", String(conv.totalLinesAdded));
      if (conv.totalLinesRemoved) params.set("linesRemoved", String(conv.totalLinesRemoved));
      const qs = params.toString();

      sessions.push({
        path: `cursor://${conv.composerId}${qs ? '?' + qs : ''}`,
        source: "cursor",
        sessionId: conv.composerId,
        projectDir: encodeDirPath(ws.projectDir),
        isSubagent: false,
      });
    }
  }

  return sessions;
}

/** Claude Code session scanning */
async function listClaudeSessions(): Promise<SessionMeta[]> {
  const base = join(homedir(), ".claude", "projects");
  const parents: SessionMeta[] = [];

  let projectDirs;
  try {
    projectDirs = await readdir(base, { withFileTypes: true });
  } catch {
    return parents;
  }

  for (const projectEntry of projectDirs) {
    if (!projectEntry.isDirectory()) continue;
    const projectPath = join(base, projectEntry.name);
    const projectDir = projectEntry.name;

    let files;
    try {
      files = await readdir(projectPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files) {
      if (file.name.endsWith(".jsonl") && !file.isDirectory()) {
        const fullPath = join(projectPath, file.name);
        const sessionId = file.name.replace(/\.jsonl$/, "");
        await tryAddSession(fullPath, sessionId, projectDir, false, parents);
      } else if (file.isDirectory()) {
        // Subagent sessions live in <session-id>/subagents/*.jsonl
        const subagentsDir = join(projectPath, file.name, "subagents");
        let subFiles;
        try {
          subFiles = await readdir(subagentsDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const sub of subFiles) {
          if (sub.name.endsWith(".jsonl") && !sub.isDirectory()) {
            const fullPath = join(subagentsDir, sub.name);
            const sessionId = sub.name.replace(/\.jsonl$/, "");
            await tryAddSession(fullPath, sessionId, projectDir, true, parents);
          }
        }
      }
    }
  }

  return parents;
}

async function tryAddSession(
  fullPath: string,
  sessionId: string,
  projectDir: string,
  isSubagent: boolean,
  out: SessionMeta[],
): Promise<void> {
  for (const parser of parsers) {
    if (await parser.detect(fullPath)) {
      out.push({ path: fullPath, source: parser.name, sessionId, projectDir, isSubagent });
      break;
    }
  }
}
