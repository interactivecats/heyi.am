import { readdir, readFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { claudeParser, mapAgentRole } from "./claude.js";
import { cursorParser, discoverCursorWorkspaces, listConversations, type CursorWorkspace } from "./cursor.js";
import { codexParser, discoverCodexSessions } from "./codex.js";
import { geminiParser, discoverGeminiSessions } from "./gemini.js";
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
  /** The top-level project directory name (e.g., "-Users-ben-Dev-myapp") */
  projectDir: string;
  /** Whether this is a subagent session */
  isSubagent: boolean;
  parentSessionId?: string;
  agentRole?: string;
  children?: SessionMeta[];
}

/**
 * Convert an absolute directory path to Claude Code's encoded format.
 * "/Users/ben/Dev/heyi-am" → "-Users-ben-Dev-heyi-am"
 *
 * This encoding is lossy: `-` in directory names is indistinguishable from
 * the `-` used as a separator (e.g. `/a/b-c` and `/a/b/c` both encode to
 * `-a-b-c`). We accept this trade-off because Claude Code uses the same
 * encoding for its own project directories (~/.claude/projects/-Users-...),
 * and we must match it so sessions from different tools (Claude, Cursor,
 * Codex, Gemini) group under the same project key. In practice, users are
 * unlikely to have two project directories whose paths differ only by `-`
 * vs `/`.
 */
export function encodeDirPath(absolutePath: string): string {
  return absolutePath.replace(/\//g, "-");
}

/**
 * Scan all supported tools for sessions and merge by project directory.
 * Claude Code, Cursor, Codex, and Gemini sessions for the same directory
 * are grouped under the same projectDir key.
 */
export async function listSessions(basePath?: string): Promise<SessionMeta[]> {
  const allSessions: SessionMeta[] = [];

  // 1. Claude Code sessions
  const claudeSessions = await listClaudeSessions(basePath);
  allSessions.push(...claudeSessions);

  // When basePath is provided (tests, custom scan), only scan Claude sessions
  if (basePath) return allSessions;

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
  try {
    const geminiFiles = await discoverGeminiSessions();
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

  for (const ws of workspaces) {
    const conversations = listConversations(ws);
    for (const conv of conversations) {
      // Skip conversations without a name — Cursor only generates names for
      // conversations with real interaction. Unnamed ones are empty stubs.
      if (!conv.name) continue;

      // Encode metadata into the cursor:// URL so the parser can use it
      const params = new URLSearchParams();
      if (conv.name) params.set("name", conv.name);
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

/** Original Claude Code session scanning, extracted from old listSessions */
async function listClaudeSessions(basePath?: string): Promise<SessionMeta[]> {
  const base = basePath ?? join(homedir(), ".claude", "projects");
  const parents: SessionMeta[] = [];
  const childrenByParentId = new Map<string, SessionMeta[]>();

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
        const parentSessionId = file.name;
        const children = await collectSubagents(join(projectPath, file.name), projectDir, parentSessionId);
        if (children.length > 0) {
          const existing = childrenByParentId.get(parentSessionId) ?? [];
          existing.push(...children);
          childrenByParentId.set(parentSessionId, existing);
        }
      }
    }
  }

  // Link children to parents
  for (const parent of parents) {
    const children = childrenByParentId.get(parent.sessionId);
    if (children && children.length > 0) {
      parent.children = children;
    }
  }

  return parents;
}

async function collectSubagents(
  sessionDataDir: string,
  projectDir: string,
  parentSessionId: string,
): Promise<SessionMeta[]> {
  const subagentsDir = join(sessionDataDir, "subagents");
  const children: SessionMeta[] = [];
  let files;
  try {
    files = await readdir(subagentsDir, { withFileTypes: true });
  } catch {
    return children; // No subagents directory
  }

  for (const file of files) {
    if (!file.name.endsWith(".jsonl") || file.isDirectory()) continue;
    const fullPath = join(subagentsDir, file.name);
    const sessionId = file.name.replace(/\.jsonl$/, "");

    // Try to read .meta.json for agent type/role
    const metaPath = join(subagentsDir, file.name.replace(/\.jsonl$/, ".meta.json"));
    let agentRole: string | undefined;
    try {
      const metaRaw = await readFile(metaPath, "utf-8");
      const meta = JSON.parse(metaRaw) as { agentType?: string };
      if (meta.agentType) {
        agentRole = mapAgentRole(meta.agentType);
      }
    } catch {
      // No meta.json or malformed — role will be undefined
    }

    await tryAddSession(fullPath, sessionId, projectDir, true, children, parentSessionId, agentRole);
  }
  return children;
}

async function tryAddSession(
  fullPath: string,
  sessionId: string,
  projectDir: string,
  isSubagent: boolean,
  out: SessionMeta[],
  parentSessionId?: string,
  agentRole?: string,
): Promise<void> {
  for (const parser of parsers) {
    if (await parser.detect(fullPath)) {
      const meta: SessionMeta = { path: fullPath, source: parser.name, sessionId, projectDir, isSubagent };
      if (parentSessionId) {
        meta.parentSessionId = parentSessionId;
      }
      if (agentRole) {
        meta.agentRole = agentRole;
      }
      out.push(meta);
      break;
    }
  }
}
