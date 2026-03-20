/**
 * Step 9: Paste/Upload Parser
 * Accepts a raw conversation transcript (copy-pasted or uploaded)
 * and converts it into the standard SessionEntry format.
 * Supports common formats:
 *   - "User: ... \n Assistant: ..." style
 *   - ChatGPT share format
 *   - Generic markdown conversation
 */

import type { SessionEntry } from "../parser.js";

/**
 * Parse a pasted/uploaded conversation transcript into SessionEntry format.
 */
export function parseTranscript(text: string, sourceTool: string = "paste"): SessionEntry[] {
  const entries: SessionEntry[] = [];
  const now = new Date();

  // Try different formats
  const parsed = tryUserAssistantFormat(text)
    || tryMarkdownHeaders(text)
    || tryFallback(text);

  for (let i = 0; i < parsed.length; i++) {
    const msg = parsed[i];
    const timestamp = new Date(now.getTime() + i * 60000).toISOString();
    entries.push({
      type: msg.role,
      timestamp,
      message: {
        role: msg.role,
        content: msg.content,
      },
    });
  }

  return entries;
}

interface ParsedMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Format: "User: ...\nAssistant: ..."
 */
function tryUserAssistantFormat(text: string): ParsedMessage[] | null {
  const pattern = /^(User|Human|Me|Assistant|Claude|AI|Bot):\s*/gim;
  if (!pattern.test(text)) return null;

  const messages: ParsedMessage[] = [];
  const parts = text.split(/^(?=(?:User|Human|Me|Assistant|Claude|AI|Bot):\s)/gim);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(User|Human|Me|Assistant|Claude|AI|Bot):\s*([\s\S]*)/i);
    if (match) {
      const speaker = match[1].toLowerCase();
      const content = match[2].trim();
      const role = ["user", "human", "me"].includes(speaker) ? "user" : "assistant";
      if (content) messages.push({ role, content });
    }
  }

  return messages.length >= 2 ? messages : null;
}

/**
 * Format: "## User\n...\n## Assistant\n..."
 */
function tryMarkdownHeaders(text: string): ParsedMessage[] | null {
  const pattern = /^##\s+(User|Human|Assistant|Claude)/gim;
  if (!pattern.test(text)) return null;

  const messages: ParsedMessage[] = [];
  const sections = text.split(/^(?=##\s+(?:User|Human|Assistant|Claude))/gim);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^##\s+(User|Human|Assistant|Claude)\s*\n([\s\S]*)/i);
    if (match) {
      const speaker = match[1].toLowerCase();
      const content = match[2].trim();
      const role = ["user", "human"].includes(speaker) ? "user" : "assistant";
      if (content) messages.push({ role, content });
    }
  }

  return messages.length >= 2 ? messages : null;
}

/**
 * Fallback: treat entire text as a single user message.
 */
function tryFallback(text: string): ParsedMessage[] {
  return [{ role: "user", content: text.trim() }];
}
