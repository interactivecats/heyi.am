/**
 * Step 9: Cursor Session Parser
 * Cursor stores conversations in SQLite databases.
 * Location: ~/Library/Application Support/Cursor/User/workspaceStorage/{id}/state.vscdb
 * Table: ItemTable, key prefix: "workbench.panel.aichat.v2."
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SessionEntry, SessionInfo } from "../parser.js";

const CURSOR_STORAGE =
  process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage")
    : join(homedir(), ".config", "Cursor", "User", "workspaceStorage");

export interface CursorConversation {
  id: string;
  title: string;
  messages: CursorMessage[];
  createdAt: string;
}

interface CursorMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

/**
 * List available Cursor workspace directories that have chat history.
 */
export function listCursorWorkspaces(): string[] {
  if (!existsSync(CURSOR_STORAGE)) return [];

  return readdirSync(CURSOR_STORAGE)
    .map((dir) => join(CURSOR_STORAGE, dir))
    .filter((d) => {
      try {
        return statSync(d).isDirectory() && existsSync(join(d, "state.vscdb"));
      } catch {
        return false;
      }
    });
}

/**
 * Parse Cursor conversations from a workspace's SQLite database.
 * Requires better-sqlite3 (optional dependency).
 */
export async function parseCursorWorkspace(workspacePath: string): Promise<CursorConversation[]> {
  const dbPath = join(workspacePath, "state.vscdb");
  if (!existsSync(dbPath)) return [];

  let Database: any;
  try {
    Database = (await import("better-sqlite3")).default;
  } catch {
    throw new Error(
      "better-sqlite3 is required for Cursor import. Install it with: npm install better-sqlite3"
    );
  }

  const db = new Database(dbPath, { readonly: true });
  const conversations: CursorConversation[] = [];

  try {
    const rows = db
      .prepare(
        `SELECT key, value FROM ItemTable WHERE key LIKE 'workbench.panel.aichat.v2.%'`
      )
      .all();

    for (const row of rows) {
      try {
        const data = JSON.parse(row.value);
        if (data.tabs) {
          for (const tab of data.tabs) {
            if (tab.chatMessages && tab.chatMessages.length > 0) {
              conversations.push({
                id: tab.id || row.key,
                title: tab.chatTitle || tab.chatMessages[0]?.text?.slice(0, 100) || "Untitled",
                messages: tab.chatMessages.map((m: any) => ({
                  role: m.type === 1 ? "user" : "assistant",
                  content: m.text || "",
                  timestamp: m.timestamp,
                })),
                createdAt: new Date(tab.chatMessages[0]?.timestamp || Date.now()).toISOString(),
              });
            }
          }
        }
      } catch {
        // Skip malformed entries
      }
    }
  } finally {
    db.close();
  }

  return conversations;
}

/**
 * Convert a Cursor conversation into the standard SessionEntry format
 * so it can be analyzed by the existing analyzer.
 */
export function cursorToSessionEntries(conversation: CursorConversation): SessionEntry[] {
  return conversation.messages.map((msg, i) => ({
    type: msg.role,
    timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
    message: {
      role: msg.role,
      content: msg.content,
    },
  }));
}
