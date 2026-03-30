// Bridge — converts parser output (SessionAnalysis from parsers/types.ts)
// into the analyzer's input format (SessionAnalysis from analyzer.ts)

import type {
  SessionAnalysis as ParserOutput,
  RawEntry,
  ContentBlock,
  ToolUseBlock,
  ToolCall,
  LocStats,
  TokenUsage,
  ThinkingBlock,
} from "./parsers/types.js";
import type {
  SessionAnalysis as AnalyzerInput,
  Session,
  ParsedTurn,
  ParsedFileChange,
} from "./analyzer.js";
import { analyzeSession } from "./analyzer.js";
import { parseSession, type SessionMeta } from "./parsers/index.js";
import { stripHomePath, stripHomePathsInText } from "./redact.js";

export interface BridgeOptions {
  sessionId: string;
  projectName: string;
  agentRole?: string;
  parentSessionId?: string;
}

export function bridgeToAnalyzer(
  parsed: ParserOutput,
  opts: BridgeOptions,
): AnalyzerInput {
  const cwd = parsed.cwd;
  const turns = entriesToTurns(parsed.raw_entries, cwd);
  const filesChanged = computePerFileChanges(parsed.tool_calls, parsed.loc_stats, cwd);
  const title = parsed.custom_title || extractTitle(parsed.raw_entries) || parsed.slug || "Untitled session";
  const rawLog = extractRawLog(parsed.raw_entries, cwd);

  const wallClockMinutes = parsed.wall_clock_ms > 0
    ? Math.max(1, Math.round(parsed.wall_clock_ms / 60_000))
    : undefined;

  return {
    id: opts.sessionId,
    title,
    date: parsed.start_time ?? new Date().toISOString(),
    ...(parsed.end_time ? { endTime: parsed.end_time } : {}),
    durationMinutes: parsed.duration_ms > 0
      ? Math.max(1, Math.round(parsed.duration_ms / 60_000))
      : 0,
    ...(wallClockMinutes != null ? { wallClockMinutes } : {}),
    projectName: opts.projectName,
    turns,
    filesChanged,
    locTotal: parsed.loc_stats.loc_added + parsed.loc_stats.loc_removed,
    rawLog,
    ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
    ...(opts.agentRole ? { agentRole: opts.agentRole } : {}),
    ...(opts.parentSessionId ? { parentSessionId: opts.parentSessionId } : {}),
    source: parsed.source,
    activeIntervals: parsed.active_intervals,
  };
}

/**
 * Strip AI-internal XML tags from assistant text content.
 * These tags are harness/model internals that shouldn't appear in user-facing output.
 * Returns cleaned text, or empty string if nothing remains.
 */
export function cleanAssistantText(text: string): string {
  let cleaned = text;
  // Remove all <antml_*>...</antml_*> blocks (thinking, reasoning, etc.)
  cleaned = cleaned.replace(/<antml_[a-z_]+>[\s\S]*?<\/antml_[a-z_]+>/g, "");
  // Remove <system-reminder>...</system-reminder>
  cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  // Remove <teammate-message ...>...</teammate-message>
  cleaned = cleaned.replace(/<teammate-message[^>]*>[\s\S]*?<\/teammate-message>/g, "");
  // Remove <function_calls>...</function_calls>
  cleaned = cleaned.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "");
  // Remove <fast_mode_info>...</fast_mode_info>
  cleaned = cleaned.replace(/<fast_mode_info>[\s\S]*?<\/fast_mode_info>/g, "");
  // Remove <user-prompt-submit-hook>...</user-prompt-submit-hook>
  cleaned = cleaned.replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, "");
  // Remove <environment_context>...</environment_context> (Codex injects these)
  cleaned = cleaned.replace(/<environment_context>[\s\S]*?<\/environment_context>/g, "");
  // Remove <local-command-*>...</local-command-*> tags
  cleaned = cleaned.replace(/<local-command-[a-z-]*>[\s\S]*?<\/local-command-[a-z-]*>/g, "");
  // Remove <command-name>...</command-name> and <command-message>...</command-message>
  cleaned = cleaned.replace(/<command-(?:name|message|args)>[\s\S]*?<\/command-(?:name|message|args)>/g, "");
  // Collapse excessive whitespace left behind
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === "thinking";
}

function getContentBlocks(entry: RawEntry): ContentBlock[] {
  const content = entry.message?.content;
  if (!content || typeof content === "string") return [];
  return content;
}

