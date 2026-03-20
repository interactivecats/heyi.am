import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking" | "progress";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  tool_use_id?: string;
  is_error?: boolean;
  thinking?: string;
  signature?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface SessionEntry {
  type: "user" | "assistant" | "system" | "file-history-snapshot" | "progress";
  parentUuid?: string | null;
  uuid?: string;
  timestamp?: string;
  message?: Message;
  isSidechain?: boolean;
  sessionId?: string;
  version?: string;
  gitBranch?: string;
  cwd?: string;
  userType?: string;
  requestId?: string;
  toolUseResult?: string;
  sourceToolAssistantUUID?: string;
}

export interface SessionInfo {
  id: string;
  project: string;
  projectPath: string;
  entries: SessionEntry[];
  filePath: string;
  fileSize: number;
  lastModified: Date;
}

export interface ProjectInfo {
  name: string;
  path: string;
  displayName: string;
  sessions: { id: string; filePath: string; fileSize: number; lastModified: Date }[];
}

const CLAUDE_DIR = join(homedir(), ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

/** Derive a human-readable project name from the resolved directory path. */
export function detectProjectDisplayName(dirPath: string): string {
  // Try package.json
  const pkgPath = join(dirPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name && typeof pkg.name === "string") return pkg.name;
    } catch { /* ignore */ }
  }

  // Try Cargo.toml
  const cargoPath = join(dirPath, "Cargo.toml");
  if (existsSync(cargoPath)) {
    try {
      const cargo = readFileSync(cargoPath, "utf-8");
      const match = cargo.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (match) return match[1];
    } catch { /* ignore */ }
  }

  // Try pyproject.toml
  const pyPath = join(dirPath, "pyproject.toml");
  if (existsSync(pyPath)) {
    try {
      const py = readFileSync(pyPath, "utf-8");
      const match = py.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (match) return match[1];
    } catch { /* ignore */ }
  }

  // Try go.mod
  const goPath = join(dirPath, "go.mod");
  if (existsSync(goPath)) {
    try {
      const go = readFileSync(goPath, "utf-8");
      const match = go.match(/^module\s+(\S+)/m);
      if (match) return match[1].split("/").pop() || match[1];
    } catch { /* ignore */ }
  }

  // Fallback: last segment of the path
  return basename(dirPath);
}

export function decodeProjectPath(encoded: string): string {
  // The encoded path uses the cwd with / replaced by -
  // But we can't naively reverse it since directory names can contain -
  // Instead, peek at the first session entry's cwd field for the real path
  return encoded; // Placeholder — resolved from session data when available
}

export function resolveProjectPath(encoded: string): string {
  const projectDir = join(PROJECTS_DIR, encoded);
  // Try to read the cwd from the first entry of any session file
  const files = existsSync(projectDir)
    ? readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"))
    : [];
  for (const f of files) {
    try {
      const firstLine = readFileSync(join(projectDir, f), "utf-8").split("\n")[0];
      if (firstLine) {
        const entry = JSON.parse(firstLine);
        if (entry.cwd) return entry.cwd;
      }
    } catch {
      continue;
    }
  }
  // Cannot safely decode — hyphens in directory names are ambiguous
  return encoded;
}

export function listProjects(): ProjectInfo[] {
  if (!existsSync(PROJECTS_DIR)) return [];

  return readdirSync(PROJECTS_DIR)
    .filter((d) => {
      const full = join(PROJECTS_DIR, d);
      return statSync(full).isDirectory();
    })
    .map((dir) => {
      const projectDir = join(PROJECTS_DIR, dir);
      const sessions = readdirSync(projectDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => {
          const filePath = join(projectDir, f);
          const stat = statSync(filePath);
          return {
            id: basename(f, ".jsonl"),
            filePath,
            fileSize: stat.size,
            lastModified: stat.mtime,
          };
        })
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      const resolvedPath = resolveProjectPath(dir);
      return {
        name: dir,
        path: resolvedPath,
        displayName: detectProjectDisplayName(resolvedPath),
        sessions,
      };
    })
    .filter((p) => p.sessions.length > 0)
    .sort((a, b) => {
      const aLatest = a.sessions[0]?.lastModified.getTime() ?? 0;
      const bLatest = b.sessions[0]?.lastModified.getTime() ?? 0;
      return bLatest - aLatest;
    });
}

export function parseSession(filePath: string): SessionEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const entries: SessionEntry[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  return entries;
}

export function loadSession(projectName: string, sessionId: string): SessionInfo {
  const projectDir = join(PROJECTS_DIR, projectName);
  const filePath = join(projectDir, `${sessionId}.jsonl`);

  if (!existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const stat = statSync(filePath);
  const entries = parseSession(filePath);

  return {
    id: sessionId,
    project: projectName,
    projectPath: resolveProjectPath(projectName),
    entries,
    filePath,
    fileSize: stat.size,
    lastModified: stat.mtime,
  };
}

export function getToolResultContent(
  projectName: string,
  sessionId: string,
  toolUseId: string
): string | null {
  // Validate toolUseId to prevent path traversal (same rules as other params)
  if (!/^[a-zA-Z0-9_-]+$/.test(toolUseId)) {
    return null;
  }
  const toolResultPath = join(
    PROJECTS_DIR,
    projectName,
    sessionId,
    "tool-results",
    `${toolUseId}.txt`
  );
  // Extra safety: ensure resolved path stays within PROJECTS_DIR
  const resolved = join(toolResultPath);
  if (!resolved.startsWith(PROJECTS_DIR)) {
    return null;
  }
  if (existsSync(toolResultPath)) {
    return readFileSync(toolResultPath, "utf-8");
  }
  return null;
}
