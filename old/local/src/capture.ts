/**
 * Intelligent terminal screenshot capture.
 *
 * Watches a Claude Code session JSONL file for changes and captures
 * the terminal window at meaningful moments:
 * - New user prompt submitted
 * - Assistant response with tool calls
 * - Errors or rejected tool calls
 * - Long outputs (bash results)
 *
 * Uses macOS `screencapture -l <windowID>` to capture just the terminal.
 */

import { watch, existsSync, readFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { execSync, execFileSync, exec } from "child_process";
import { homedir } from "os";

const CLAUDE_DIR = join(homedir(), ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

interface CaptureEvent {
  type: "user_prompt" | "tool_result" | "error" | "assistant_response";
  turnIndex: number;
  timestamp: string;
  detail: string;
}

function getTerminalWindowId(): string | null {
  try {
    // Get the frontmost Terminal/iTerm2/Warp/Alacritty window ID
    const script = `
      tell application "System Events"
        set termApps to {"Terminal", "iTerm2", "Warp", "Alacritty", "kitty", "WezTerm"}
        repeat with appName in termApps
          if exists (process appName) then
            tell process appName
              set frontWin to front window
              return id of frontWin
            end tell
          end if
        end repeat
      end tell
    `;
    const result = execFileSync("osascript", ["-e", script], { encoding: "utf-8" }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function getTerminalWindowIdCG(): string | null {
  // Fallback: use CGWindowListCopyWindowInfo via Python to find terminal windows
  try {
    const script = `
import Quartz
import json
windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
terminals = ["Terminal", "iTerm2", "Warp", "Alacritty", "kitty", "WezTerm"]
for w in windows:
    owner = w.get("kCGWindowOwnerName", "")
    if owner in terminals and w.get("kCGWindowLayer", 999) == 0:
        print(w.get("kCGWindowNumber", ""))
        break
`;
    const result = execFileSync("python3", ["-c", script], { encoding: "utf-8" }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function captureTerminal(outputPath: string): boolean {
  // Try CGWindowID approach first (more reliable)
  const windowId = getTerminalWindowIdCG() ?? getTerminalWindowId();

  if (windowId) {
    try {
      execSync(`screencapture -l ${windowId} -x "${outputPath}"`, { encoding: "utf-8" });
      return true;
    } catch {
      // Fall through to alternative
    }
  }

  // Fallback: capture the frontmost window
  try {
    execSync(`screencapture -w -x "${outputPath}"`, { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

function findActiveSession(): { projectName: string; sessionId: string; filePath: string } | null {
  // Find the most recently modified session JSONL
  const sessions = readdirSync(join(CLAUDE_DIR, "sessions"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const full = join(CLAUDE_DIR, "sessions", f);
      try {
        const data = JSON.parse(readFileSync(full, "utf-8"));
        return { ...data, metaPath: full, mtime: statSync(full).mtime };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.mtime.getTime() - a.mtime.getTime());

  if (sessions.length === 0) return null;

  const active = sessions[0] as any;
  const sessionId = active.sessionId as string;
  const cwd = active.cwd as string;

  // Find the project directory for this cwd
  const encodedCwd = cwd.replace(/\//g, "-");
  const projectDirs = readdirSync(PROJECTS_DIR);
  const projectName = projectDirs.find((d) => d === encodedCwd);

  if (!projectName) return null;

  const filePath = join(PROJECTS_DIR, projectName, `${sessionId}.jsonl`);
  if (!existsSync(filePath)) return null;

  return { projectName, sessionId, filePath };
}

function countLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

function parseLastNLines(filePath: string, n: number): any[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    return lines.slice(-n).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function shouldCapture(entry: any, prevEntry: any): CaptureEvent | null {
  if (!entry || !entry.type) return null;

  // Capture on user prompts (new turn starting)
  if (entry.type === "user" && entry.message?.role === "user") {
    const content = entry.message.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
        : "";

    // Skip empty / tool-result-only messages
    if (text.trim().length > 0 && !text.includes("[Request interrupted")) {
      return {
        type: "user_prompt",
        turnIndex: 0, // Will be calculated
        timestamp: entry.timestamp ?? new Date().toISOString(),
        detail: text.slice(0, 100),
      };
    }
  }

  // Capture on assistant messages with tool calls
  if (entry.type === "assistant" && entry.message?.content) {
    const content = entry.message.content;
    if (Array.isArray(content)) {
      const hasToolUse = content.some((b: any) => b.type === "tool_use");
      const hasText = content.some((b: any) => b.type === "text" && b.text?.trim());

      if (hasToolUse) {
        const tools = content.filter((b: any) => b.type === "tool_use").map((b: any) => b.name);
        return {
          type: "assistant_response",
          turnIndex: 0,
          timestamp: entry.timestamp ?? new Date().toISOString(),
          detail: `Tools: ${tools.join(", ")}`,
        };
      }

      // Capture substantial text responses (not just short acknowledgments)
      if (hasText) {
        const text = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        if (text.length > 200) {
          return {
            type: "assistant_response",
            turnIndex: 0,
            timestamp: entry.timestamp ?? new Date().toISOString(),
            detail: text.slice(0, 100),
          };
        }
      }
    }
  }

  // Capture on errors
  if (entry.type === "user" && entry.toolUseResult === "User rejected tool use") {
    return {
      type: "error",
      turnIndex: 0,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      detail: "User rejected tool call",
    };
  }

  return null;
}

// Debounce captures - don't capture more than once every 3 seconds
let lastCaptureTime = 0;
const DEBOUNCE_MS = 3000;

async function startCapture(sessionFilePath: string, outputDir: string) {
  mkdirSync(outputDir, { recursive: true });

  let lineCount = countLines(sessionFilePath);
  let turnCounter = 0;
  let captureCount = 0;

  console.log(`📸 Watching: ${sessionFilePath}`);
  console.log(`📁 Saving to: ${outputDir}`);
  console.log(`   Press Ctrl+C to stop\n`);

  // Take initial screenshot
  const initialPath = join(outputDir, "turn-0000-initial.png");
  if (captureTerminal(initialPath)) {
    console.log(`   [initial] Captured terminal state`);
    captureCount++;
  }

  watch(sessionFilePath, { persistent: true }, (eventType) => {
    if (eventType !== "change") return;

    const newLineCount = countLines(sessionFilePath);
    if (newLineCount <= lineCount) return;

    const newEntries = parseLastNLines(sessionFilePath, newLineCount - lineCount);
    lineCount = newLineCount;

    for (const entry of newEntries) {
      const event = shouldCapture(entry, null);
      if (!event) continue;

      const now = Date.now();
      if (now - lastCaptureTime < DEBOUNCE_MS) continue;
      lastCaptureTime = now;

      if (event.type === "user_prompt") turnCounter++;
      event.turnIndex = turnCounter;

      const filename = `turn-${String(turnCounter).padStart(4, "0")}-${event.type}-${captureCount}.png`;
      const outputPath = join(outputDir, filename);

      // Small delay to let the terminal render
      setTimeout(() => {
        if (captureTerminal(outputPath)) {
          captureCount++;
          const timeStr = new Date().toLocaleTimeString();
          console.log(`   [${timeStr}] ${event.type}: ${event.detail.slice(0, 60)}`);
        }
      }, 500);
    }
  });
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  let sessionFilePath: string;
  let outputDir: string;

  if (args.includes("--auto")) {
    // Auto-detect active session
    const active = findActiveSession();
    if (!active) {
      console.error("No active Claude Code session found.");
      process.exit(1);
    }
    sessionFilePath = active.filePath;
    outputDir = args[args.indexOf("--output") + 1] ??
      join(process.cwd(), "screenshots", active.sessionId.slice(0, 8));
    console.log(`Found active session: ${active.sessionId.slice(0, 8)}`);
    console.log(`Project: ${active.projectName}\n`);
  } else if (args.length >= 1) {
    sessionFilePath = args[0];
    outputDir = args[1] ?? join(process.cwd(), "screenshots", basename(args[0], ".jsonl").slice(0, 8));
  } else {
    console.log("Usage:");
    console.log("  npx tsx src/capture.ts --auto              # auto-detect active session");
    console.log("  npx tsx src/capture.ts <session.jsonl>     # watch specific session");
    console.log("  npx tsx src/capture.ts --auto --output dir # custom output directory");
    process.exit(0);
  }

  if (!existsSync(sessionFilePath)) {
    console.error(`Session file not found: ${sessionFilePath}`);
    process.exit(1);
  }

  await startCapture(sessionFilePath, outputDir);

  // Keep running
  process.on("SIGINT", () => {
    console.log(`\n\n📸 Captured screenshots saved to: ${outputDir}`);
    process.exit(0);
  });
}

main().catch(console.error);
