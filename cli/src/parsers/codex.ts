import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  type SessionParser,
  type SessionAnalysis,
  type RawEntry,
  type ToolCall,
  type LocStats,
  readFirstLineEfficient,
} from "./types.js";

// -- Codex JSONL types --

interface CodexLine {
  timestamp: string;
  type: "session_meta" | "response_item" | "event_msg" | "turn_context";
  payload: Record<string, unknown>;
}

interface SessionMetaPayload {
  id: string;
  cwd: string;
  cli_version?: string;
  originator?: string;
  source?: string;
}

interface FunctionCallPayload {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
}

interface CustomToolCallPayload {
  type: "custom_tool_call";
  name: string;
  input: string;
  call_id: string;
}

interface MessagePayload {
  type: "message";
  role: string;
  content?: Array<{ type: string; text?: string }>;
}

// -- Parsing --

function parseLines(raw: string): CodexLine[] {
  const lines: CodexLine[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed) as CodexLine);
    } catch {
      // skip malformed
    }
  }
  return lines;
}

function getSessionMeta(lines: CodexLine[]): SessionMetaPayload | null {
  for (const line of lines) {
    if (line.type === "session_meta") {
      return line.payload as unknown as SessionMetaPayload;
    }
  }
  return null;
}

const TOOL_NAME_MAP: Record<string, string> = {
  exec_command: "Bash",
  apply_patch: "Edit",
};

function extractToolCalls(lines: CodexLine[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const line of lines) {
    if (line.type !== "response_item") continue;
    const p = line.payload as Record<string, unknown>;
    if (p.type === "function_call") {
      const fc = p as unknown as FunctionCallPayload;
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(fc.arguments) as Record<string, unknown>;
      } catch { /* raw string arg like apply_patch */ }
      const name = TOOL_NAME_MAP[fc.name] ?? fc.name;
      calls.push({ id: fc.call_id, name, input });
    } else if (p.type === "custom_tool_call") {
      const ct = p as unknown as CustomToolCallPayload;
      const name = TOOL_NAME_MAP[ct.name] ?? ct.name;
      calls.push({ id: ct.call_id, name, input: { patch: ct.input } });
    }
  }
  return calls;
}

function extractFilesTouched(toolCalls: ToolCall[], cwd?: string): string[] {
  const files = new Set<string>();
  for (const call of toolCalls) {
    if (call.name === "Bash") {
      const cmd = call.input.cmd as string | undefined;
      const workdir = call.input.workdir as string | undefined;
      if (workdir) files.add(workdir);
      if (cmd) {
        // Extract file paths from common read patterns: cat, sed, rg, etc.
        const pathMatches = cmd.match(/(?:cat|sed\s+-n\s+'[^']*'\s+|nl\s+|wc\s+-l\s+)(\S+)/g);
        if (pathMatches) {
          for (const m of pathMatches) {
            const parts = m.split(/\s+/);
            const filePath = parts[parts.length - 1];
            if (filePath && !filePath.startsWith("-")) files.add(filePath);
          }
        }
      }
    } else if (call.name === "Edit") {
      // apply_patch: extract file paths from patch content
      const patch = call.input.patch as string | undefined;
      if (patch) {
        const fileMatches = patch.matchAll(/\*\*\* (?:Update|Add|Delete) File: (.+)/g);
        for (const m of fileMatches) {
          files.add(m[1]);
        }
      }
    }
  }
  return [...files].sort();
}

function countTurns(lines: CodexLine[]): number {
  let turns = 0;
  for (const line of lines) {
    if (line.type === "event_msg") {
      const p = line.payload as Record<string, unknown>;
      if (p.type === "task_started") turns++;
    }
  }
  return turns;
}

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

function computeDuration(lines: CodexLine[]): {
  duration_ms: number;
  wall_clock_ms: number;
  start_time: string | null;
  end_time: string | null;
  active_intervals: [number, number][];
} {
  const timestamps: number[] = [];
  let startStr: string | null = null;
  let endStr: string | null = null;

  for (const line of lines) {
    if (!line.timestamp) continue;
    if (!startStr) startStr = line.timestamp;
    endStr = line.timestamp;
    timestamps.push(new Date(line.timestamp).getTime());
  }

  if (timestamps.length < 2 || !startStr || !endStr) {
    return { duration_ms: 0, wall_clock_ms: 0, start_time: startStr, end_time: endStr, active_intervals: [] };
  }

  const wallClock = timestamps[timestamps.length - 1] - timestamps[0];
  let activeMs = 0;
  const active_intervals: [number, number][] = [];
  let intervalStart = timestamps[0];

  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap < IDLE_THRESHOLD_MS) {
      activeMs += gap;
    } else {
      active_intervals.push([intervalStart, timestamps[i - 1]]);
      intervalStart = timestamps[i];
    }
  }
  active_intervals.push([intervalStart, timestamps[timestamps.length - 1]]);

  return {
    duration_ms: Math.max(activeMs, 0),
    wall_clock_ms: Math.max(wallClock, 0),
    start_time: startStr,
    end_time: endStr,
    active_intervals,
  };
}

