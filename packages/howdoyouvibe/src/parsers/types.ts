export type SessionSource = "claude" | "cursor" | "codex" | "gemini" | "antigravity";

/** Display names for source tools */
export const SOURCE_DISPLAY_NAMES: Record<SessionSource, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  gemini: "Gemini CLI",
  antigravity: "Antigravity",
};

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LocStats {
  loc_added: number;
  loc_removed: number;
  loc_net: number;
  files_changed: string[];
}

export interface SessionAnalysis {
  source: SessionSource;
  turns: number;
  tool_calls: ToolCall[];
  files_touched: string[];
  /** Active time — excludes idle gaps > 5 min */
  duration_ms: number;
  /** Wall-clock time — first to last timestamp */
  wall_clock_ms: number;
  loc_stats: LocStats;
  raw_entries: RawEntry[];
  start_time: string | null;
  end_time: string | null;
  agent_role?: string;
  parent_session_id?: string | null;
  /** Working directory where the session was started */
  cwd?: string;
}

/** Minimal shape of a JSONL entry from Claude Code sessions */
export interface RawEntry {
  type: string;
  uuid: string;
  timestamp: string;
  sessionId: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    model?: string;
    id?: string;
    usage?: Record<string, unknown>;
  };
  subtype?: string;
  durationMs?: number;
  parentUuid?: string | null;
  isSidechain?: boolean;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  agentId?: string;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: unknown;
}

export interface ImageBlock {
  type: "image";
  source: Record<string, unknown>;
}

export interface SessionParser {
  name: string;
  detect(path: string): Promise<boolean>;
  parse(path: string): Promise<SessionAnalysis>;
}