function entriesToTurns(entries: RawEntry[], cwd?: string): ParsedTurn[] {
  const turns: ParsedTurn[] = [];

  for (const entry of entries) {
    if (entry.type === "user") {
      const content = entry.message?.content;
      if (typeof content === "string") {
        const cleaned = cleanAssistantText(content);
        if (!cleaned) continue;
        turns.push({
          timestamp: entry.timestamp,
          type: "prompt",
          content: cleaned,
        });
      }
      // tool_result user entries are skipped — they're plumbing, not meaningful turns
    } else if (entry.type === "assistant") {
      const blocks = getContentBlocks(entry);

      for (const block of blocks) {
        if (isThinkingBlock(block)) {
          // Thinking blocks show the model's reasoning process
          const thinking = block.thinking?.trim();
          if (!thinking) continue;
          turns.push({
            timestamp: entry.timestamp,
            type: "thinking",
            content: thinking,
          });
        } else if (block.type === "text") {
          const cleaned = cleanAssistantText(block.text);
          if (!cleaned) continue;
          turns.push({
            timestamp: entry.timestamp,
            type: "response",
            content: cleaned,
          });
        } else if (isToolUseBlock(block)) {
          let toolInput = extractToolInput(block);
          if (toolInput) toolInput = stripHomePath(toolInput, cwd);
          turns.push({
            timestamp: entry.timestamp,
            type: "tool",
            content: `${block.name} ${toolInput ?? ""}`.trim(),
            toolName: block.name,
            toolInput,
          });
        }
      }
    }
  }

  return turns;
}

function extractToolInput(block: ToolUseBlock): string | undefined {
  const input = block.input;
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.command === "string") return input.command;
  if (typeof input.pattern === "string") return input.pattern;
  if (typeof input.path === "string") return input.path;
  return undefined;
}