function computeLocStats(toolCalls: ToolCall[]): LocStats {
  let totalAdded = 0;
  let totalRemoved = 0;
  const filesChanged = new Set<string>();

  for (const call of toolCalls) {
    if (call.name !== "Edit") continue;
    const patch = call.input.patch as string | undefined;
    if (!patch) continue;

    // Parse apply_patch format for file changes
    const fileMatches = patch.matchAll(/\*\*\* (?:Update|Add|Delete) File: (.+)/g);
    for (const m of fileMatches) {
      filesChanged.add(m[1]);
    }

    for (const line of patch.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) totalAdded++;
      if (line.startsWith("-") && !line.startsWith("---")) totalRemoved++;
    }
  }

  return {
    loc_added: totalAdded,
    loc_removed: totalRemoved,
    loc_net: totalAdded - totalRemoved,
    files_changed: [...filesChanged].sort(),
  };
}

function toRawEntries(lines: CodexLine[], sessionId: string, cwd?: string): RawEntry[] {
  return lines.map((line, i) => {
    const p = line.payload as Record<string, unknown>;
    let entryType = "system";
    let message: RawEntry["message"] | undefined;

    if (line.type === "response_item" && p.type === "message") {
      const mp = p as unknown as MessagePayload;
      entryType = mp.role === "user" ? "user" : mp.role === "assistant" ? "assistant" : "system";
      const textContent = mp.content
        ?.filter((b) => b.type === "input_text" || b.type === "output_text")
        .map((b) => b.text ?? "")
        .join("\n");
      message = { role: mp.role, content: textContent || undefined };
    } else if (line.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
      entryType = "assistant";
    } else if (line.type === "event_msg" && p.type === "user_message") {
      entryType = "user";
      message = { role: "user", content: (p as Record<string, unknown>).message as string };
    } else if (line.type === "event_msg" && p.type === "agent_message") {
      entryType = "assistant";
      message = { role: "assistant", content: (p as Record<string, unknown>).message as string };
    } else if (line.type === "session_meta") {
      entryType = "system";
    }

    return {
      type: entryType,
      uuid: `codex-${sessionId}-${i}`,
      timestamp: line.timestamp,
      sessionId,
      message,
      cwd,
    };
  });
}

// -- Parser interface --

async function detect(path: string): Promise<boolean> {
  if (!path.endsWith(".jsonl")) return false;
  try {
    const firstLine = await readFirstLineEfficient(path);
    if (!firstLine) return false;
    const entry = JSON.parse(firstLine) as Record<string, unknown>;
    if (entry.type !== "session_meta") return false;
    const payload = entry.payload as Record<string, unknown> | undefined;
    return !!(payload?.cwd && (payload?.cli_version || payload?.originator));
  } catch {
    return false;
  }
}

async function parse(path: string): Promise<SessionAnalysis> {
  const raw = await readFile(path, "utf-8");
  const lines = parseLines(raw);
  const meta = getSessionMeta(lines);
  const sessionId = meta?.id ?? "unknown";
  const cwd = meta?.cwd;
  const toolCalls = extractToolCalls(lines);
  const filesTouched = extractFilesTouched(toolCalls, cwd);
  const turns = countTurns(lines);
  const { duration_ms, wall_clock_ms, start_time, end_time, active_intervals } = computeDuration(lines);
  const loc_stats = computeLocStats(toolCalls);
  const raw_entries = toRawEntries(lines, sessionId, cwd);

  return {
    source: "codex",
    turns,
    tool_calls: toolCalls,
    files_touched: filesTouched,
    duration_ms,
    wall_clock_ms,
    loc_stats,
    raw_entries,
    start_time,
    end_time,
    active_intervals,
    cwd,
  };
}

export const codexParser: SessionParser = {
  name: "codex",
  detect,
  parse,
};

// -- Discovery --

export interface CodexSessionFile {
  path: string;
  sessionId: string;
  cwd: string;
}


async function walkDir(dir: string, pattern: RegExp, results: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, pattern, results);
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
}

export async function discoverCodexSessions(): Promise<CodexSessionFile[]> {
  const sessionsDir = join(homedir(), ".codex", "sessions");
  const files: string[] = [];
  await walkDir(sessionsDir, /^rollout-.*\.jsonl$/, files);

  const results: CodexSessionFile[] = [];
  const seenIds = new Set<string>();
  for (const filePath of files) {
    const firstLine = await readFirstLineEfficient(filePath);
    if (!firstLine) continue;
    try {
      const entry = JSON.parse(firstLine) as { type?: string; payload?: SessionMetaPayload };
      if (entry.type !== "session_meta" || !entry.payload?.cwd || !entry.payload?.id) continue;
      // Codex creates separate rollout files for continuations of the same session
      if (seenIds.has(entry.payload.id)) continue;
      seenIds.add(entry.payload.id);
      results.push({
        path: filePath,
        sessionId: entry.payload.id,
        cwd: entry.payload.cwd,
      });
    } catch {
      continue;
    }
  }

  return results;
}
