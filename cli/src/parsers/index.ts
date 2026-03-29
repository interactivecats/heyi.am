import { readdir, readFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { claudeParser, mapAgentRole } from "./claude.js";
import { cursorParser, discoverCursorWorkspaces, listConversations, type CursorWorkspace } from "./cursor.js";
import { codexParser, discoverCodexSessions } from "./codex.js";
import { geminiParser, discoverGeminiSessions, resolveProjectDirs } from "./gemini.js";
import type { SessionParser, SessionAnalysis } from "./types.js";
import { getArchiveDir } from "../settings.js";

export type { SessionAnalysis, SessionParser, SessionSource, ToolCall, LocStats, RawEntry, TokenUsage } from "./types.js";

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
  return absolutePath.replace(/[/.]/g, "-");
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
  let codexFiles: Awaited<ReturnType<typeof discoverCodexSessions>> = [];
  try {
    codexFiles = await discoverCodexSessions();
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

  // Build map of encoded projectDir → real absolute path for git checks.
  // Cursor workspaces and Codex/Gemini sessions have real paths;
  // Claude dirs can't be reliably decoded (lossy encoding).
  const realPaths = new Map<string, string>();
  try {
    for (const ws of await discoverCursorWorkspaces()) {
      realPaths.set(encodeDirPath(ws.projectDir), ws.projectDir);
    }
  } catch {}
  for (const cf of codexFiles) {
    realPaths.set(encodeDirPath(cf.cwd), cf.cwd);
  }

  // Collect known real project dirs for Gemini hash resolution
  const knownDirs = [...realPaths.values()];
  // Also derive dirs from Claude session projectDir names (decode is lossy
  // but still useful for hash matching — the hash is computed from the
  // exact original path, so only exact matches succeed)
  for (const s of claudeSessions) {
    // Claude projectDir is encoded like "-Users-ben-Dev-myapp";
    // attempt to reverse to "/Users/ben/Dev/myapp"
    const decoded = s.projectDir.replace(/^-/, "/").replace(/-/g, "/");
    if (decoded.startsWith("/")) knownDirs.push(decoded);
  }

  // 4. Gemini sessions — resolve SHA-256 hashes to real project paths
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

  return mergeSubdirectoryProjects(allSessions, realPaths);
}

/** Get the git remote URL for a directory, or null if not a git repo. */
function getGitRemote(dirPath: string): Promise<string | null> {
  return new Promise(resolve => {
    execFile("git", ["-C", dirPath, "remote", "get-url", "origin"], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null);
      const url = stdout.trim();
      resolve(url || null);
    });
  });
}

/**
 * Merge sessions from subdirectory projects into their parent when file
 * evidence confirms they're part of the same codebase.
 *
 * Example: sessions from /Dev/heyi.am/cli (encoded: -Dev-heyi-am-cli)
 * that touch files like /Dev/heyi.am/lib/foo.ex prove they belong to the
 * parent project /Dev/heyi.am (encoded: -Dev-heyi-am).
 *
 * We sample 1-2 sessions from the candidate child, parse them, and check
 * whether files_touched reference paths outside the subdirectory. This
 * avoids false merges (e.g., /Dev should NOT absorb /Dev/heyi.am).
 */