function computePerFileChanges(toolCalls: ToolCall[], locStats?: LocStats, cwd?: string): ParsedFileChange[] {
  const files = new Map<string, { additions: number; deletions: number }>();

  // Track writes for dedup (last write wins)
  const writeLineCounts = new Map<string, number>();

  // Track accumulated Edit additions/deletions per file so a subsequent
  // Write can reset them (the Write overwrites the entire file).
  const editAdded = new Map<string, number>();
  const editRemoved = new Map<string, number>();

  for (const call of toolCalls) {
    if (call.name === "Write") {
      const filePath = call.input.file_path;
      const content = call.input.content;
      if (typeof filePath !== "string" || typeof content !== "string") continue;

      const lines = content.split("\n").length;
      const prev = writeLineCounts.get(filePath) ?? 0;
      const existing = files.get(filePath) ?? { additions: 0, deletions: 0 };

      if (writeLineCounts.has(filePath)) {
        existing.additions = existing.additions - prev + lines;
      } else {
        existing.additions += lines;
      }

      // Reset accumulated Edit stats — the Write replaces the entire file
      const prevEditAdd = editAdded.get(filePath) ?? 0;
      const prevEditRem = editRemoved.get(filePath) ?? 0;
      if (prevEditAdd > 0 || prevEditRem > 0) {
        existing.additions -= prevEditAdd;
        existing.deletions -= prevEditRem;
        editAdded.delete(filePath);
        editRemoved.delete(filePath);
      }

      writeLineCounts.set(filePath, lines);
      files.set(filePath, existing);
    } else if (call.name === "Edit") {
      const filePath = call.input.file_path;
      const oldStr = call.input.old_string;
      const newStr = call.input.new_string;
      if (typeof filePath !== "string") continue;

      const existing = files.get(filePath) ?? { additions: 0, deletions: 0 };
      const newLines = typeof newStr === "string" ? newStr.split("\n").length : 0;
      const oldLines = typeof oldStr === "string" ? oldStr.split("\n").length : 0;
      existing.additions += newLines;
      existing.deletions += oldLines;
      files.set(filePath, existing);

      editAdded.set(filePath, (editAdded.get(filePath) ?? 0) + newLines);
      editRemoved.set(filePath, (editRemoved.get(filePath) ?? 0) + oldLines);
    }
  }

  const result = [...files.entries()]
    .map(([path, stats]) => ({ path: stripHomePath(path, cwd), ...stats }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // When tool-call-based computation yields nothing, return empty.
  // The total LOC still flows through loc_stats on the parser output
  // and is stored as loc_added/loc_removed on the sessions table.
  // We don't fake per-file attribution we don't have.

  return result;
}

function extractTitle(entries: RawEntry[]): string {
  let teammateTitle: string | null = null;

  // Use the first user prompt as the title
  for (const entry of entries) {
    if (entry.type === "user") {
      const content = entry.message?.content;
      if (typeof content === "string") {
        const cleaned = cleanAssistantText(content);

        if (cleaned.length > 0) {
          return cleaned.length > 120 ? cleaned.slice(0, 117) + "..." : cleaned;
        }

        // If cleaning stripped everything (e.g. teammate messages), save inner
        // text as fallback — but keep looking for a real user prompt first
        if (!teammateTitle && content.includes("<teammate-message")) {
          const inner = content.replace(/<teammate-message[^>]*>/g, "").replace(/<\/teammate-message>/g, "");
          const trimmed = cleanAssistantText(inner).trim();
          if (trimmed.length > 0) {
            teammateTitle = trimmed.length > 120 ? trimmed.slice(0, 117) + "..." : trimmed;
          }
        }
      }
    }
  }

  return teammateTitle ?? "";
}

function extractRawLog(entries: RawEntry[], cwd?: string): string[] {
  const log: string[] = [];
  for (const entry of entries) {
    if (entry.type === "user") {
      const content = entry.message?.content;
      if (typeof content === "string") {
        const cleaned = cleanAssistantText(content);
        if (cleaned) log.push(`> ${cleaned}`);
      }
    } else if (entry.type === "assistant") {
      const blocks = getContentBlocks(entry);
      for (const block of blocks) {
        if (isThinkingBlock(block)) {
          const thinking = block.thinking?.trim();
          if (thinking) log.push(`[thinking] ${thinking.length > 200 ? thinking.slice(0, 197) + "..." : thinking}`);
        } else if (block.type === "text") {
          const cleaned = cleanAssistantText(block.text);
          if (!cleaned) continue;
          log.push(stripHomePathsInText(cleaned, cwd));
        } else if (isToolUseBlock(block)) {
          let input = extractToolInput(block);
          if (input) input = stripHomePath(input, cwd);
          log.push(`[${block.name}] ${input ?? ""}`);
        }
      }
    }
  }
  return log;
}

/**
 * Canonical dedup key for child agents. Buckets by role and 30-second
 * time window so worktree clones collapse into one entry.
 *
 * NOTE: server.ts ~line 1057 has a similar dedup pattern but uses
 * `c.agentRole ?? c.sessionId` for the key while storing `c.agentRole ?? 'agent'`
 * for display — this inconsistency means two children without agentRole get
 * separate keys (different UUIDs) but identical display roles ('agent').
 * Use this helper in both places to keep behavior consistent.
 */
export function childDedupeKey(agentRole: string | undefined, startTime: string): string {
  const role = agentRole ?? 'agent';
  const bucket = Math.floor(new Date(startTime).getTime() / 30_000);
  return `${role}::${bucket}`;
}

/**
 * Deduplicate worktree clones: agents with same role and start time within
 * 30 seconds are considered duplicates. Keep the one with more turns.
 */
export function deduplicateChildren(children: Session[]): Session[] {
  const seen = new Map<string, Session>();
  for (const child of children) {
    const key = childDedupeKey(child.agentRole, child.date);
    const existing = seen.get(key);
    if (!existing || child.turns > existing.turns) {
      seen.set(key, child);
    }
  }
  return [...seen.values()];
}

/** Parse, bridge, and analyze each child session. Attaches results to parent. */
export async function bridgeChildSessions(
  parentMeta: SessionMeta,
  projectName: string,
): Promise<Session[]> {
  if (!parentMeta.children || parentMeta.children.length === 0) return [];

  const results: Session[] = [];
  for (const child of parentMeta.children) {
    try {
      const parsed = await parseSession(child.path);
      const input = bridgeToAnalyzer(parsed, {
        sessionId: child.sessionId,
        projectName,
        agentRole: parsed.agent_role ?? child.agentRole,
        parentSessionId: parentMeta.sessionId,
      });
      results.push(analyzeSession(input));
    } catch {
      // Skip children that fail to parse
    }
  }
  return deduplicateChildren(results);
}

/** Canonical type for child/agent data — used everywhere. */
export interface AgentChild {
  sessionId: string;
  role: string;
  durationMinutes: number;
  linesOfCode: number;
  date?: string;
}


/** Convert a fully-parsed Session into the canonical AgentChild shape. */
export function toAgentChild(session: Session): AgentChild {
  return {
    sessionId: session.id,
    role: session.agentRole ?? 'agent',
    durationMinutes: session.durationMinutes,
    linesOfCode: session.linesOfCode,
    date: session.date,
  };
}

/**
 * Merge overlapping time intervals into non-overlapping union.
 * Used to compute true human hours across concurrent sessions.
 * Each interval is [startMs, endMs]. Returns merged intervals sorted by start.
 */
export function mergeActiveIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

/** Sum total milliseconds from a list of non-overlapping intervals. */
export function sumIntervalMs(intervals: [number, number][]): number {
  return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
}

/** Compute aggregated stats from fully-parsed child sessions. */
export function aggregateChildStats(children: Session[]): {
  totalLoc: number;
  totalDurationMinutes: number;
  agentCount: number;
} {
  return {
    totalLoc: children.reduce((sum, c) => sum + c.linesOfCode, 0),
    totalDurationMinutes: children.reduce((sum, c) => sum + c.durationMinutes, 0),
    agentCount: children.length,
  };
}
