import { readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
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
 * Children are linked to parents by matching the directory name ({uuid}/)
 * to the parent's session file ({uuid}.jsonl). By default, only parent
 * sessions are returned at the top level; children are nested in the
 * parent's `children` array.
 */
export async function listSessions(basePath?: string): Promise<SessionMeta[]> {
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
        // Main session file
        const fullPath = join(projectPath, file.name);
        const sessionId = file.name.replace(/\.jsonl$/, "");
        await tryAddSession(fullPath, sessionId, projectDir, false, parents);
      } else if (file.isDirectory()) {
        // Directory name is the parent session UUID
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
    await tryAddSession(fullPath, sessionId, projectDir, true, children, parentSessionId);
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
): Promise<void> {
  for (const parser of parsers) {
    if (await parser.detect(fullPath)) {
      const meta: SessionMeta = { path: fullPath, source: parser.name, sessionId, projectDir, isSubagent };
      if (parentSessionId) {
        meta.parentSessionId = parentSessionId;
      }
      out.push(meta);
      break;
    }
  }
}
