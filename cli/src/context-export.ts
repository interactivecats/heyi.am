// Context Export — compresses a Session into AI-consumable Markdown
// Three tiers: compact (~500 tokens), summary (~2000 tokens), full (~10000+ tokens)

import type { Session, ExecutionStep, FileChange, ParsedTurn } from "./analyzer.js";
import { cleanAssistantText } from "./bridge.js";
import { SOURCE_DISPLAY_NAMES, type SessionSource } from "./parsers/types.js";

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

/** Format LOC as human-readable (e.g. "2.4k"). */
function formatLoc(loc: number): string {
  if (loc >= 1000) return `${(loc / 1000).toFixed(1)}k`;
  return String(loc);
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
  lines.push(`Duration: ${stats.join(" | ")}`);

  if (session.skills.length > 0) {
    lines.push(`Skills: ${session.skills.join(", ")}`);
  }

  return lines.join("\n");
}

// ── Context block ──────────────────────────────────────────────

function renderContext(session: Session): string {
  if (!session.context) return "";
  return `\n## Context\n${session.context}`;
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

function renderFilesChanged(files: FileChange[]): string {
  if (files.length === 0) return "";
  const lines = files.map(
    (f) => `${f.path} (+${f.additions}, -${f.deletions})`
  );
  return `\n## Files Changed\n${lines.join("\n")}`;
}

// ── Key exchanges (summary tier) ───────────────────────────────

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
    const text = truncate(turn.content, 300);
    return `[User]: ${text}`;
  }
  if (turn.type === "response") {
    const text = truncate(turn.content, 300);
    return `[Assistant]: ${text}`;
  }
  if (turn.type === "error") {
    return `[Error]: ${truncate(turn.content, 200)}`;
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

function renderCompact(session: Session): string {
  const parts: string[] = [
    renderMetadata(session),
    renderContext(session),
    renderExecutionPath(session.executionPath),
  ];
  return parts.filter(Boolean).join("\n");
}

function renderSummary(session: Session, turns: ParsedTurn[]): string {
  const keyExchanges = turns
    .map((turn, i) => ({ turn, i }))
    .filter(({ turn, i }) => isKeyExchange(turn, i, turns))
    .map(({ turn }) => formatTurnForExchange(turn));

  const parts: string[] = [
    renderMetadata(session),
    renderContext(session),
    renderExecutionPath(session.executionPath),
  ];

  if (keyExchanges.length > 0) {
    parts.push(`\n## Key Exchanges\n${keyExchanges.join("\n")}`);
  }

  parts.push(renderFilesChanged(session.filesChanged));

  return parts.filter(Boolean).join("\n");
}

function renderFull(session: Session, turns: ParsedTurn[]): string {
  const allTurns = turns
    .map((turn) => formatTurnFull(turn))
    .filter(Boolean);

  const parts: string[] = [
    renderMetadata(session),
    renderContext(session),
    renderExecutionPath(session.executionPath),
  ];

  if (allTurns.length > 0) {
    parts.push(`\n## Conversation\n${allTurns.join("\n")}`);
  }

  parts.push(renderFilesChanged(session.filesChanged));

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
