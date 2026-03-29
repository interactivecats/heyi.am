import { readdir, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import {
  type SessionParser,
  type SessionAnalysis,
  type ToolCall,
  type LocStats,
  type RawEntry,
  type ContentBlock,
  IDLE_THRESHOLD_MS,
} from "./types.js";

// --- better-sqlite3 dynamic import ---

type DatabaseConstructor = new (path: string, opts?: { readonly?: boolean }) => {
  prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
  close(): void;
};

let Database: DatabaseConstructor | null = null;

async function loadSqlite(): Promise<DatabaseConstructor | null> {
  if (Database) return Database;
  try {
    const mod = await import("better-sqlite3");
    Database = (mod.default ?? mod) as unknown as DatabaseConstructor;
    return Database;
  } catch {
    return null;
  }
}

// --- Cursor data structures ---

interface CursorBubble {
  _v?: number;
  type: number;
  bubbleId: string;
  text: string;
  createdAt?: string;
  isAgentic?: boolean;
  unifiedMode?: number;
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

interface CursorComposerHead {
  composerId: string;
  name?: string;
  createdAt: number;
  lastUpdatedAt?: number;
  unifiedMode?: string;
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
  isArchived?: boolean;
}

// --- Cursor tool name mapping ---

const CURSOR_TOOL_MAP: Record<string, string> = {
  read_file: "Read",
  search_replace: "Edit",
  write: "Write",
  list_dir: "Glob",
  grep: "Grep",
  codebase_search: "Grep",
  run_terminal_cmd: "Bash",
  delete_file: "Bash",
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

// --- Workspace discovery ---

export interface CursorWorkspace {
  workspaceId: string;
  dbPath: string;
  projectDir: string;
}

export async function discoverCursorWorkspaces(): Promise<CursorWorkspace[]> {
  const wsBase = getCursorWorkspaceStoragePath();
  const workspaces: CursorWorkspace[] = [];

  let dirs;
  try {
    dirs = await readdir(wsBase, { withFileTypes: true });
  } catch {
    return workspaces;
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

      const projectDir = decodeURIComponent(new URL(wsJson.folder).pathname);
      workspaces.push({
        workspaceId: entry.name,
        dbPath,
        projectDir,
      });
    } catch {
      continue;
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

export async function listConversations(workspace: CursorWorkspace): Promise<CursorConversation[]> {
  const Db = await loadSqlite();
  if (!Db) return [];

  let db;
  try {
    db = new Db(workspace.dbPath, { readonly: true });
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

// --- Bubble reading ---

export async function readBubbles(conversationId: string, globalDbPath?: string): Promise<CursorBubble[]> {
  const Db = await loadSqlite();
  if (!Db) return [];

  const dbPath = globalDbPath ?? getCursorGlobalDbPath();
  let db;
  try {
    db = new Db(dbPath, { readonly: true });
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

// --- Bubble conversion helpers ---

function normalizeCursorToolInput(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...input };

  if (typeof normalized.target_file === "string") {
    normalized.file_path = normalized.target_file;
  } else if (typeof normalized.targetFile === "string") {
    normalized.file_path = normalized.targetFile;
  }

  if (typeof normalized.contents === "string" && !normalized.content) {
    normalized.content = normalized.contents;
  }
  if (toolName === "create_file" && typeof normalized.file_text === "string") {
    normalized.content = normalized.file_text;
  }

  if (toolName === "list_dir" && typeof normalized.relative_workspace_path === "string") {
    normalized.path = normalized.relative_workspace_path;
  }

  return normalized;
}

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

    const normalizedInput = normalizeCursorToolInput(tfd.name, input);

    calls.push({
      id: tfd.toolCallId ?? bubble.bubbleId,
      name: mapCursorToolName(tfd.name),
      input: normalizedInput,
    });
  }
  return calls;
}

function extractFilesFromBubbles(bubbles: CursorBubble[]): string[] {
  const files = new Set<string>();

  for (const bubble of bubbles) {
    if (bubble.codeBlocks) {
      for (const cb of bubble.codeBlocks) {
        const path = cb.uri?.path ?? cb.uri?._fsPath;
        if (path) files.add(path);
      }
    }

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

    if (bubble.context?.fileSelections) {
      for (const fs of bubble.context.fileSelections) {
        if (fs.uri?.path) files.add(fs.uri.path);
      }
    }
  }

  return [...files].sort();
}

function countTurnsFromBubbles(bubbles: CursorBubble[]): number {
  let turns = 0;
  let lastType: number | null = null;

  for (const bubble of bubbles) {
    if (bubble.type === 2 && lastType === 1) {
      turns++;
    }
    if (bubble.type === 1 || bubble.type === 2) {
      lastType = bubble.type;
    }
  }
  return turns;
}


function computeDurationFromBubbles(bubbles: CursorBubble[]): {
  duration_ms: number;
  wall_clock_ms: number;
  start_time: string | null;
  end_time: string | null;
} {
  const timestamps: number[] = [];
  let startStr: string | null = null;
  let endStr: string | null = null;

  for (const bubble of bubbles) {
    if (!bubble.createdAt) continue;
    if (!startStr) startStr = bubble.createdAt;
    endStr = bubble.createdAt;
    timestamps.push(new Date(bubble.createdAt).getTime());
  }

  if (timestamps.length < 2 || !startStr || !endStr) {
    return { duration_ms: 0, wall_clock_ms: 0, start_time: startStr, end_time: endStr };
  }

  const wallClock = timestamps[timestamps.length - 1] - timestamps[0];

  let activeMs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap < IDLE_THRESHOLD_MS) {
      activeMs += gap;
    }
  }

  return {
    duration_ms: Math.max(activeMs, 0),
    wall_clock_ms: Math.max(wallClock, 0),
    start_time: startStr,
    end_time: endStr,
  };
}

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

  for (const bubble of bubbles) {
    if (!bubble.codeBlocks) continue;
    for (const cb of bubble.codeBlocks) {
      const rawPath = cb.uri?.path ?? cb.uri?._fsPath;
      if (rawPath && cb.content) {
        const cbPath = normalizePath(rawPath);
        filesChanged.add(cbPath);
        if (!writeLineCounts.has(cbPath)) {
          totalAdded += cb.content.split("\n").length;
          writeLineCounts.set(cbPath, cb.content.split("\n").length);
        }
      }
    }
  }

  return {
    loc_added: totalAdded,
    loc_removed: totalRemoved,
    loc_net: totalAdded - totalRemoved,
    files_changed: [...filesChanged].sort(),
  };
}

function bubblesToRawEntries(bubbles: CursorBubble[], conversationId: string): RawEntry[] {
  const entries: RawEntry[] = [];

  for (const bubble of bubbles) {
    const timestamp = bubble.createdAt ?? new Date().toISOString();
    const contentBlocks: ContentBlock[] = [];

    if (bubble.text) {
      contentBlocks.push({ type: "text", text: bubble.text });
    }

    if (bubble.thinking?.text) {
      contentBlocks.push({ type: "thinking", thinking: bubble.thinking.text });
    }

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
      timestamp,
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
  const bubbles = await readBubbles(conversationId, globalDbPath);

  if (bubbles.length === 0) {
    const hintDate = hints?.createdAt ? new Date(hints.createdAt).toISOString() : null;
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
    };
  }

  const toolCalls = extractToolCallsFromBubbles(bubbles);
  const filesTouched = extractFilesFromBubbles(bubbles);
  const turns = countTurnsFromBubbles(bubbles);
  const { duration_ms, wall_clock_ms, start_time, end_time } = computeDurationFromBubbles(bubbles);
  const loc_stats = computeLocFromBubbles(bubbles);
  const raw_entries = bubblesToRawEntries(bubbles, conversationId);

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

  const hintDate = hints?.createdAt ? new Date(hints.createdAt).toISOString() : null;
  const hintEndDate = hints?.lastUpdatedAt ? new Date(hints.lastUpdatedAt).toISOString() : null;

  let finalDuration = duration_ms;
  let finalWallClock = wall_clock_ms;
  if (finalDuration === 0 && hints?.createdAt && hints?.lastUpdatedAt) {
    finalWallClock = hints.lastUpdatedAt - hints.createdAt;
    finalDuration = finalWallClock;
  }

  let finalLoc = loc_stats;
  if (finalLoc.loc_added === 0 && finalLoc.loc_removed === 0) {
    const hintAdded = hints?.totalLinesAdded ?? 0;
    const hintRemoved = hints?.totalLinesRemoved ?? 0;
    if (hintAdded > 0 || hintRemoved > 0) {
      finalLoc = {
        loc_added: hintAdded,
        loc_removed: hintRemoved,
        loc_net: hintAdded - hintRemoved,
        files_changed: loc_stats.files_changed,
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
  };
}

// --- SessionParser interface adapter ---

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
