import Database from "better-sqlite3";
import { readdir, readFile, access } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { homedir, platform } from "node:os";
import type {
  SessionParser,
  SessionAnalysis,
  ToolCall,
  LocStats,
  RawEntry,
  ContentBlock,
} from "./types.js";

// --- Cursor data structures ---

/** A single "bubble" (message) in a Cursor composer conversation */
interface CursorBubble {
  _v?: number;
  type: number; // 1 = user, 2 = assistant
  bubbleId: string;
  text: string;
  createdAt?: string;
  isAgentic?: boolean;
  unifiedMode?: number; // 2 = agent, 1 = chat
  tokenCount?: { inputTokens: number; outputTokens: number };
  toolFormerData?: CursorToolFormerData;
  codeBlocks?: CursorCodeBlock[];
  thinking?: { text: string };
  context?: CursorContext;
  supportedTools?: number[];
}

interface CursorToolFormerData {
  tool?: number;
  toolCallId?: string;
  name?: string;
  rawArgs?: string;
  params?: string;
  result?: string;
  status?: string;
  modelCallId?: string;
  additionalData?: Record<string, unknown>;
}

interface CursorCodeBlock {
  uri?: { path?: string; _fsPath?: string };
  content?: string;
  codeblockId?: string;
}

interface CursorContext {
  fileSelections?: Array<{ uri?: { path?: string } }>;
}

/** Metadata from composer.composerData in workspace state DB */
interface CursorComposerHead {
  composerId: string;
  name?: string;
  createdAt: number;
  lastUpdatedAt?: number;
  unifiedMode?: string; // "agent" | "chat"
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
  isArchived?: boolean;
}

// --- Cursor tool name mapping ---

const CURSOR_TOOL_MAP: Record<string, string> = {
  // Current Cursor tool names
  read_file: "Read",
  search_replace: "Edit",
  write: "Write",
  list_dir: "Glob",
  grep: "Grep",
  codebase_search: "Grep",
  run_terminal_cmd: "Bash",
  delete_file: "Bash",
  // Older Cursor tool names (pre-2025)
  edit_file: "Edit",
  write_file: "Write",
  create_file: "Write",
  search_files: "Grep",
  run_terminal_command: "Bash",
  terminal: "Bash",
  grep_search: "Grep",
  file_search: "Glob",
};

function mapCursorToolName(name: string): string {
  return CURSOR_TOOL_MAP[name] ?? name;
}

// --- Path utilities ---

function getCursorGlobalDbPath(): string {
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
  } else if (platform() === "win32") {
    return join(homedir(), "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb");
  }
  // Linux
  return join(homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb");
}

function getCursorWorkspaceStoragePath(): string {
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage");
  } else if (platform() === "win32") {
    return join(homedir(), "AppData", "Roaming", "Cursor", "User", "workspaceStorage");
  }
  return join(homedir(), ".config", "Cursor", "User", "workspaceStorage");
}

// --- Workspace → project directory mapping ---

export interface CursorWorkspace {
  workspaceId: string;
  dbPath: string;
  projectDir: string; // resolved absolute path, e.g. /Users/ben/Dev/heyi-am
}

/**
 * Scan Cursor's workspaceStorage to find all workspaces and their project directories.
 */
export async function discoverCursorWorkspaces(): Promise<CursorWorkspace[]> {
  const wsBase = getCursorWorkspaceStoragePath();
  const workspaces: CursorWorkspace[] = [];

  let dirs;
  try {
    dirs = await readdir(wsBase, { withFileTypes: true });
  } catch {
    return workspaces; // Cursor not installed or no workspace storage
  }

  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    const wsDir = join(wsBase, entry.name);
    const wsJsonPath = join(wsDir, "workspace.json");
    const dbPath = join(wsDir, "state.vscdb");

    try {
      await access(dbPath);
      const wsJson = JSON.parse(await readFile(wsJsonPath, "utf-8")) as { folder?: string };
      if (!wsJson.folder) continue;

      // folder is "file:///Users/ben/Dev/heyi-am"
      const projectDir = decodeURIComponent(new URL(wsJson.folder).pathname);
      workspaces.push({
        workspaceId: entry.name,
        dbPath,
        projectDir,
      });
    } catch {
      continue; // Missing workspace.json or state.vscdb
    }
  }

  return workspaces;
}

