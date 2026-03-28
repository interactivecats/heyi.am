// Context Export — compresses a Session into AI-consumable Markdown
// Three tiers: compact (~500 tokens), summary (~2000 tokens), full (~10000+ tokens)
//
// When enhanced data is present (LLM-generated title, context, developer take,
// execution steps, Q&A), those fields are already merged into the Session object
// by the route layer. This module renders whatever is on the Session — enhanced
// or heuristic — into clean markdown.

import type { Session, ExecutionStep, FileChange, ParsedTurn } from "./analyzer.js";
import { cleanAssistantText } from "./bridge.js";
import { SOURCE_DISPLAY_NAMES, type SessionSource } from "./parsers/types.js";
import { formatLoc } from './format-utils.js';

export type ExportTier = "compact" | "summary" | "full";

export interface ExportOptions {
  tier?: ExportTier;
}

export interface ExportResult {
  content: string;
  tokens: number;
  tier: ExportTier;
}

/** Estimate token count from character length (rough ~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Format a date string as "Mar 22, 2026". */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Get display name for a source tool. */
function sourceName(source?: string): string {
  if (!source) return "Unknown";
  return SOURCE_DISPLAY_NAMES[source as SessionSource] ?? source;
}

// ── Metadata header (shared across all tiers) ──────────────────

function renderMetadata(session: Session): string {
  const lines: string[] = [];
  lines.push(`# Session: ${session.title}`);
  lines.push(
    `Project: ${session.projectName} | Source: ${sourceName(session.source)} | Date: ${formatDate(session.date)}`
  );

  const stats: string[] = [];
  if (session.durationMinutes > 0) stats.push(`${session.durationMinutes}m`);
  stats.push(`${session.turns} turns`);
  if (session.filesChanged.length > 0) stats.push(`${session.filesChanged.length} files`);
  if (session.linesOfCode > 0) stats.push(`${formatLoc(session.linesOfCode)} LOC`);
  if (session.toolCalls > 0) stats.push(`${session.toolCalls} tool calls`);
  lines.push(`Duration: ${stats.join(" | ")}`);

  if (session.skills.length > 0) {
    lines.push(`Skills: ${session.skills.join(", ")}`);
  }

  if (session.toolBreakdown.length > 0) {
    const top = session.toolBreakdown.slice(0, 6);
    lines.push(`Tools: ${top.map((t) => `${t.tool}(${t.count})`).join(", ")}`);
  }

  return lines.join("\n");
}

// ── Context block ──────────────────────────────────────────────

function renderContext(session: Session): string {
  if (!session.context) return "";
  return `\n## Context\n${session.context}`;
}

// ── Developer take ────────────────────────────────────────────

function renderDeveloperTake(session: Session): string {
  if (!session.developerTake) return "";
  return `\n## Developer Take\n${session.developerTake}`;
}

// ── Q&A pairs ─────────────────────────────────────────────────

function renderQAPairs(session: Session): string {
  if (!session.qaPairs || session.qaPairs.length === 0) return "";
  const lines = session.qaPairs.map(
    (qa) => `**Q:** ${qa.question}\n**A:** ${qa.answer}`
  );
  return `\n## Q&A\n${lines.join("\n\n")}`;
}

// ── Session signals (heuristic) ───────────────────────────────

const CORRECTION_PATTERN = /\b(no[,.]?\s|actually|wait|wrong|instead|not that|don'?t)\b/i;

export function extractSessionSignals(turns: ParsedTurn[]): {
  errors: number;
  corrections: number;
  effortBreakdown: Record<string, number>;
  firstPrompt: string;
} {
  let errors = 0;
  let corrections = 0;
  const effortCounts: Record<string, number> = {};
  let firstPrompt = "";

  for (const turn of turns) {
    if (turn.type === "error") errors++;

    if (turn.type === "prompt") {
      if (!firstPrompt) firstPrompt = turn.content;
      if (CORRECTION_PATTERN.test(turn.content)) corrections++;
    }

    if (turn.type === "tool" && turn.toolName) {
      const category = classifyToolEffort(turn.toolName);
      effortCounts[category] = (effortCounts[category] ?? 0) + 1;
    }
  }

  // Convert counts to percentages
  const total = Object.values(effortCounts).reduce((a, b) => a + b, 0);
  const effortBreakdown: Record<string, number> = {};
  if (total > 0) {
    for (const [cat, count] of Object.entries(effortCounts)) {
      effortBreakdown[cat] = Math.round((count / total) * 100);
    }
  }

  return { errors, corrections, effortBreakdown, firstPrompt };
}

function classifyToolEffort(toolName: string): string {
  if (toolName === "Read" || toolName === "Grep" || toolName === "Glob") return "reading";
  if (toolName === "Edit" || toolName === "Write") return "writing";
  if (toolName === "Bash") return "running";
  if (toolName === "Agent") return "delegating";
  return "other";
}

function renderSessionSignals(turns: ParsedTurn[]): string {
  const signals = extractSessionSignals(turns);
  const lines: string[] = [];

  // Effort breakdown
  const efforts = Object.entries(signals.effortBreakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, pct]) => `${pct}% ${cat}`);
  if (efforts.length > 0) {
    lines.push(`Effort: ${efforts.join(", ")}`);
  }

  if (signals.errors > 0) {
    lines.push(`Errors encountered: ${signals.errors}`);
  }
  if (signals.corrections > 0) {
    lines.push(`Course corrections: ${signals.corrections}`);
  }

  if (lines.length === 0) return "";
  return `\n## Session Signals\n${lines.join("\n")}`;
}

