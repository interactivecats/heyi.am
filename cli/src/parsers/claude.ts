import { readFile } from "node:fs/promises";
import {
  type SessionParser,
  type SessionAnalysis,
  type RawEntry,
  type ToolCall,
  type LocStats,
  type ToolUseBlock,
  type ContentBlock,
} from "./types.js";

/**
 * Parse a Claude Code .jsonl session file into structured analysis.
 *
 * Claude Code sessions are newline-delimited JSON with entry types:
 *   - user: user messages (may contain tool_result content blocks)
 *   - assistant: model responses (text, thinking, tool_use blocks)
 *   - system: metadata (subtypes: turn_duration, api_error, compact_boundary, etc.)
 *   - progress: hook/streaming progress events
 *   - file-history-snapshot, agent-name, custom-title, last-prompt, queue-operation
 *
 * Tool calls appear as { type: "tool_use", id, name, input } content blocks
 * inside assistant messages. Tool results appear as { type: "tool_result" }
 * blocks inside subsequent user messages.
 */

function parseEntries(raw: string): RawEntry[] {
  const entries: RawEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as RawEntry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function getContentBlocks(entry: RawEntry): ContentBlock[] {
  const content = entry.message?.content;
  if (!content || typeof content === "string") return [];
  return content;
}

function extractToolCalls(entries: RawEntry[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    for (const block of getContentBlocks(entry)) {
      if (isToolUseBlock(block)) {
        calls.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
  }
  return calls;
}

function extractFilesTouched(toolCalls: ToolCall[]): string[] {
  const files = new Set<string>();
  for (const call of toolCalls) {
    const input = call.input;
    switch (call.name) {
      case "Read":
      case "Write":
        if (typeof input.file_path === "string") files.add(input.file_path);
        break;
      case "Edit":
        if (typeof input.file_path === "string") files.add(input.file_path);
        break;
      case "Glob":
      case "Grep":
        if (typeof input.path === "string") files.add(input.path);
        break;
    }
  }
  return [...files].sort();
}

function countTurns(entries: RawEntry[]): number {
  let turns = 0;
  let lastRole: string | null = null;
  for (const entry of entries) {
    if (entry.type === "user" || entry.type === "assistant") {
      const role = entry.type;
      // A turn is a user→assistant exchange. Count each time we see
      // an assistant message following a user message (directly or
      // with intervening system/progress entries).
      if (role === "assistant" && lastRole === "user") {
        turns++;
      }
      lastRole = role;
    }
  }
  return turns;
}

function computeDuration(entries: RawEntry[]): {
  duration_ms: number;
  start_time: string | null;
  end_time: string | null;
} {
  let start: string | null = null;
  let end: string | null = null;
  for (const entry of entries) {
    if (!entry.timestamp) continue;
    if (!start) start = entry.timestamp;
    end = entry.timestamp;
  }
  if (!start || !end) return { duration_ms: 0, start_time: null, end_time: null };
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return { duration_ms: Math.max(0, ms), start_time: start, end_time: end };
}

export function computeLocStats(entries: RawEntry[]): LocStats {
  const toolCalls = extractToolCalls(entries);
  let totalAdded = 0;
  let totalRemoved = 0;
  const filesChanged = new Set<string>();

  // Track last-write line counts per file for dedup
  const writeLineCounts = new Map<string, number>();

  for (const call of toolCalls) {
    if (call.name === "Write") {
      const filePath = call.input.file_path;
      const content = call.input.content;
      if (typeof filePath !== "string" || typeof content !== "string") continue;

      const lines = content.split("\n").length;
      const prevLines = writeLineCounts.get(filePath) ?? 0;

      if (writeLineCounts.has(filePath)) {
        // Overwrite: remove previous count, add new
        totalAdded -= prevLines;
        totalAdded += lines;
      } else {
        totalAdded += lines;
      }

      writeLineCounts.set(filePath, lines);
      filesChanged.add(filePath);
    } else if (call.name === "Edit") {
      const filePath = call.input.file_path;
      const oldStr = call.input.old_string;
      const newStr = call.input.new_string;
      if (typeof filePath !== "string") continue;

      const oldLines = typeof oldStr === "string" ? oldStr.split("\n").length : 0;
      const newLines = typeof newStr === "string" ? newStr.split("\n").length : 0;

      totalAdded += newLines;
      totalRemoved += oldLines;
      filesChanged.add(filePath);
    }
  }

  return {
    loc_added: totalAdded,
    loc_removed: totalRemoved,
    loc_net: totalAdded - totalRemoved,
    files_changed: [...filesChanged].sort(),
  };
}

async function detect(path: string): Promise<boolean> {
  // Claude Code session files are .jsonl in ~/.claude/projects/
  if (!path.endsWith(".jsonl")) return false;

  try {
    const raw = await readFile(path, "utf-8");
    const firstLine = raw.split("\n")[0];
    if (!firstLine) return false;
    const entry = JSON.parse(firstLine) as Record<string, unknown>;
    // Claude sessions have sessionId, type, and typically version fields
    return (
      typeof entry.sessionId === "string" &&
      typeof entry.type === "string" &&
      typeof entry.version === "string"
    );
  } catch {
    return false;
  }
}

async function parse(path: string): Promise<SessionAnalysis> {
  const raw = await readFile(path, "utf-8");
  const entries = parseEntries(raw);
  const toolCalls = extractToolCalls(entries);
  const filesTouched = extractFilesTouched(toolCalls);
  const turns = countTurns(entries);
  const { duration_ms, start_time, end_time } = computeDuration(entries);
  const loc_stats = computeLocStats(entries);

  return {
    source: "claude",
    turns,
    tool_calls: toolCalls,
    files_touched: filesTouched,
    duration_ms,
    loc_stats,
    raw_entries: entries,
    start_time,
    end_time,
  };
}

export const claudeParser: SessionParser = {
  name: "claude",
  detect,
  parse,
};
