// Transcript builder — transforms raw JSONL entries into structured
// messages for the session viewer UI. Pairs tool_use blocks with their
// tool_result responses, cleans internal XML, truncates large outputs.

import type {
  RawEntry,
  ContentBlock,
  ToolUseBlock,
  ThinkingBlock,
  ToolResultBlock,
} from './parsers/types.js';
import { cleanAssistantText } from './bridge.js';
import { stripHomePath, stripHomePathsInText } from './redact.js';

// ── Types ────────────────────────────────────────────────────

export interface TranscriptMessage {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant';
  blocks: TranscriptBlock[];
  model?: string;
}

export type TranscriptBlock =
  | TranscriptTextBlock
  | TranscriptThinkingBlock
  | TranscriptToolCallBlock;

export interface TranscriptTextBlock {
  type: 'text';
  text: string;
}

export interface TranscriptThinkingBlock {
  type: 'thinking';
  text: string;
}

export interface TranscriptToolCallBlock {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  /** Primary input: file path, command, pattern, or JSON summary */
  input: string;
  /** Full structured input for rendering tool-specific views */
  inputData?: Record<string, unknown>;
  /** Tool output (truncated if large) */
  output?: string;
  /** Whether output was truncated */
  outputTruncated?: boolean;
  /** Whether the tool call errored */
  isError?: boolean;
}

export interface TranscriptResponse {
  messages: TranscriptMessage[];
  meta: {
    totalMessages: number;
    totalTokens: { input: number; output: number };
    models: string[];
    duration: { activeMinutes: number; wallClockMinutes: number };
  };
}

// ── Configuration ────────────────────────────────────────────

/** Max characters for tool output before truncation */
const MAX_OUTPUT_LENGTH = 3000;

/** Max characters for thinking blocks before truncation */
const MAX_THINKING_LENGTH = 5000;

// ── Helpers ─────────────────────────────────────────────────

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === 'thinking';
}

function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

function getContentBlocks(entry: RawEntry): ContentBlock[] {
  const content = entry.message?.content;
  if (!content || typeof content === 'string') return [];
  return content;
}

/** Extract the primary input string for a tool call (file path, command, pattern). */
function extractPrimaryInput(name: string, input: Record<string, unknown>): string {
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.command === 'string') return input.command;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.prompt === 'string') {
    const p = input.prompt as string;
    return p.length > 120 ? p.slice(0, 117) + '...' : p;
  }
  // Fallback: summarize the keys
  const keys = Object.keys(input).filter(k => input[k] !== undefined);
  return keys.length > 0 ? `{${keys.join(', ')}}` : '';
}

/** Extract text content from a tool_result block's content field. */
function extractToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content === null || content === undefined) return '';

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return String(item.text);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof content === 'object' && 'text' in content) {
    return String((content as { text: unknown }).text);
  }

  return JSON.stringify(content);
}