// ── Heuristic context from first prompt ───────────────────────

function renderHeuristicContext(session: Session, turns: ParsedTurn[]): string {
  // If enhanced context exists, use that
  if (session.context) return renderContext(session);

  // Fall back: derive from first user prompt
  const signals = extractSessionSignals(turns);
  if (!signals.firstPrompt) return "";

  const cleaned = truncate(signals.firstPrompt, 300);
  return `\n## Context\n${cleaned}`;
}

// ── Execution path ─────────────────────────────────────────────

function renderExecutionPath(steps: ExecutionStep[]): string {
  if (steps.length === 0) return "";
  const lines = steps.map(
    (s) => `${s.stepNumber}. ${s.title} — ${s.description}`
  );
  return `\n## Execution Path\n${lines.join("\n")}`;
}

// ── Files changed ──────────────────────────────────────────────

const MAX_FILES_SHOWN = 15;

function renderFilesChanged(files: FileChange[]): string {
  if (files.length === 0) return "";
  // Sort by total churn, show top files
  const sorted = [...files].sort(
    (a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)
  );
  const shown = sorted.slice(0, MAX_FILES_SHOWN);
  const lines = shown.map(
    (f) => `${f.path} (+${f.additions}, -${f.deletions})`
  );
  if (files.length > MAX_FILES_SHOWN) {
    lines.push(`... and ${files.length - MAX_FILES_SHOWN} more files`);
  }
  return `\n## Files Changed\n${lines.join("\n")}`;
}

// ── Key exchanges (summary tier) ───────────────────────────────

/** Max key exchanges to include in summary tier. */
const MAX_KEY_EXCHANGES = 20;

/** Determine if a turn is a "key exchange" worth including in summary. */
function isKeyExchange(turn: ParsedTurn, index: number, turns: ParsedTurn[]): boolean {
  // Always exclude thinking blocks
  if (turn.type === "thinking") return false;

  // Include user prompts (questions/directives)
  if (turn.type === "prompt") return true;

  // Include error outputs
  if (turn.type === "error") return true;

  // Include assistant responses that precede tool use (plans)
  if (turn.type === "response") {
    const next = turns[index + 1];
    if (next && next.type === "tool") return true;
    // Include if it's the last response (conclusion)
    const remaining = turns.slice(index + 1);
    if (remaining.every((t) => t.type !== "response")) return true;
    return false;
  }

  // For tool turns: include edits/writes, errors in output
  if (turn.type === "tool") {
    if (turn.toolName === "Edit" || turn.toolName === "Write") return true;
    if (turn.toolOutput && turn.toolOutput.toLowerCase().includes("error")) return true;
    return false;
  }

  return false;
}

/** Format a turn for the key exchanges section. */
function formatTurnForExchange(turn: ParsedTurn): string {
  if (turn.type === "prompt") {
    const text = truncate(turn.content, 150);
    return `[User]: ${text}`;
  }
  if (turn.type === "response") {
    const text = truncate(turn.content, 150);
    return `[Assistant]: ${text}`;
  }
  if (turn.type === "error") {
    return `[Error]: ${truncate(turn.content, 150)}`;
  }
  if (turn.type === "tool") {
    return formatToolTurn(turn);
  }
  return `[${turn.type}]: ${truncate(turn.content, 200)}`;
}