// --- Conversation listing ---

export interface CursorConversation {
  composerId: string;
  name?: string;
  createdAt: number;
  lastUpdatedAt?: number;
  mode?: string;
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
  workspace: CursorWorkspace;
}

/**
 * List all composer conversations in a workspace's state DB.
 */
export function listConversations(workspace: CursorWorkspace): CursorConversation[] {
  let db;
  try {
    db = new Database(workspace.dbPath, { readonly: true });
  } catch {
    return [];
  }

  try {
    const row = db.prepare("SELECT value FROM ItemTable WHERE [key] = ?")
      .get("composer.composerData") as { value: string } | undefined;

    if (!row) return [];

    const data = JSON.parse(row.value) as {
      allComposers?: CursorComposerHead[];
    };

    return (data.allComposers ?? [])
      .filter((c) => !c.isArchived)
      .map((c) => ({
        composerId: c.composerId,
        name: c.name,
        createdAt: c.createdAt,
        lastUpdatedAt: c.lastUpdatedAt,
        mode: c.unifiedMode,
        totalLinesAdded: c.totalLinesAdded,
        totalLinesRemoved: c.totalLinesRemoved,
        workspace,
      }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

// --- Bubble (message) reading ---

/**
 * Read all bubbles for a conversation from the global state DB.
 */
export function readBubbles(conversationId: string, globalDbPath?: string): CursorBubble[] {
  const dbPath = globalDbPath ?? getCursorGlobalDbPath();
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch {
    return [];
  }

  try {
    const prefix = `bubbleId:${conversationId}:`;
    const rows = db.prepare(
      "SELECT value FROM cursorDiskKV WHERE [key] LIKE ? ORDER BY [key]"
    ).all(`${prefix}%`) as Array<{ value: string }>;

    const bubbles: CursorBubble[] = [];
    for (const row of rows) {
      try {
        bubbles.push(JSON.parse(row.value) as CursorBubble);
      } catch {
        // Skip unparseable blobs
      }
    }

    // Sort by createdAt if available
    bubbles.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return bubbles;
  } catch {
    return [];
  } finally {
    db.close();
  }
}

// --- Bubble → SessionAnalysis conversion ---

function extractToolCallsFromBubbles(bubbles: CursorBubble[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const bubble of bubbles) {
    const tfd = bubble.toolFormerData;
    if (!tfd?.name) continue;

    let input: Record<string, unknown> = {};
    try {
      if (tfd.rawArgs) {
        input = JSON.parse(tfd.rawArgs) as Record<string, unknown>;
      } else if (tfd.params) {
        input = JSON.parse(tfd.params) as Record<string, unknown>;
      }
    } catch {
      // Malformed JSON
    }

    // Normalize field names to match Claude's convention
    const normalizedInput = normalizeCursorToolInput(tfd.name, input);

    calls.push({
      id: tfd.toolCallId ?? bubble.bubbleId,
      name: mapCursorToolName(tfd.name),
      input: normalizedInput,
    });
  }
  return calls;
}

/**
 * Normalize Cursor's tool input fields to match Claude's conventions
 * so downstream extractFilesTouched / computeLocStats work unchanged.
 */
function normalizeCursorToolInput(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...input };

  // Cursor uses target_file / targetFile; Claude uses file_path
  if (typeof normalized.target_file === "string") {
    normalized.file_path = normalized.target_file;
  } else if (typeof normalized.targetFile === "string") {
    normalized.file_path = normalized.targetFile;
  }

  // search_replace and edit_file: use old_string/new_string same as Claude — pass through

  // write: Cursor uses "contents" (plural); Claude uses "content" (singular)
  if (typeof normalized.contents === "string" && !normalized.content) {
    normalized.content = normalized.contents;
  }
  // create_file: Cursor uses "file_text"
  if (toolName === "create_file" && typeof normalized.file_text === "string") {
    normalized.content = normalized.file_text;
  }

  // For search: Cursor uses "query" or "pattern"; Claude uses "path"
  if (toolName === "list_dir" && typeof normalized.relative_workspace_path === "string") {
    normalized.path = normalized.relative_workspace_path;
  }

  return normalized;
}

function extractFilesFromBubbles(bubbles: CursorBubble[]): string[] {
  const files = new Set<string>();

  for (const bubble of bubbles) {
    // From codeBlocks
    if (bubble.codeBlocks) {
      for (const cb of bubble.codeBlocks) {
        const path = cb.uri?.path ?? cb.uri?._fsPath;
        if (path) files.add(path);
      }
    }

    // From toolFormerData
    const tfd = bubble.toolFormerData;
    if (tfd?.name) {
      try {
        const args = tfd.rawArgs ? JSON.parse(tfd.rawArgs) as Record<string, string> : {};
        const target = args.target_file ?? args.targetFile;
        if (typeof target === "string") files.add(target);
      } catch {
        // Skip
      }
    }

    // Bug 12 fix: Do NOT include context.fileSelections — those are read-only
    // context files, not files the tool actually modified or interacted with.
  }

  return [...files].sort();
}

function countTurnsFromBubbles(bubbles: CursorBubble[]): number {
  let turns = 0;
  let lastType: number | null = null;

  for (const bubble of bubbles) {
    // type 1 = user, type 2 = AI
    if (bubble.type === 2 && lastType === 1) {
      turns++;
    }
    if (bubble.type === 1 || bubble.type === 2) {
      lastType = bubble.type;
    }
  }
  return turns;
}

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

function computeDurationFromBubbles(bubbles: CursorBubble[]): {
  duration_ms: number;
  wall_clock_ms: number;
  start_time: string | null;
  end_time: string | null;
  active_intervals: [number, number][];
} {
  const timestamps: number[] = [];
  let startStr: string | null = null;
  let endStr: string | null = null;

  for (const bubble of bubbles) {
    // Bug 16 fix: skip bubbles with no createdAt instead of using current time
    if (!bubble.createdAt) continue;
    if (!startStr) startStr = bubble.createdAt;
    endStr = bubble.createdAt;
    timestamps.push(new Date(bubble.createdAt).getTime());
  }

  if (timestamps.length < 2 || !startStr || !endStr) {
    return { duration_ms: 0, wall_clock_ms: 0, start_time: startStr, end_time: endStr, active_intervals: [] };
  }

  const wallClock = timestamps[timestamps.length - 1] - timestamps[0];

  let activeMs = 0;
  const active_intervals: [number, number][] = [];
  let intervalStart = timestamps[0];

  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap < IDLE_THRESHOLD_MS) {
      activeMs += gap;
    } else {
      active_intervals.push([intervalStart, timestamps[i - 1]]);
      intervalStart = timestamps[i];
    }
  }
  active_intervals.push([intervalStart, timestamps[timestamps.length - 1]]);

  return {
    duration_ms: Math.max(activeMs, 0),
    wall_clock_ms: Math.max(wallClock, 0),
    start_time: startStr,
    end_time: endStr,
    active_intervals,
  };
}

/** Normalize a file path to a consistent absolute form for use as a map/set key. */
function normalizePath(p: string): string {
  return resolve(p);
}

function computeLocFromBubbles(bubbles: CursorBubble[]): LocStats {
  let totalAdded = 0;
  let totalRemoved = 0;
  const filesChanged = new Set<string>();
  const writeLineCounts = new Map<string, number>();

  for (const bubble of bubbles) {
    const tfd = bubble.toolFormerData;
    if (!tfd?.name) continue;

    const mappedName = mapCursorToolName(tfd.name);
    let args: Record<string, string> = {};
    try {
      if (tfd.rawArgs) args = JSON.parse(tfd.rawArgs) as Record<string, string>;
    } catch {
      continue;
    }

    const rawPath = args.file_path ?? args.target_file ?? args.targetFile;
    if (!rawPath) continue;
    const filePath = normalizePath(rawPath);

    if (mappedName === "Write") {
      const content = args.content ?? args.contents ?? args.file_text ?? "";
      if (!content) continue;
      const lines = content.split("\n").length;
      const prevLines = writeLineCounts.get(filePath) ?? 0;

      if (writeLineCounts.has(filePath)) {
        totalAdded -= prevLines;
      }
      totalAdded += lines;
      writeLineCounts.set(filePath, lines);
      filesChanged.add(filePath);
    } else if (mappedName === "Edit") {
      const oldStr = args.old_string ?? "";
      const newStr = args.new_string ?? args.new_str ?? "";
      totalAdded += newStr ? newStr.split("\n").length : 0;
      totalRemoved += oldStr ? oldStr.split("\n").length : 0;
      filesChanged.add(filePath);
    }
  }

  // Bug 11 fix: Do NOT count codeBlocks (AI-suggested file writes) for LOC.
  // Code blocks in assistant messages may be suggestions the user never applied.
  // Only tool call LOC is reliable. If tool call LOC is zero, the workspace-level
  // hints (totalLinesAdded/totalLinesRemoved) will be used as a fallback downstream.

  return {
    loc_added: totalAdded,
    loc_removed: totalRemoved,
    loc_net: totalAdded - totalRemoved,
    files_changed: [...filesChanged].sort(),
  };
}

/**
 * Convert Cursor bubbles into the same RawEntry[] format used by Claude parser.
 * This allows downstream code (signal extraction, triage) to work unchanged.
 */
function bubblesToRawEntries(bubbles: CursorBubble[], conversationId: string): RawEntry[] {
  const entries: RawEntry[] = [];

  for (const bubble of bubbles) {
    // Bug 16 fix: use null for missing timestamps instead of current time
    const timestamp = bubble.createdAt ?? null;
    const contentBlocks: ContentBlock[] = [];

    if (bubble.text) {
      contentBlocks.push({ type: "text", text: bubble.text });
    }

    if (bubble.thinking?.text) {
      contentBlocks.push({ type: "thinking", thinking: bubble.thinking.text });
    }

    // Synthesize tool_use blocks from toolFormerData
    if (bubble.toolFormerData?.name) {
      const tfd = bubble.toolFormerData;
      let input: Record<string, unknown> = {};
      try {
        if (tfd.rawArgs) input = JSON.parse(tfd.rawArgs) as Record<string, unknown>;
      } catch { /* skip */ }

      contentBlocks.push({
        type: "tool_use",
        id: tfd.toolCallId ?? bubble.bubbleId,
        name: mapCursorToolName(tfd.name!),
        input: normalizeCursorToolInput(tfd.name!, input),
      });
    }

    const role = bubble.type === 1 ? "user" : "assistant";
    entries.push({
      type: role,
      uuid: bubble.bubbleId,
      timestamp: timestamp as any,
      sessionId: conversationId,
      message: {
        role,
        content: contentBlocks.length > 0 ? contentBlocks : (bubble.text || undefined),
      },
    });
  }

  return entries;
}

// --- Main parse function ---

/**
 * Parse a Cursor conversation into a SessionAnalysis.
 * The "path" for Cursor is a synthetic string: "cursor://{globalDbPath}#{conversationId}"
 */
export interface CursorParseHints {
  name?: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
}

export async function parseCursorConversation(
  conversationId: string,
  globalDbPath?: string,
  hints?: CursorParseHints,
): Promise<SessionAnalysis> {
  const bubbles = readBubbles(conversationId, globalDbPath);

  // When bubbles are empty, use hints from composer metadata
  if (bubbles.length === 0) {
    const hintDate = hints?.createdAt ? new Date(hints.createdAt).toISOString() : null;
    // Synthesize a single user entry from the conversation name so title extraction works
    const raw_entries = hints?.name ? [{
      type: "user" as const,
      uuid: conversationId,
      timestamp: hintDate ?? new Date().toISOString(),
      sessionId: conversationId,
      message: { role: "user" as const, content: hints.name },
    }] : [];

    return {
      source: "cursor",
      turns: 0,
      tool_calls: [],
      files_touched: [],
      duration_ms: 0,
      wall_clock_ms: 0,
      loc_stats: { loc_added: 0, loc_removed: 0, loc_net: 0, files_changed: [] },
      raw_entries,
      start_time: hintDate,
      end_time: hintDate,
      active_intervals: [],
    };
  }

  const toolCalls = extractToolCallsFromBubbles(bubbles);
  const filesTouched = extractFilesFromBubbles(bubbles);
  const turns = countTurnsFromBubbles(bubbles);
  const { duration_ms, wall_clock_ms, start_time, end_time, active_intervals } = computeDurationFromBubbles(bubbles);
  const loc_stats = computeLocFromBubbles(bubbles);

  // Aggregate token usage from bubble tokenCount fields
  let inputTokens = 0;
  let outputTokens = 0;
  for (const b of bubbles) {
    if (b.tokenCount) {
      inputTokens += b.tokenCount.inputTokens ?? 0;
      outputTokens += b.tokenCount.outputTokens ?? 0;
    }
  }
  const token_usage = (inputTokens > 0 || outputTokens > 0)
    ? { input_tokens: inputTokens, output_tokens: outputTokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    : undefined;
  const raw_entries = bubblesToRawEntries(bubbles, conversationId);

  // If no user message exists but we have a conversation name, prepend a
  // synthetic user entry so downstream title extraction finds it.
  const hasUserText = raw_entries.some(
    (e) => e.type === "user" && typeof e.message?.content === "string" && e.message.content.trim().length > 0,
  );
  if (!hasUserText && hints?.name) {
    const ts = start_time ?? (hints.createdAt ? new Date(hints.createdAt).toISOString() : new Date().toISOString());
    raw_entries.unshift({
      type: "user",
      uuid: `${conversationId}-title`,
      timestamp: ts,
      sessionId: conversationId,
      message: { role: "user", content: hints.name },
    });
  }

  // Use hint date when bubbles have no timestamps
  const hintDate = hints?.createdAt ? new Date(hints.createdAt).toISOString() : null;
  const hintEndDate = hints?.lastUpdatedAt ? new Date(hints.lastUpdatedAt).toISOString() : null;

  // Fall back to workspace metadata for duration when bubble timestamps are missing
  let finalDuration = duration_ms;
  let finalWallClock = wall_clock_ms;
  let finalIntervals = active_intervals;
  if (finalDuration === 0 && hints?.createdAt && hints?.lastUpdatedAt) {
    finalWallClock = hints.lastUpdatedAt - hints.createdAt;
    finalDuration = finalWallClock; // best estimate without per-bubble idle detection
    // Best-effort single interval from workspace metadata
    finalIntervals = [[hints.createdAt, hints.lastUpdatedAt]];
  }

  // Fall back to workspace metadata for LOC when bubble tool calls lack detail
  let finalLoc = loc_stats;
  if (finalLoc.loc_added === 0 && finalLoc.loc_removed === 0) {
    const hintAdded = hints?.totalLinesAdded ?? 0;
    const hintRemoved = hints?.totalLinesRemoved ?? 0;
    if (hintAdded > 0 || hintRemoved > 0) {
      finalLoc = {
        loc_added: hintAdded,
        loc_removed: hintRemoved,
        loc_net: hintAdded - hintRemoved,
        files_changed: loc_stats.files_changed, // keep whatever we found from bubbles
      };
    }
  }

  return {
    source: "cursor",
    turns,
    tool_calls: toolCalls,
    files_touched: filesTouched,
    duration_ms: finalDuration,
    wall_clock_ms: finalWallClock,
    loc_stats: finalLoc,
    raw_entries,
    start_time: start_time ?? hintDate,
    end_time: end_time ?? hintEndDate ?? hintDate,
    active_intervals: finalIntervals,
    token_usage,
  };
}

// --- SessionParser interface adapter ---
// Cursor conversations aren't files, so detect/parse work with synthetic paths:
// "cursor://{conversationId}?db={globalDbPath}"

/** Check if a path is a Cursor virtual URL (not a filesystem path). */
export function isCursorPath(path: string): boolean {
  return path.startsWith("cursor://");
}

async function detect(path: string): Promise<boolean> {
  return path.startsWith("cursor://");
}

async function parse(path: string): Promise<SessionAnalysis> {
  const url = new URL(path);
  const conversationId = url.hostname;
  const globalDbPath = url.searchParams.get("db") ?? undefined;
  const hints: CursorParseHints = {};
  const name = url.searchParams.get("name");
  const createdAt = url.searchParams.get("createdAt");
  const lastUpdatedAt = url.searchParams.get("lastUpdatedAt");
  const linesAdded = url.searchParams.get("linesAdded");
  const linesRemoved = url.searchParams.get("linesRemoved");
  if (name) hints.name = name;
  if (createdAt) hints.createdAt = Number(createdAt);
  if (lastUpdatedAt) hints.lastUpdatedAt = Number(lastUpdatedAt);
  if (linesAdded) hints.totalLinesAdded = Number(linesAdded);
  if (linesRemoved) hints.totalLinesRemoved = Number(linesRemoved);
  return parseCursorConversation(conversationId, globalDbPath, hints);
}

export const cursorParser: SessionParser = {
  name: "cursor",
  detect,
  parse,
};
