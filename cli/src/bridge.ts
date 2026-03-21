// Bridge — converts parser output (SessionAnalysis from parsers/types.ts)
// into the analyzer's input format (SessionAnalysis from analyzer.ts)

import type {
  SessionAnalysis as ParserOutput,
  RawEntry,
  ContentBlock,
  ToolUseBlock,
  ToolCall,
} from "./parsers/types.js";
import type {
  SessionAnalysis as AnalyzerInput,
  Session,
  ParsedTurn,
  ParsedFileChange,
} from "./analyzer.js";
import { analyzeSession } from "./analyzer.js";
import { parseSession, type SessionMeta } from "./parsers/index.js";

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
  const turns = entriesToTurns(parsed.raw_entries);
  const filesChanged = computePerFileChanges(parsed.tool_calls);
  const title = extractTitle(parsed.raw_entries);
  const rawLog = extractRawLog(parsed.raw_entries);

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
    ...(opts.agentRole ? { agentRole: opts.agentRole } : {}),
    ...(opts.parentSessionId ? { parentSessionId: opts.parentSessionId } : {}),
  };
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function getContentBlocks(entry: RawEntry): ContentBlock[] {
  const content = entry.message?.content;
  if (!content || typeof content === "string") return [];
  return content;
}

function entriesToTurns(entries: RawEntry[]): ParsedTurn[] {
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
          turns.push({
            timestamp: entry.timestamp,
            type: "response",
            content: block.text,
          });
        } else if (isToolUseBlock(block)) {
          const toolInput = extractToolInput(block);
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

function computePerFileChanges(toolCalls: ToolCall[]): ParsedFileChange[] {
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

  return [...files.entries()]
    .map(([path, stats]) => ({ path, ...stats }))
    .sort((a, b) => a.path.localeCompare(b.path));
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

function extractRawLog(entries: RawEntry[]): string[] {
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
          log.push(block.text);
        } else if (isToolUseBlock(block)) {
          log.push(`[${block.name}] ${extractToolInput(block) ?? ""}`);
        }
      }
    }
  }
  return log;
}

/**
 * Deduplicate worktree clones: agents with same role and start time within
 * 30 seconds are considered duplicates. Keep the one with more turns.
 */
export function deduplicateChildren(children: Session[]): Session[] {
  const seen = new Map<string, Session>();
  for (const child of children) {
    const startBucket = Math.floor(new Date(child.date).getTime() / 30_000);
    const key = `${child.agentRole ?? 'agent'}::${startBucket}`;
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

/** Lightweight child summary for list endpoints — no full parse needed. */
export interface ChildSessionSummary {
  sessionId: string;
  role?: string;
  title?: string;
  durationMinutes?: number;
  linesOfCode?: number;
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