/** Format a tool turn, summarizing large outputs. */
function formatToolTurn(turn: ParsedTurn): string {
  const name = turn.toolName ?? "Tool";

  if (name === "Read") {
    return `[Tool:Read]: ${turn.toolInput ?? "unknown file"}`;
  }
  if (name === "Edit") {
    const path = turn.toolInput ?? "unknown file";
    return `[Tool:Edit]: ${path}`;
  }
  if (name === "Write") {
    const path = turn.toolInput ?? "unknown file";
    return `[Tool:Write]: ${path}`;
  }
  if (name === "Bash") {
    const cmd = turn.toolInput ?? turn.content;
    return `[Tool:Bash]: ${truncate(cmd, 150)}`;
  }
  if (name === "Grep" || name === "Glob") {
    return `[Tool:${name}]: ${turn.toolInput ?? ""}`;
  }
  return `[Tool:${name}]: ${truncate(turn.toolInput ?? turn.content, 150)}`;
}

/** Format a turn for the full tier (includes tool output). */
function formatTurnFull(turn: ParsedTurn): string {
  if (turn.type === "thinking") return "";

  if (turn.type === "tool") {
    const base = formatToolTurn(turn);
    if (turn.toolOutput) {
      // Summarize large tool outputs
      if (turn.toolOutput.length > 500) {
        const preview = turn.toolOutput.slice(0, 200).trim();
        return `${base}\n  → [${turn.toolOutput.length} chars] ${preview}...`;
      }
      return `${base}\n  → ${turn.toolOutput}`;
    }
    return base;
  }

  return formatTurnForExchange(turn);
}

function truncate(text: string, maxLen: number): string {
  const cleaned = text.replace(/\n+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + "...";
}

// ── Tier renderers ─────────────────────────────────────────────

export function renderCompact(session: Session): string {
  const parts: string[] = [
    renderMetadata(session),
    renderHeuristicContext(session, []),
    renderDeveloperTake(session),
    renderExecutionPath(session.executionPath),
  ];
  return parts.filter(Boolean).join("\n");
}

function renderSummary(session: Session, turns: ParsedTurn[]): string {
  const allExchanges = turns
    .map((turn, i) => ({ turn, i }))
    .filter(({ turn, i }) => isKeyExchange(turn, i, turns))
    .map(({ turn }) => formatTurnForExchange(turn));

  // Cap key exchanges — keep first few + last few for context
  let keyExchanges: string[];
  if (allExchanges.length > MAX_KEY_EXCHANGES) {
    const half = Math.floor(MAX_KEY_EXCHANGES / 2);
    const head = allExchanges.slice(0, half);
    const tail = allExchanges.slice(-half);
    const skipped = allExchanges.length - MAX_KEY_EXCHANGES;
    keyExchanges = [...head, `[... ${skipped} exchanges omitted ...]`, ...tail];
  } else {
    keyExchanges = allExchanges;
  }

  const parts: string[] = [
    renderMetadata(session),
    renderHeuristicContext(session, turns),
    renderDeveloperTake(session),
    renderExecutionPath(session.executionPath),
    renderSessionSignals(turns),
  ];

  if (keyExchanges.length > 0) {
    parts.push(`\n## Key Exchanges\n${keyExchanges.join("\n")}`);
  }

  parts.push(renderFilesChanged(session.filesChanged));
  parts.push(renderQAPairs(session));

  return parts.filter(Boolean).join("\n");
}

function renderFull(session: Session, turns: ParsedTurn[]): string {
  const allTurns = turns
    .map((turn) => formatTurnFull(turn))
    .filter(Boolean);

  const parts: string[] = [
    renderMetadata(session),
    renderHeuristicContext(session, turns),
    renderDeveloperTake(session),
    renderExecutionPath(session.executionPath),
    renderSessionSignals(turns),
  ];

  if (allTurns.length > 0) {
    parts.push(`\n## Conversation\n${allTurns.join("\n")}`);
  }

  parts.push(renderFilesChanged(session.filesChanged));
  parts.push(renderQAPairs(session));

  return parts.filter(Boolean).join("\n");
}

// ── Main export function ───────────────────────────────────────

/**
 * Export a session as compressed Markdown for AI context consumption.
 *
 * @param session - A fully loaded Session object from the analyzer
 * @param turns - The ParsedTurn[] from the analyzer input (needed for full content)
 * @param options - Export options (tier selection)
 * @returns ExportResult with content string, estimated token count, and tier used
 */
export function exportSessionContext(
  session: Session,
  turns: ParsedTurn[],
  options: ExportOptions = {},
): ExportResult {
  const tier = options.tier ?? "summary";

  let content: string;
  switch (tier) {
    case "compact":
      content = renderCompact(session);
      break;
    case "full":
      content = renderFull(session, turns);
      break;
    case "summary":
    default:
      content = renderSummary(session, turns);
      break;
  }

  return {
    content,
    tokens: estimateTokens(content),
    tier,
  };
}
