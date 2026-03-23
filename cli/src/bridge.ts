// Bridge — converts parser output (SessionAnalysis from parsers/types.ts)
// into the analyzer's input format (SessionAnalysis from analyzer.ts)

import type {
  SessionAnalysis as ParserOutput,
  RawEntry,
  ContentBlock,
  ToolUseBlock,
  ToolCall,
  LocStats,
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
  const title = extractTitle(parsed.raw_entries);
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
    rawLog,
    ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
    ...(opts.agentRole ? { agentRole: opts.agentRole } : {}),
    ...(opts.parentSessionId ? { parentSessionId: opts.parentSessionId } : {}),
    source: parsed.source,
  };
}

/**
 * Strip AI-internal XML tags from assistant text content.
 * These tags are model internals that shouldn't appear in user-facing output:
 *   - <antml_thinking>...</antml_thinking> (chain-of-thought)
 *   - <system-reminder>...</system-reminder> (injected context)
 *   - <antml_*>...</antml_*> (any other antml-prefixed tags)
 * Returns cleaned text, or empty string if nothing remains.
 */
export function cleanAssistantText(text: string): string {
  // Remove all <antml_*>...</antml_*> blocks (thinking, reasoning, etc.)
  let cleaned = text.replace(/<antml_[a-z_]+>[\s\S]*?<\/antml_[a-z_]+>/g, "");
  // Remove all <system-reminder>...</system-reminder> blocks
  cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  // Collapse excessive whitespace left behind
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
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
        turns.push({
          timestamp: entry.timestamp,
          type: "prompt",
          content,
        });
      }
      // tool_result user entries are skipped — they're plumbing, not meaningful turns
    } else if (entry.type === "assistant") {
      const blocks = getContentBlocks(entry);

      for (const block of blocks) {
        if (block.type === "text") {
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

      writeLineCounts.set(filePath, lines);
      files.set(filePath, existing);
    } else if (call.name === "Edit") {
      const filePath = call.input.file_path;
      const oldStr = call.input.old_string;
      const newStr = call.input.new_string;
      if (typeof filePath !== "string") continue;

      const existing = files.get(filePath) ?? { additions: 0, deletions: 0 };
      existing.additions += typeof newStr === "string" ? newStr.split("\n").length : 0;
      existing.deletions += typeof oldStr === "string" ? oldStr.split("\n").length : 0;
      files.set(filePath, existing);
    }
  }

  const result = [...files.entries()]
    .map(([path, stats]) => ({ path: stripHomePath(path, cwd), ...stats }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // When tool-call-based computation yields nothing, fall back to
  // the parser's loc_stats (which may have data from workspace metadata
  // or other source-specific mechanisms).
  if (result.length === 0 && locStats && (locStats.loc_added > 0 || locStats.loc_removed > 0)) {
    // Use per-file data from loc_stats if available
    if (locStats.files_changed.length > 0) {
      const perFile = Math.ceil(locStats.loc_added / locStats.files_changed.length);
      const perFileDel = Math.ceil(locStats.loc_removed / locStats.files_changed.length);
      return locStats.files_changed.map((path) => ({
        path: stripHomePath(path, cwd),
        additions: perFile,
        deletions: perFileDel,
      }));
    }
    // No per-file paths available — return empty array.
    // Aggregate LOC data still flows through loc_stats on the parser output.
    return [];
  }

  return result;
}

function extractTitle(entries: RawEntry[]): string {
  // Use the first user prompt as the title
  for (const entry of entries) {
    if (entry.type === "user") {
      const content = entry.message?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        const title = content.trim();
        return title.length > 120 ? title.slice(0, 117) + "..." : title;
      }
    }
  }
  return "Untitled session";
}

function extractRawLog(entries: RawEntry[], cwd?: string): string[] {
  const log: string[] = [];
  for (const entry of entries) {
    if (entry.type === "user") {
      const content = entry.message?.content;
      if (typeof content === "string") {
        log.push(`> ${content}`);
      }
    } else if (entry.type === "assistant") {
      const blocks = getContentBlocks(entry);
      for (const block of blocks) {
        if (block.type === "text") {
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

/** @deprecated Use AgentChild instead */
export type ChildSessionSummary = AgentChild;

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
