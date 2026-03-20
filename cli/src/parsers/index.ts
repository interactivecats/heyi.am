import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { claudeParser } from "./claude.js";
import type { SessionParser, SessionAnalysis } from "./types.js";

export type { SessionAnalysis, SessionParser, SessionSource, ToolCall, LocStats, RawEntry } from "./types.js";

const parsers: SessionParser[] = [claudeParser];

export interface SessionMeta {
  path: string;
  source: string;
  sessionId: string;
}

/** Detect which parser handles a given file and parse it */
export async function parseSession(path: string): Promise<SessionAnalysis> {
  for (const parser of parsers) {
    if (await parser.detect(path)) {
      return parser.parse(path);
    }
  }
  throw new Error(`No parser detected for: ${path}`);
}

/** Scan for all Claude Code session files under a base path */
export async function listSessions(basePath?: string): Promise<SessionMeta[]> {
  const base = basePath ?? join(homedir(), ".claude", "projects");
  const sessions: SessionMeta[] = [];

  try {
    await collectSessions(base, sessions);
  } catch {
    // base path doesn't exist or isn't readable
  }

  return sessions;
}

async function collectSessions(dir: string, out: SessionMeta[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectSessions(fullPath, out);
    } else if (entry.name.endsWith(".jsonl")) {
      // Extract sessionId from filename (UUID.jsonl)
      const sessionId = entry.name.replace(/\.jsonl$/, "");
      // Try to detect which parser handles it
      for (const parser of parsers) {
        if (await parser.detect(fullPath)) {
          out.push({ path: fullPath, source: parser.name, sessionId });
          break;
        }
      }
    }
  }
}
