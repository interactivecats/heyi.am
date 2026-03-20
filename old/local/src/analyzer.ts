import type { SessionEntry, SessionInfo, ContentBlock } from "./parser.js";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  toolUseId: string;
  timestamp: string;
  succeeded: boolean;
  resultPreview: string;
}

export interface Turn {
  index: number;
  userPrompt: string;
  userTimestamp: string;
  assistantText: string;
  assistantTimestamp: string;
  model: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface FileChange {
  filePath: string;
  tool: string;
  count: number;
}

export interface FunnyMoment {
  type: string;
  description: string;
  turnIndex: number;
  timestamp: string;
  context: string;
}

export interface SessionAnalysis {
  sessionId: string;
  project: string;
  projectPath: string;
  fileSize: number;
  duration: { start: string; end: string; minutes: number };
  turns: Turn[];
  totalMessages: number;
  totalToolCalls: number;
  toolUsage: Record<string, { count: number; errors: number }>;
  filesChanged: FileChange[];
  models: Record<string, number>;
  tokens: {
    totalInput: number;
    totalOutput: number;
    totalCacheRead: number;
    totalCacheCreation: number;
  };
  gitBranch: string;
  funnyMoments: FunnyMoment[];
  rejectedToolCalls: number;
  retries: number;
  subagentCount: number;
  idleGaps: { after: string; minutes: number }[];
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

function extractToolUses(
  content: string | ContentBlock[]
): Array<{ name: string; input: Record<string, unknown>; id: string }> {
  if (typeof content === "string") return [];
  return content
    .filter((b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use")
    .map((b) => ({ name: b.name ?? "unknown", input: b.input ?? {}, id: b.tool_use_id ?? "" }));
}

function extractToolResults(
  content: string | ContentBlock[]
): Array<{ toolUseId: string; isError: boolean; text: string }> {
  if (typeof content === "string") return [];
  return content
    .filter((b): b is ContentBlock & { type: "tool_result" } => b.type === "tool_result")
    .map((b) => ({
      toolUseId: b.tool_use_id ?? "",
      isError: b.is_error ?? false,
      text:
        typeof b.content === "string"
          ? b.content
          : Array.isArray(b.content)
            ? b.content.map((c) => c.text ?? "").join("")
            : "",
    }));
}

export function analyzeSession(session: SessionInfo): SessionAnalysis {
  const entries = session.entries.filter(
    (e) => (e.type === "user" || e.type === "assistant") && e.message && !e.isSidechain
  );

  const timestamps = entries
    .map((e) => e.timestamp)
    .filter(Boolean)
    .sort() as string[];

  const start = timestamps[0] ?? "";
  const end = timestamps[timestamps.length - 1] ?? "";
  const durationMs = start && end ? new Date(end).getTime() - new Date(start).getTime() : 0;

  const turns: Turn[] = [];
  const toolUsage: Record<string, { count: number; errors: number }> = {};
  const filesChangedMap = new Map<string, { tool: string; count: number }>();
  const models: Record<string, number> = {};
  const funnyMoments: FunnyMoment[] = [];
  let totalToolCalls = 0;
  let rejectedToolCalls = 0;
  let retries = 0;
  let subagentCount = 0;

  let tokens = { totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCacheCreation: 0 };

  // Build tool result map from user messages
  const toolResultMap = new Map<string, { isError: boolean; text: string }>();
  for (const entry of entries) {
    if (entry.type === "user" && entry.message) {
      for (const tr of extractToolResults(entry.message.content)) {
        toolResultMap.set(tr.toolUseId, tr);
      }
    }
  }

  // Track consecutive errors for funny detection
  let consecutiveErrors = 0;
  let lastErrorTool = "";

  // Group into turns: user prompt + ALL subsequent assistant messages until next user prompt
  let currentUserEntry: SessionEntry | null = null;
  let turnIndex = 0;
  let apologyCount = 0;

  // Accumulate assistant data between user messages
  let accToolCalls: ToolCall[] = [];
  let accAssistantTexts: string[] = [];
  let accModel = "unknown";
  let accAssistantTimestamp = "";
  let accInputTokens = 0;
  let accOutputTokens = 0;
  let accCacheRead = 0;
  let accCacheCreation = 0;

  function flushTurn() {
    if (!currentUserEntry) return;
    const userPrompt = extractText(currentUserEntry.message!.content);
    const assistantText = accAssistantTexts.filter(t => t.trim()).join("\n\n");

    if (!userPrompt.trim() && accToolCalls.length === 0 && !assistantText.trim()) return;

    turns.push({
      index: turnIndex,
      userPrompt,
      userTimestamp: currentUserEntry.timestamp ?? "",
      assistantText,
      assistantTimestamp: accAssistantTimestamp,
      model: accModel,
      toolCalls: accToolCalls,
      inputTokens: accInputTokens,
      outputTokens: accOutputTokens,
      cacheReadTokens: accCacheRead,
      cacheCreationTokens: accCacheCreation,
    });

    // Funny: user frustration
    const lowerPrompt = userPrompt.toLowerCase();
    if (/\b(no|stop|wrong|that's wrong|not that)\b/.test(lowerPrompt) && userPrompt.length < 100) {
      retries++;
      if (retries >= 3) {
        funnyMoments.push({
          type: "user_frustration",
          description: `User corrected Claude ${retries} times`,
          turnIndex,
          timestamp: currentUserEntry.timestamp ?? "",
          context: userPrompt.slice(0, 200),
        });
      }
    }

    // Funny: apology detection
    if (/\b(sorry|apologize|my mistake|I apologize)\b/i.test(assistantText)) {
      apologyCount++;
      if (apologyCount === 3) {
        funnyMoments.push({
          type: "apology",
          description: `Claude apologized ${apologyCount}+ times this session`,
          turnIndex,
          timestamp: accAssistantTimestamp,
          context: assistantText.slice(0, 200),
        });
      }
    }

    turnIndex++;
    currentUserEntry = null;
    accToolCalls = [];
    accAssistantTexts = [];
    accModel = "unknown";
    accAssistantTimestamp = "";
    accInputTokens = 0;
    accOutputTokens = 0;
    accCacheRead = 0;
    accCacheCreation = 0;
  }

  for (const entry of entries) {
    if (entry.type === "user") {
      if (entry.toolUseResult === "User rejected tool use") {
        rejectedToolCalls++;
      }
      const text = entry.message ? extractText(entry.message.content) : "";
      if (text.trim().length > 0) {
        // New user message — flush the previous turn if we have one
        if (currentUserEntry) flushTurn();
        currentUserEntry = entry;
      }
    } else if (entry.type === "assistant" && entry.message) {
      const msg = entry.message;
      const model = msg.model ?? "unknown";
      accModel = model;
      accAssistantTimestamp = entry.timestamp ?? "";
      models[model] = (models[model] ?? 0) + 1;

      // Accumulate text
      const text = extractText(msg.content);
      if (text.trim()) accAssistantTexts.push(text);

      // Accumulate tokens
      const usage = msg.usage;
      accInputTokens += usage?.input_tokens ?? 0;
      accOutputTokens += usage?.output_tokens ?? 0;
      accCacheRead += usage?.cache_read_input_tokens ?? 0;
      accCacheCreation += usage?.cache_creation_input_tokens ?? 0;

      // Accumulate tool calls
      const toolUses = extractToolUses(msg.content);
      for (const tu of toolUses) {
        totalToolCalls++;
        const result = toolResultMap.get(tu.id);
        const succeeded = result ? !result.isError : true;

        if (!toolUsage[tu.name]) toolUsage[tu.name] = { count: 0, errors: 0 };
        toolUsage[tu.name].count++;
        if (!succeeded) toolUsage[tu.name].errors++;

        // Track file changes
        if (["Edit", "Write", "NotebookEdit"].includes(tu.name)) {
          const fp = (tu.input.file_path as string) ?? "unknown";
          const existing = filesChangedMap.get(fp);
          if (existing) {
            existing.count++;
          } else {
            filesChangedMap.set(fp, { tool: tu.name, count: 1 });
          }
        }

        // Track agent spawns
        if (tu.name === "Agent") subagentCount++;

        // Funny: consecutive errors
        if (!succeeded) {
          if (tu.name === lastErrorTool) {
            consecutiveErrors++;
          } else {
            consecutiveErrors = 1;
            lastErrorTool = tu.name;
          }
          if (consecutiveErrors >= 3) {
            funnyMoments.push({
              type: "repeated_failure",
              description: `Failed ${tu.name} ${consecutiveErrors} times in a row`,
              turnIndex,
              timestamp: entry.timestamp ?? "",
              context: result?.text?.slice(0, 200) ?? "",
            });
          }
        } else {
          consecutiveErrors = 0;
        }

        accToolCalls.push({
          name: tu.name,
          input: tu.input,
          toolUseId: tu.id,
          timestamp: entry.timestamp ?? "",
          succeeded,
          resultPreview: result?.text?.slice(0, 300) ?? "",
        });
      }

      tokens.totalInput += usage?.input_tokens ?? 0;
      tokens.totalOutput += usage?.output_tokens ?? 0;
      tokens.totalCacheRead += usage?.cache_read_input_tokens ?? 0;
      tokens.totalCacheCreation += usage?.cache_creation_input_tokens ?? 0;
    }
  }

  // Flush the last turn
  if (currentUserEntry) flushTurn();

  // Detect idle gaps > 5 minutes
  const idleGaps: { after: string; minutes: number }[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = new Date(timestamps[i]).getTime() - new Date(timestamps[i - 1]).getTime();
    const gapMinutes = gap / 60000;
    if (gapMinutes > 5) {
      idleGaps.push({ after: timestamps[i - 1], minutes: Math.round(gapMinutes) });
    }
  }

  const filesChanged = Array.from(filesChangedMap.entries()).map(([filePath, info]) => ({
    filePath,
    tool: info.tool,
    count: info.count,
  }));

  return {
    sessionId: session.id,
    project: session.project,
    projectPath: session.projectPath,
    fileSize: session.fileSize,
    duration: { start, end, minutes: Math.round(durationMs / 60000) },
    turns,
    totalMessages: entries.length,
    totalToolCalls,
    toolUsage,
    filesChanged,
    models,
    tokens,
    gitBranch: entries.find((e) => e.gitBranch)?.gitBranch ?? "unknown",
    funnyMoments,
    rejectedToolCalls,
    retries,
    subagentCount,
    idleGaps,
  };
}
