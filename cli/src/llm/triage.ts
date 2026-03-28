import fs from 'node:fs';
import readline from 'node:readline';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '../settings.js';

// ── Signal extraction (Layer 2) ──────────────────────────────────

const CORRECTION_WORDS = /\b(no|wrong|not that|actually|stop|undo|revert|don't|incorrect)\b/i;
const ARCH_KEYWORDS = /\b(design|approach|trade-?off|instead|because|architecture|strategy|decision|chose|alternative)\b/i;
const ERROR_WORDS = /\b(error|failed|failure|exception|crash|bug|broken|fix)\b/i;

export interface SessionSignals {
  correctionCount: number;
  avgUserExplanationLength: number;
  errorRetryCount: number;
  userToAiRatio: number;
  toolDiversity: number;
  multiDirScope: number;
  architecturalKeywords: number;
}

/**
 * Extract cheap signals from a session's raw JSONL file or parsed entries.
 * For file paths, streams the JSONL. For non-file paths (cursor://, etc.),
 * parses the session first to get entries, then extracts signals from those.
 */
export async function extractSignals(sessionPath: string): Promise<SessionSignals> {
  // Non-file paths: parse through the parser to get entries, then extract
  if (sessionPath.includes('://')) {
    const { parseSession } = await import('../parsers/index.js');
    const parsed = await parseSession(sessionPath);
    return extractSignalsFromEntries(parsed.raw_entries);
  }

  // File paths: stream JSONL line by line (efficient for large files)
  const entries: Array<{ type: string; message?: { role?: string; content?: unknown } }> = [];
  const stream = fs.createReadStream(sessionPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  return extractSignalsFromEntries(entries);
}

/** Core signal extraction that works on any array of entries. */
function extractSignalsFromEntries(
  entries: Array<{ type: string; message?: { role?: string; content?: unknown } }>,
): SessionSignals {
  const signals: SessionSignals = {
    correctionCount: 0,
    avgUserExplanationLength: 0,
    errorRetryCount: 0,
    userToAiRatio: 0,
    toolDiversity: 0,
    multiDirScope: 0,
    architecturalKeywords: 0,
  };

  let userTurnCount = 0;
  let totalTurns = 0;
  let totalUserWords = 0;
  const tools = new Set<string>();
  const topDirs = new Set<string>();

  for (const entry of entries) {
    totalTurns++;

    if (entry.type === 'user' && (entry.message?.role === 'human' || entry.message?.role === 'user')) {
      userTurnCount++;
      const text = extractText(entry.message?.content);
      const words = text.split(/\s+/).filter(Boolean);
      totalUserWords += words.length;

      if (CORRECTION_WORDS.test(text)) signals.correctionCount++;
      const archMatches = text.match(new RegExp(ARCH_KEYWORDS.source, 'gi'));
      if (archMatches) signals.architecturalKeywords += archMatches.length;
    }

    if (entry.type === 'tool_result' || entry.type === 'tool_use') {
      const text = extractText(entry.message?.content);
      if (ERROR_WORDS.test(text)) signals.errorRetryCount++;
    }

    // Track tool diversity
    if (entry.message?.content && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content as Array<{ type?: string; name?: string; input?: Record<string, unknown> }>) {
        if (block.type === 'tool_use' && block.name) {
          tools.add(block.name);
        }
        if (block.type === 'tool_use' && block.input?.file_path) {
          const topDir = String(block.input.file_path).split('/').filter(Boolean)[0];
          if (topDir) topDirs.add(topDir);
        }
      }
    }
  }

  signals.avgUserExplanationLength = userTurnCount > 0 ? totalUserWords / userTurnCount : 0;
  signals.userToAiRatio = totalTurns > 0 ? userTurnCount / totalTurns : 0;
  signals.toolDiversity = tools.size;
  signals.multiDirScope = topDirs.size;

  return signals;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join(' ');
  }
  return '';
}

// ── Triage types ─────────────────────────────────────────────────

export interface SessionMetaWithStats {
  sessionId: string;
  path: string;
  title: string;
  duration: number;
  loc: number;
  turns: number;
  files: number;
  skills: string[];
  date: string;
}

