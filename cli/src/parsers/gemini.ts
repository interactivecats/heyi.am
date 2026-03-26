import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  SessionParser,
  SessionAnalysis,
  RawEntry,
  ToolCall,
  LocStats,
  ContentBlock,
} from "./types.js";

// --- Gemini log formats ---

// Legacy format (v0.1.x): logs.json — array of entries, user messages only
interface GeminiLogEntry {
  sessionId: string;
  messageId: number;
  type: string; // "user" (model responses are not logged in legacy)
  message: string;
  timestamp: string;
}

// New format (v0.30+): chats/session-*.json — single JSON object with all messages
interface GeminiNewSession {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  kind?: string;
  messages: GeminiNewMessage[];
}

interface GeminiNewMessage {
  id: string;
  timestamp: string;
  type: string; // "user" | "gemini"
  content: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }>;
}

export interface GeminiSessionFile {
  path: string;
  sessionId: string;
  projectHash: string;
  projectDir?: string;
  format?: 'legacy' | 'new';
}

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

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

// --- Parse new format (v0.30+) ---

function isNewFormat(parsed: unknown): parsed is GeminiNewSession {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    typeof (parsed as GeminiNewSession).sessionId === "string" &&
    Array.isArray((parsed as GeminiNewSession).messages)
  );
}

function parseNewSession(session: GeminiNewSession): GeminiLogEntry[] {
  const entries: GeminiLogEntry[] = [];
  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i];
    // Extract text content
    const textParts = (msg.content || [])
      .filter((c) => c.text)
      .map((c) => c.text!);
    const text = textParts.join("\n");

    // Map type: "gemini" → "model", keep "user" as "user"
    const type = msg.type === "gemini" ? "model" : msg.type;

    if (text || msg.content?.some((c) => c.functionCall || c.functionResponse)) {
      entries.push({
        sessionId: session.sessionId,
        messageId: i,
        type,
        message: text || "[tool interaction]",
        timestamp: msg.timestamp,
      });
    }
  }
  return entries;
}

// --- Extract tool calls from new format ---

function extractToolCallsFromNewSession(session: GeminiNewSession): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const msg of session.messages) {
    for (const part of msg.content || []) {
      if (part.functionCall) {
        calls.push({
          id: msg.id,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        });
      }
    }
  }
  return calls;
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
  // Gemini only logs user messages. Each user message implies an exchange.
  // But consecutive user messages without a model type between them
  // are likely the same turn (follow-ups). Count each user message as a turn.
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

// --- Compute LOC from tool calls ---

/** Map Gemini tool names to the standard names used by bridge.ts / other parsers */
const GEMINI_WRITE_TOOLS = new Set(["write_to_file", "create_file"]);
const GEMINI_EDIT_TOOLS = new Set(["edit_file", "apply_diff"]);

function computeLocFromToolCalls(toolCalls: ToolCall[]): LocStats {
  let totalAdded = 0;
  let totalRemoved = 0;
  const filesChanged = new Set<string>();
  const writeLineCounts = new Map<string, number>();

  for (const call of toolCalls) {
    const input = call.input;
    const rawName = call.name;

    if (GEMINI_WRITE_TOOLS.has(rawName)) {
      const content = (input.content ?? input.file_text ?? input.code ?? "") as string;
      const filePath = (input.path ?? input.file_path ?? input.filename ?? input.target_file ?? "") as string;
      if (!content || !filePath) continue;

      const lines = content.split("\n").length;
      const prevLines = writeLineCounts.get(filePath) ?? 0;

      if (writeLineCounts.has(filePath)) {
        totalAdded -= prevLines;
      }
      totalAdded += lines;
      writeLineCounts.set(filePath, lines);
      filesChanged.add(filePath);
    } else if (GEMINI_EDIT_TOOLS.has(rawName)) {
      const filePath = (input.path ?? input.file_path ?? input.filename ?? input.target_file ?? "") as string;
      if (!filePath) continue;

      const oldStr = (input.old_string ?? input.old_text ?? input.original ?? "") as string;
      const newStr = (input.new_string ?? input.new_text ?? input.replacement ?? "") as string;

      totalAdded += newStr ? newStr.split("\n").length : 0;
      totalRemoved += oldStr ? oldStr.split("\n").length : 0;
      filesChanged.add(filePath);
    }
    // read_file: ignored for LOC
  }

  return {
    loc_added: totalAdded,
    loc_removed: totalRemoved,
    loc_net: totalAdded - totalRemoved,
    files_changed: [...filesChanged].sort(),
  };
}

// --- Extract file paths from tool call args ---

function extractFilesFromToolCalls(toolCalls: ToolCall[]): string[] {
  const files = new Set<string>();
  for (const call of toolCalls) {
    const input = call.input;
    // Look for common file path keys in functionCall.args
    for (const key of ["path", "file_path", "filename", "target_file"]) {
      const val = input[key];
      if (typeof val === "string" && val.length > 0) {
        files.add(val);
        break; // only add once per tool call
      }
    }
  }
  return [...files].sort();
}

