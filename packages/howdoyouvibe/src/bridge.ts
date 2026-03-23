import type {
  RawEntry,
  ContentBlock,
  ToolUseBlock,
} from "./parsers/types.js";

export interface ParsedTurn {
  timestamp: string;
  type: "prompt" | "response" | "tool";
  content: string;
  toolName?: string;
  toolInput?: string;
}

/**
 * Strip AI-internal XML tags from assistant text content.
 */
export function cleanAssistantText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/<antml_[a-z_]+>[\s\S]*?<\/antml_[a-z_]+>/g, "");
  cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  cleaned = cleaned.replace(/<teammate-message[^>]*>[\s\S]*?<\/teammate-message>/g, "");
  cleaned = cleaned.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "");
  cleaned = cleaned.replace(/<fast_mode_info>[\s\S]*?<\/fast_mode_info>/g, "");
  cleaned = cleaned.replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, "");
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

function extractToolInput(block: ToolUseBlock): string | undefined {
  const input = block.input;
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.command === "string") return input.command;
  if (typeof input.pattern === "string") return input.pattern;
  if (typeof input.path === "string") return input.path;
  return undefined;
}

/**
 * Convert raw entries into a flat list of turns for stat computation.
 * Simplified from cli/src/bridge.ts — no path redaction (vibe stats don't need it).
 */
export function entriesToTurns(entries: RawEntry[]): ParsedTurn[] {
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
