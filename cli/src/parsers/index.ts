import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { claudeParser } from "./claude.js";
import type { SessionParser, SessionAnalysis } from "./types.js";

export type { SessionAnalysis, SessionParser, SessionSource, ToolCall, LocStats, RawEntry } from "./types.js";

const parsers: SessionParser[] = [claudeParser];

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

/** Scan for all Claude Code session files under a base path.
 *
 * Claude Code stores sessions as:
 *   ~/.claude/projects/{encoded-path}/{uuid}.jsonl                  ← main sessions
 *   ~/.claude/projects/{encoded-path}/{uuid}/subagents/{id}.jsonl   ← subagent sessions
 *
 * Both are included, grouped under the same project. Subagent sessions
 * are flagged with `isSubagent: true`.
 */
export async function listSessions(basePath?: string): Promise<SessionMeta[]> {
  const base = basePath ?? join(homedir(), ".claude", "projects");
  const sessions: SessionMeta[] = [];

  let projectDirs;
  try {
    projectDirs = await readdir(base, { withFileTypes: true });
  } catch {
    return sessions;
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
        // Main session file
        const fullPath = join(projectPath, file.name);
        const sessionId = file.name.replace(/\.jsonl$/, "");
        await tryAddSession(fullPath, sessionId, projectDir, false, sessions);
      } else if (file.isDirectory()) {
        // Check for subagents/ inside session data dirs
        await collectSubagents(join(projectPath, file.name), projectDir, sessions);
      }
    }
  }

  return sessions;
}

async function collectSubagents(
  sessionDataDir: string,
  projectDir: string,
  out: SessionMeta[],
): Promise<void> {
  const subagentsDir = join(sessionDataDir, "subagents");
  let files;
  try {
    files = await readdir(subagentsDir, { withFileTypes: true });
  } catch {
    return; // No subagents directory
  }

  for (const file of files) {
    if (!file.name.endsWith(".jsonl") || file.isDirectory()) continue;
    const fullPath = join(subagentsDir, file.name);
    const sessionId = file.name.replace(/\.jsonl$/, "");
    await tryAddSession(fullPath, sessionId, projectDir, true, out);
  }
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