/** Truncate text to max length with indicator. */
function truncateOutput(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

/** Check if a user entry is purely tool-result plumbing (no actual user text). */
function isToolResultOnly(entry: RawEntry): boolean {
  const content = entry.message?.content;
  if (typeof content === 'string') return false;
  if (!Array.isArray(content)) return false;

  // If every block is a tool_result, it's plumbing
  return content.length > 0 && content.every((block) =>
    (block as ContentBlock).type === 'tool_result',
  );
}

/** Should we skip this entry entirely? */
function shouldSkipEntry(entry: RawEntry): boolean {
  // Skip non-conversation entries
  if (entry.type === 'system' || entry.type === 'progress') return true;
  if (entry.type === 'file-history-snapshot') return true;
  if (entry.type === 'agent-name') return true;
  if (entry.type === 'custom-title') return true;
  if (entry.type === 'last-prompt') return true;
  if (entry.type === 'queue-operation') return true;
  if (entry.isMeta) return true;

  // Skip sidechain entries (internal branching)
  if (entry.isSidechain) return true;

  return false;
}

// ── Main builder ────────────────────────────────────────────

/**
 * Build a structured transcript from raw JSONL entries.
 *
 * Two-pass algorithm:
 * 1. Collect all tool_result blocks keyed by tool_use_id
 * 2. Walk entries, build messages, pair tool calls with results
 */
export function buildTranscript(entries: RawEntry[], cwd?: string): TranscriptMessage[] {
  // Pass 1: collect tool results
  const toolResults = new Map<string, { content: string; isError: boolean }>();

  for (const entry of entries) {
    if (entry.type !== 'user') continue;
    const blocks = getContentBlocks(entry);

    for (const block of blocks) {
      if (isToolResultBlock(block)) {
        const content = extractToolResultContent(block.content);
        toolResults.set(block.tool_use_id, {
          content,
          isError: !!(block as unknown as Record<string, unknown>).is_error,
        });
      }
    }
  }

  // Pass 2: build messages
  const messages: TranscriptMessage[] = [];

  for (const entry of entries) {
    if (shouldSkipEntry(entry)) continue;

    if (entry.type === 'user') {
      // Skip tool-result-only entries (plumbing between assistant turns)
      if (isToolResultOnly(entry)) continue;

      const content = entry.message?.content;
      let userText = '';

      if (typeof content === 'string') {
        userText = cleanAssistantText(content);
      } else if (Array.isArray(content)) {
        // Extract text blocks from user message (skip tool_result blocks)
        const textParts = content
          .filter((b) => (b as ContentBlock).type === 'text')
          .map((b) => (b as { text: string }).text)
          .map(cleanAssistantText)
          .filter(Boolean);
        userText = textParts.join('\n');
      }

      if (!userText) continue;

      if (cwd) userText = stripHomePathsInText(userText, cwd);

      messages.push({
        id: entry.uuid,
        timestamp: entry.timestamp,
        role: 'user',
        blocks: [{ type: 'text', text: userText }],
      });
    } else if (entry.type === 'assistant') {
      const contentBlocks = getContentBlocks(entry);
      const transcriptBlocks: TranscriptBlock[] = [];

      // Also handle string-only assistant content
      if (typeof entry.message?.content === 'string') {
        const cleaned = cleanAssistantText(entry.message.content);
        if (cleaned) {
          transcriptBlocks.push({
            type: 'text',
            text: cwd ? stripHomePathsInText(cleaned, cwd) : cleaned,
          });
        }
      }

      for (const block of contentBlocks) {
        if (isThinkingBlock(block)) {
          const thinking = block.thinking?.trim();
          if (!thinking) continue;
          const { text, truncated } = truncateOutput(thinking, MAX_THINKING_LENGTH);
          transcriptBlocks.push({
            type: 'thinking',
            text: truncated ? text + '\n\n[thinking truncated]' : text,
          });
        } else if (block.type === 'text') {
          const cleaned = cleanAssistantText(block.text);
          if (!cleaned) continue;
          transcriptBlocks.push({
            type: 'text',
            text: cwd ? stripHomePathsInText(cleaned, cwd) : cleaned,
          });
        } else if (isToolUseBlock(block)) {
          let primaryInput = extractPrimaryInput(block.name, block.input);
          if (primaryInput && cwd) primaryInput = stripHomePath(primaryInput, cwd);

          const result = toolResults.get(block.id);
          let output: string | undefined;
          let outputTruncated = false;
          let isError = false;

          if (result) {
            let content = result.content;
            if (cwd) content = stripHomePathsInText(content, cwd);
            const trunc = truncateOutput(content, MAX_OUTPUT_LENGTH);
            output = trunc.text;
            outputTruncated = trunc.truncated;
            isError = result.isError;
          }

          // Sanitize inputData: strip full file contents from Write calls
          const sanitizedInput = { ...block.input };
          if (block.name === 'Write' && typeof sanitizedInput.content === 'string') {
            const lines = (sanitizedInput.content as string).split('\n').length;
            sanitizedInput.content = `[${lines} lines]`;
          }

          transcriptBlocks.push({
            type: 'tool_call',
            toolCallId: block.id,
            toolName: block.name,
            input: primaryInput,
            inputData: sanitizedInput,
            output,
            outputTruncated,
            isError,
          });
        }
        // Skip image blocks for now (could add later)
      }

      if (transcriptBlocks.length === 0) continue;

      messages.push({
        id: entry.uuid,
        timestamp: entry.timestamp,
        role: 'assistant',
        blocks: transcriptBlocks,
        model: entry.message?.model,
      });
    }
  }

  return messages;
}

/**
 * Build transcript with metadata for the API response.
 */
export function buildTranscriptResponse(
  entries: RawEntry[],
  opts: {
    cwd?: string;
    activeMinutes?: number;
    wallClockMinutes?: number;
    tokenUsage?: { input_tokens: number; output_tokens: number };
    modelsUsed?: string[];
  } = {},
): TranscriptResponse {
  const messages = buildTranscript(entries, opts.cwd);

  return {
    messages,
    meta: {
      totalMessages: messages.length,
      totalTokens: {
        input: opts.tokenUsage?.input_tokens ?? 0,
        output: opts.tokenUsage?.output_tokens ?? 0,
      },
      models: opts.modelsUsed ?? [],
      duration: {
        activeMinutes: opts.activeMinutes ?? 0,
        wallClockMinutes: opts.wallClockMinutes ?? 0,
      },
    },
  };
}
