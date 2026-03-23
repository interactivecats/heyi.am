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
      if (role === "assistant" && lastRole === "user") {
        turns++;
      }
      lastRole = role;
    }
  }
  return turns;
}

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

function computeDuration(entries: RawEntry[]): {
  duration_ms: number;
  wall_clock_ms: number;
  start_time: string | null;
  end_time: string | null;
} {
  const timestamps: number[] = [];
  let startStr: string | null = null;
  let endStr: string | null = null;

  for (const entry of entries) {
    if (!entry.timestamp) continue;
    if (!startStr) startStr = entry.timestamp;
    endStr = entry.timestamp;
    timestamps.push(new Date(entry.timestamp).getTime());
  }

  if (timestamps.length < 2 || !startStr || !endStr) {
    return { duration_ms: 0, wall_clock_ms: 0, start_time: startStr, end_time: endStr };
  }

  const wallClock = timestamps[timestamps.length - 1] - timestamps[0];

  let activeMs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap < IDLE_THRESHOLD_MS) {
      activeMs += gap;
    }
  }

  return {
    duration_ms: Math.max(activeMs, 0),
    wall_clock_ms: Math.max(wallClock, 0),
    start_time: startStr,
    end_time: endStr,
  };
}

export function computeLocStats(entries: RawEntry[]): LocStats {
  const toolCalls = extractToolCalls(entries);
  let totalAdded = 0;
  let totalRemoved = 0;
  const filesChanged = new Set<string>();

  const writeLineCounts = new Map<string, number>();

  for (const call of toolCalls) {
    if (call.name === "Write") {
      const filePath = call.input.file_path;
      const content = call.input.content;
      if (typeof filePath !== "string" || typeof content !== "string") continue;

      const lines = content.split("\n").length;
      const prevLines = writeLineCounts.get(filePath) ?? 0;

      if (writeLineCounts.has(filePath)) {
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
  if (!path.endsWith(".jsonl")) return false;

  try {
    const raw = await readFile(path, "utf-8");
    // Check the first few lines — some sessions start with file-history-snapshot
    // or progress entries before the first user/assistant entry with sessionId
    const lines = raw.split("\n").slice(0, 10);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (
          typeof entry.sessionId === "string" &&
          typeof entry.type === "string"
        ) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function mapAgentRole(subagentType: string): string {
  if (subagentType.startsWith("trc-")) {
    return subagentType.slice(4);
  }
  return subagentType.toLowerCase();
}

async function parse(path: string): Promise<SessionAnalysis> {
  const raw = await readFile(path, "utf-8");
  const entries = parseEntries(raw);
  const toolCalls = extractToolCalls(entries);
  const filesTouched = extractFilesTouched(toolCalls);
  const turns = countTurns(entries);
  const { duration_ms, wall_clock_ms, start_time, end_time } = computeDuration(entries);
  const loc_stats = computeLocStats(entries);

  const cwd = entries.find((e) => e.cwd)?.cwd;

  return {
    source: "claude",
    turns,
    tool_calls: toolCalls,
    files_touched: filesTouched,
    duration_ms,
    wall_clock_ms,
    loc_stats,
    raw_entries: entries,
    start_time,
    end_time,
    cwd,
  };
}

export const claudeParser: SessionParser = {
  name: "claude",
  detect,
  parse,
};