export async function mergeSubdirectoryProjects(
  sessions: SessionMeta[],
  realPaths: Map<string, string>,
  parseFn: (path: string) => Promise<SessionAnalysis> = parseSession,
): Promise<SessionMeta[]> {
  // Group by projectDir
  const byDir = new Map<string, SessionMeta[]>();
  for (const s of sessions) {
    const list = byDir.get(s.projectDir) ?? [];
    list.push(s);
    byDir.set(s.projectDir, list);
  }

  const dirs = [...byDir.keys()].sort((a, b) => a.length - b.length);
  const mergeMap = new Map<string, string>(); // child → parent

  for (let i = 0; i < dirs.length; i++) {
    const candidate = dirs[i];
    if (mergeMap.has(candidate)) continue; // already merged

    // Find potential parents (shorter dirs that are a prefix)
    const parents: string[] = [];
    for (let j = 0; j < i; j++) {
      const potential = mergeMap.get(dirs[j]) ?? dirs[j]; // follow chain
      if (candidate.startsWith(potential + "-") && candidate !== potential) {
        parents.push(potential);
      }
    }
    if (parents.length === 0) continue;

    // Pick the longest parent (closest ancestor)
    const parent = parents.sort((a, b) => b.length - a.length)[0];

    // Signal 1: git remote match — if both dirs resolve to the same repo
    const parentReal = realPaths.get(parent);
    const childReal = realPaths.get(candidate);
    if (parentReal && childReal) {
      const [parentRemote, childRemote] = await Promise.all([
        getGitRemote(parentReal),
        getGitRemote(childReal),
      ]);
      if (parentRemote && childRemote && parentRemote === childRemote) {
        mergeMap.set(candidate, parent);
        continue;
      }
    }

    // Signal 2: file-change sampling — parse 1-2 sessions and check
    // if files_touched reference paths at the parent level
    const childSessions = byDir.get(candidate) ?? [];
    const samples = childSessions
      .filter(s => !s.isSubagent)
      .slice(0, 2);

    if (samples.length === 0) continue;

    let shouldMerge = false;
    for (const sample of samples) {
      try {
        const parsed = await parseFn(sample.path);

        // If we got a cwd from parsing, try git remote as a fallback
        if (!shouldMerge && parsed.cwd && parentReal) {
          const [pRemote, cRemote] = await Promise.all([
            getGitRemote(parentReal),
            getGitRemote(parsed.cwd),
          ]);
          if (pRemote && cRemote && pRemote === cRemote) {
            shouldMerge = true;
            break;
          }
        }

        const filePaths = parsed.files_touched.length > 0
          ? parsed.files_touched
          : parsed.tool_calls
              .map(tc => tc.input.file_path)
              .filter((p): p is string => typeof p === "string");

        // Check if any file lives at the parent project level but outside
        // the child's own subtree. Walk up each file's ancestors; if we hit
        // the child's own projectDir first, this file is just inside its own
        // project — skip it. Only count it as evidence if we reach the
        // parent before (or without) hitting the child.
        for (const fp of filePaths) {
          const parts = fp.split("/").filter(Boolean);
          let hitChild = false;
          for (let k = parts.length - 1; k >= 2; k--) {
            const ancestor = "/" + parts.slice(0, k).join("/");
            const encoded = encodeDirPath(ancestor);
            if (encoded === candidate) {
              hitChild = true;
              break; // file is inside child's own tree — not evidence
            }
            if (encoded === parent) {
              shouldMerge = true;
              break;
            }
          }
          if (shouldMerge) break;
        }
        if (shouldMerge) break;
      } catch {
        // Parsing failed — skip this sample
      }
    }

    if (shouldMerge) {
      mergeMap.set(candidate, parent);
    }
  }

  // Apply merges
  if (mergeMap.size === 0) return sessions;

  return sessions.map(s => {
    const newDir = mergeMap.get(s.projectDir);
    if (newDir) {
      return { ...s, projectDir: newDir };
    }
    return s;
  });
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

  // Cursor migrated conversation storage to the global cursorDiskKV table
  // around August 2025 (composer.planMigrationToHomeDirCompleted). Sessions
  // before this have metadata (title, date) but no recoverable content.
  const CURSOR_DATA_CUTOFF = new Date("2025-09-01").getTime();

  for (const ws of workspaces) {
    const conversations = listConversations(ws);
    for (const conv of conversations) {
      // Skip conversations without a name — Cursor only generates names for
      // conversations with real interaction. Unnamed ones are empty stubs.
      if (!conv.name) continue;

      // Skip sessions before September 2025 — bubble data not available
      if (conv.createdAt < CURSOR_DATA_CUTOFF) continue;

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

/** Scan a single base directory for Claude-format sessions. */
async function scanClaudeDir(
  base: string,
  parents: SessionMeta[],
  childrenByParentId: Map<string, SessionMeta[]>,
  seenSessionIds: Set<string>,
): Promise<void> {
  let projectDirs;
  try {
    projectDirs = await readdir(base, { withFileTypes: true });
  } catch {
    return;
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
        const sessionId = file.name.replace(/\.jsonl$/, "");
        // Deduplicate: live sessions (scanned first) take precedence over archive
        if (seenSessionIds.has(sessionId)) continue;
        const fullPath = join(projectPath, file.name);
        await tryAddSession(fullPath, sessionId, projectDir, false, parents);
        seenSessionIds.add(sessionId);
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
}

/** Claude Code session scanning — scans live dir then archive for deleted sessions. */
async function listClaudeSessions(basePath?: string): Promise<SessionMeta[]> {
  const parents: SessionMeta[] = [];
  const childrenByParentId = new Map<string, SessionMeta[]>();
  const seenSessionIds = new Set<string>();

  // 1. Scan live Claude sessions first (these take precedence)
  const liveBase = basePath ?? join(homedir(), ".claude", "projects");
  await scanClaudeDir(liveBase, parents, childrenByParentId, seenSessionIds);

  // 2. Scan archive for sessions Claude may have deleted (skip basePath override for tests)
  if (!basePath) {
    const archiveBase = getArchiveDir();
    await scanClaudeDir(archiveBase, parents, childrenByParentId, seenSessionIds);
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
      return;
    }
  }
  if (process.env.HEYIAM_VERBOSE === '1') {
    console.log(`[discovery] No parser matched: ${fullPath}`);
  }
}