// --- Analyze a single session ---

function analyzeSession(entries: GeminiLogEntry[], toolCalls?: ToolCall[]): SessionAnalysis {
  const { duration_ms, wall_clock_ms, start_time, end_time } = computeDuration(entries);
  const textFiles = extractFilesTouched(entries);
  const toolFiles = toolCalls ? extractFilesFromToolCalls(toolCalls) : [];
  const allFiles = [...new Set([...textFiles, ...toolFiles])].sort();
  const loc_stats = toolCalls ? computeLocFromToolCalls(toolCalls) : { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] };

  return {
    source: "gemini",
    turns: countTurns(entries),
    tool_calls: toolCalls ?? [],
    files_touched: allFiles,
    duration_ms,
    wall_clock_ms,
    loc_stats,
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

    // New format: { sessionId, messages[] }
    if (isNewFormat(parsed)) return true;

    // Legacy format: [{ sessionId, messageId, timestamp }]
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    const first = parsed[0];
    return typeof first.sessionId === "string" && typeof first.messageId === "number" && typeof first.timestamp === "string";
  } catch {
    return false;
  }
}

async function parse(path: string): Promise<SessionAnalysis> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);

  // New format (v0.30+): single session JSON object
  if (isNewFormat(parsed)) {
    const entries = parseNewSession(parsed);
    const toolCalls = extractToolCallsFromNewSession(parsed);
    return analyzeSession(entries, toolCalls);
  }

  // Legacy format: JSON array of entries
  const allEntries = parseGeminiLog(raw);

  if (allEntries.length === 0) {
    return analyzeSession([]);
  }

  const groups = groupBySession(allEntries);

  // For a single session request (gemini://{hash}?session={id}), filter
  if (path.startsWith("gemini://")) {
    const url = new URL(path);
    const sessionId = url.searchParams.get("session");
    if (sessionId && groups.has(sessionId)) {
      return analyzeSession(groups.get(sessionId)!);
    }
  }

  // Default: merge all entries in the file (sorted by timestamp)
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
    const dirPath = join(base, entry.name);

    // --- New format (v0.30+): chats/session-*.json ---
    const chatsDir = join(dirPath, "chats");
    try {
      const chatFiles = await readdir(chatsDir, { withFileTypes: true });
      for (const chatFile of chatFiles) {
        if (!chatFile.name.startsWith("session-") || !chatFile.name.endsWith(".json")) continue;
        const chatPath = join(chatsDir, chatFile.name);

        try {
          const raw = await readFile(chatPath, "utf-8");
          const parsed = JSON.parse(raw);
          if (isNewFormat(parsed)) {
            // New format uses project name as directory, not just hash
            // entry.name could be "heyi-am" (project name) or a SHA-256 hash
            const isHash = /^[0-9a-f]{64}$/.test(entry.name);
            results.push({
              path: chatPath,
              sessionId: parsed.sessionId,
              projectHash: parsed.projectHash || entry.name,
              // For named dirs, use the dir name as project identifier
              projectDir: isHash ? undefined : entry.name,
              format: 'new',
            });
          }
        } catch {
          // Skip unparseable files
        }
      }
    } catch {
      // No chats/ directory — try legacy format
    }

    // --- Legacy format: logs.json ---
    const logsPath = join(dirPath, "logs.json");
    try {
      const raw = await readFile(logsPath, "utf-8");
      const parsed = JSON.parse(raw);

      // Skip if this is actually a new-format file misnamed as logs.json
      if (isNewFormat(parsed)) {
        results.push({
          path: logsPath,
          sessionId: (parsed as GeminiNewSession).sessionId,
          projectHash: entry.name,
          projectDir: /^[0-9a-f]{64}$/.test(entry.name) ? undefined : entry.name,
          format: 'new',
        });
        continue;
      }

      // Legacy array format
      const entries = parseGeminiLog(raw);
      const groups = groupBySession(entries);

      for (const [sessionId] of groups) {
        results.push({
          path: logsPath,
          sessionId,
          projectHash: entry.name,
          projectDir: undefined, // resolved via hash matching later
          format: 'legacy',
        });
      }
    } catch {
      // No logs.json either — skip this directory
    }
  }

  // Deduplicate: prefer new format over legacy for same sessionId
  const seen = new Map<string, GeminiSessionFile>();
  for (const r of results) {
    const existing = seen.get(r.sessionId);
    if (!existing || (r.format === 'new' && existing.format === 'legacy')) {
      seen.set(r.sessionId, r);
    }
  }

  return [...seen.values()];
}

/**
 * Try to resolve a project hash to a directory by hashing candidate paths.
 * Pass known project directories (e.g., from Claude or Cursor) and this
 * will match them against Gemini's hashes.
 */
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

// Re-exports for testing
export { parseGeminiLog, groupBySession, analyzeSession, extractFileRefsFromText };