export interface TriageResult {
  selected: Array<{ sessionId: string; reason: string }>;
  skipped: Array<{ sessionId: string; reason: string }>;
  triageMethod: 'llm' | 'scoring' | 'auto-select';
  autoSelected?: boolean;
}

// ── Hard floor (Layer 1) ─────────────────────────────────────────

const MIN_DURATION = 5;  // minutes
const MIN_TURNS = 3;
const MAX_SELECTED = 10; // cap featured sessions for a focused portfolio

function passesHardFloor(s: SessionMetaWithStats): boolean {
  return s.duration >= MIN_DURATION && s.turns >= MIN_TURNS;
}

// ── Scoring fallback (no LLM) ────────────────────────────────────

function scoreSession(s: SessionMetaWithStats, signals: SessionSignals): number {
  return (
    signals.correctionCount * 3 +
    Math.min(signals.avgUserExplanationLength / 10, 5) * 2 +
    signals.toolDiversity * 2 +
    signals.multiDirScope +
    signals.architecturalKeywords * 2 +
    Math.min(s.duration / 10, 5) +  // bonus for longer sessions
    Math.min(s.loc / 100, 5)        // bonus for more LOC
  );
}

// ── LLM triage (Layer 3) ─────────────────────────────────────────

const TRIAGE_PROMPT = `You are selecting which coding sessions are worth showcasing in a developer portfolio.

Given a list of sessions with their metadata and behavioral signals, decide which ones tell an interesting story about the developer's skills and decision-making.

Select sessions that show:
- Interesting technical decisions (high correction count = dev pushed back on AI)
- Complex problem solving (high tool diversity, multi-directory scope)
- Architectural thinking (architectural keywords in conversations)
- Substantial work (meaningful LOC and duration)

Skip sessions that are:
- Too small or mechanical (config changes, dependency updates)
- Repetitive of already-selected sessions
- Pure boilerplate generation

Select at most 10 sessions. A focused portfolio is better than an exhaustive one. Pick the strongest 6-10.

Return JSON with this exact structure:
{
  "selected": [{ "sessionId": "...", "reason": "Brief explanation of why this is interesting" }],
  "skipped": [{ "sessionId": "...", "reason": "Brief explanation of why skipped" }]
}

Every session in the input must appear in either selected or skipped.`;

async function llmTriage(
  sessions: Array<SessionMetaWithStats & { signals: SessionSignals }>,
): Promise<TriageResult | null> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const input = sessions.map((s) => ({
    sessionId: s.sessionId,
    title: s.title,
    duration: s.duration,
    loc: s.loc,
    turns: s.turns,
    files: s.files,
    skills: s.skills,
    signals: s.signals,
  }));

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 40000,
      system: TRIAGE_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify(input),
      }],
    });

    // If the model hit the token limit, the JSON is likely truncated
    if (response.stop_reason !== 'end_turn') return null;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as TriageResult;

    // Validate structure
    if (!Array.isArray(parsed.selected) || !Array.isArray(parsed.skipped)) return null;

    return parsed;
  } catch (err) {
    console.error('[triage] LLM triage failed, falling back to scoring:', (err as Error).message);
    return null;
  }
}

// ── Progress events ──────────────────────────────────────────────

export type TriageProgressEvent =
  | { type: 'scanning'; total: number }
  | { type: 'hard_floor'; sessionId: string; title: string; passed: boolean; reason?: string }
  | { type: 'extracting_signals'; sessionId: string; title: string }
  | { type: 'signals_done'; sessionId: string; signals: SessionSignals }
  | { type: 'llm_ranking'; sessionCount: number }
  | { type: 'scoring_fallback'; sessionCount: number }
  | { type: 'done'; selected: number; skipped: number };

// ── Main triage function ─────────────────────────────────────────

