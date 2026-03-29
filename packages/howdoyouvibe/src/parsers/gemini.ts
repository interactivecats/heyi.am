import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  type SessionParser,
  type SessionAnalysis,
  type RawEntry,
  IDLE_THRESHOLD_MS,
} from "./types.js";

// --- Gemini log format ---

interface GeminiLogEntry {
  sessionId: string;
  messageId: number;
  type: string;
  message: string;
  timestamp: string;
}

export interface GeminiSessionFile {
  path: string;
  sessionId: string;
  projectHash: string;
  projectDir?: string;
}


const GEMINI_BASE = () => join(homedir(), ".gemini", "tmp");

// --- File path extraction from message text ---

const ABS_PATH_RE = /(?:^|\s)(\/[\w./-]+\.\w+)/g;
const AT_REF_RE = /@([\w./-]+)/g;

function extractFileRefsFromText(text: string): string[] {
  const files = new Set<string>();
  for (const match of text.matchAll(ABS_PATH_RE)) {
    files.add(match[1]);
  }
  for (const match of text.matchAll(AT_REF_RE)) {
    files.add(match[1]);
  }
  return [...files];
}

// --- Parse log entries ---

function parseGeminiLog(raw: string): GeminiLogEntry[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown): e is GeminiLogEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as GeminiLogEntry).sessionId === "string" &&
        typeof (e as GeminiLogEntry).timestamp === "string",
    );
  } catch {
    return [];
  }
}

function groupBySession(entries: GeminiLogEntry[]): Map<string, GeminiLogEntry[]> {
  const groups = new Map<string, GeminiLogEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.sessionId) ?? [];
    group.push(entry);
    groups.set(entry.sessionId, group);
  }
  return groups;
}

// --- Convert to RawEntry[] ---

function toRawEntries(entries: GeminiLogEntry[]): RawEntry[] {
  return entries.map((e) => ({
    type: e.type === "model" ? "assistant" : "user",
    uuid: `${e.sessionId}-${e.messageId}`,
    timestamp: e.timestamp,
    sessionId: e.sessionId,
    message: {
      role: e.type === "model" ? "assistant" : "user",
      content: e.message,
    },
  }));
}

// --- Duration ---

function computeDuration(entries: GeminiLogEntry[]): {
  duration_ms: number;
  wall_clock_ms: number;
  start_time: string | null;
  end_time: string | null;
} {
  if (entries.length === 0) {
    return { duration_ms: 0, wall_clock_ms: 0, start_time: null, end_time: null };
  }

  const timestamps = entries.map((e) => new Date(e.timestamp).getTime());
  const start_time = entries[0].timestamp;
  const end_time = entries[entries.length - 1].timestamp;

  if (timestamps.length < 2) {
    return { duration_ms: 0, wall_clock_ms: 0, start_time, end_time };
  }

  const wall_clock_ms = timestamps[timestamps.length - 1] - timestamps[0];

  let activeMs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap < IDLE_THRESHOLD_MS) {
      activeMs += gap;
    }
  }

  return { duration_ms: Math.max(activeMs, 0), wall_clock_ms: Math.max(wall_clock_ms, 0), start_time, end_time };
}

// --- Turns ---

function countTurns(entries: GeminiLogEntry[]): number {
  return entries.filter((e) => e.type === "user").length;
}

// --- Files touched ---

function extractFilesTouched(entries: GeminiLogEntry[]): string[] {
  const files = new Set<string>();
  for (const entry of entries) {
    for (const f of extractFileRefsFromText(entry.message)) {
      files.add(f);
    }
  }
  return [...files].sort();
}

// --- Analyze a single session ---

function analyzeSession(entries: GeminiLogEntry[]): SessionAnalysis {
  const { duration_ms, wall_clock_ms, start_time, end_time } = computeDuration(entries);
  const filesTouched = extractFilesTouched(entries);

  return {
    source: "gemini",
    turns: countTurns(entries),
    tool_calls: [],
    files_touched: filesTouched,
    duration_ms,
    wall_clock_ms,
    loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
    raw_entries: toRawEntries(entries),
    start_time,
    end_time,
  };
}

// --- SessionParser interface ---

async function detect(path: string): Promise<boolean> {
  if (!path.endsWith(".json")) return false;
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    const first = parsed[0];
    return typeof first.sessionId === "string" && typeof first.messageId === "number" && typeof first.timestamp === "string";
  } catch {
    return false;
  }
}

async function parse(path: string): Promise<SessionAnalysis> {
  const raw = await readFile(path, "utf-8");
  const allEntries = parseGeminiLog(raw);

  if (allEntries.length === 0) {
    return analyzeSession([]);
  }

  const sorted = allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return analyzeSession(sorted);
}

export const geminiParser: SessionParser = {
  name: "gemini",
  detect,
  parse,
};

// --- Discovery ---

export function hashProjectDir(dir: string): string {
  return createHash("sha256").update(dir).digest("hex");
}

export async function discoverGeminiSessions(): Promise<GeminiSessionFile[]> {
  const base = GEMINI_BASE();
  const results: GeminiSessionFile[] = [];

  let dirs;
  try {
    dirs = await readdir(base, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    const logsPath = join(base, entry.name, "logs.json");

    let raw: string;
    try {
      raw = await readFile(logsPath, "utf-8");
    } catch {
      continue;
    }

    const entries = parseGeminiLog(raw);
    const groups = groupBySession(entries);

    for (const [sessionId] of groups) {
      results.push({
        path: logsPath,
        sessionId,
        projectHash: entry.name,
        projectDir: undefined,
      });
    }
  }

  return results;
}

export function resolveProjectDirs(
  sessions: GeminiSessionFile[],
  knownDirs: string[],
): GeminiSessionFile[] {
  const hashToDir = new Map<string, string>();
  for (const dir of knownDirs) {
    hashToDir.set(hashProjectDir(dir), dir);
  }

  return sessions.map((s) => ({
    ...s,
    projectDir: hashToDir.get(s.projectHash) ?? s.projectDir,
  }));
}