export async function triageSessions(
  sessions: SessionMetaWithStats[],
  useLLM: boolean = true,
  onProgress?: (event: TriageProgressEvent) => void,
): Promise<TriageResult> {
  onProgress?.({ type: 'scanning', total: sessions.length });

  // Layer 1: Hard floor
  const passed: SessionMetaWithStats[] = [];
  const hardSkipped: Array<{ sessionId: string; reason: string }> = [];

  for (const s of sessions) {
    if (passesHardFloor(s)) {
      passed.push(s);
      onProgress?.({ type: 'hard_floor', sessionId: s.sessionId, title: s.title, passed: true });
    } else {
      const reasons: string[] = [];
      if (s.duration < MIN_DURATION) reasons.push('Too short');
      if (s.turns < MIN_TURNS) reasons.push('Too few turns');
      const reason = reasons.join(', ');
      hardSkipped.push({ sessionId: s.sessionId, reason });
      onProgress?.({ type: 'hard_floor', sessionId: s.sessionId, title: s.title, passed: false, reason });
    }
  }

  // Small project optimization: if fewer than 5 sessions pass hard floor, auto-select all
  const AUTO_SELECT_THRESHOLD = 5;
  if (passed.length < AUTO_SELECT_THRESHOLD) {
    const result: TriageResult = {
      selected: passed.map((s) => ({ sessionId: s.sessionId, reason: 'Auto-selected (small project)' })),
      skipped: hardSkipped,
      triageMethod: 'auto-select',
      autoSelected: true,
    };
    onProgress?.({ type: 'done', selected: result.selected.length, skipped: result.skipped.length });
    return result;
  }

  // Layer 2: Signal extraction (sequential for progress reporting)
  const sessionsWithSignals: Array<SessionMetaWithStats & { signals: SessionSignals }> = [];
  for (const s of passed) {
    onProgress?.({ type: 'extracting_signals', sessionId: s.sessionId, title: s.title });
    const signals = await extractSignals(s.path);
    onProgress?.({ type: 'signals_done', sessionId: s.sessionId, signals });
    sessionsWithSignals.push({ ...s, signals });
  }

  // Layer 3: LLM ranking or fallback scoring
  if (useLLM) {
    onProgress?.({ type: 'llm_ranking', sessionCount: sessionsWithSignals.length });
    const llmResult = await llmTriage(sessionsWithSignals);
    if (llmResult) {
      // Enforce cap even if LLM returns too many
      const capped = llmResult.selected.slice(0, MAX_SELECTED);
      const overflow = llmResult.selected.slice(MAX_SELECTED).map((s) => ({
        ...s,
        reason: 'Over selection cap',
      }));
      const result: TriageResult = {
        selected: capped,
        skipped: [...overflow, ...llmResult.skipped, ...hardSkipped],
        triageMethod: 'llm',
      };
      onProgress?.({ type: 'done', selected: result.selected.length, skipped: result.skipped.length });
      return result;
    }
    // LLM failed, fall through to scoring
    onProgress?.({ type: 'scoring_fallback', sessionCount: sessionsWithSignals.length });
  } else {
    onProgress?.({ type: 'scoring_fallback', sessionCount: sessionsWithSignals.length });
  }

  // Fallback: score-based selection
  const scored = sessionsWithSignals.map((s) => ({
    ...s,
    score: scoreSession(s, s.signals),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Select top sessions (at least 1, at most MAX_SELECTED)
  const selectCount = Math.max(1, Math.min(
    Math.ceil(scored.length * 0.6),
    MAX_SELECTED,
  ));

  const selected = scored.slice(0, selectCount).map((s) => ({
    sessionId: s.sessionId,
    reason: buildScoreReason(s.signals),
  }));

  const skipped = [
    ...scored.slice(selectCount).map((s) => ({
      sessionId: s.sessionId,
      reason: 'Lower signal score',
    })),
    ...hardSkipped,
  ];

  const result: TriageResult = { selected, skipped, triageMethod: 'scoring' };
  onProgress?.({ type: 'done', selected: result.selected.length, skipped: result.skipped.length });
  return result;
}

function buildScoreReason(signals: SessionSignals): string {
  const parts: string[] = [];
  if (signals.correctionCount > 0) parts.push(`${signals.correctionCount} corrections`);
  if (signals.architecturalKeywords > 2) parts.push('architectural decisions');
  if (signals.toolDiversity > 5) parts.push('diverse tooling');
  if (signals.multiDirScope > 2) parts.push('multi-directory scope');
  if (signals.avgUserExplanationLength > 20) parts.push('detailed explanations');
  return parts.length > 0 ? parts.join(', ') : 'Substantive session';
}
