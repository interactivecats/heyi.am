// Session Archive — preserves session files across all supported tools.
//
// Claude Code, Codex, Gemini: hard links (zero extra disk space).
// Cursor: exports conversation data as JSONL (Cursor stores in its own SQLite DB).
//
// When the original tool deletes its copy, the archive reference survives.

import { link, copyFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { getArchiveDir, isArchiveEnabled } from "./settings.js";
import { isCursorPath } from "./parsers/cursor.js";
import type { SessionMeta } from "./parsers/index.js";

export interface ArchiveResult {
  archived: number;
  alreadyArchived: number;
  failed: number;
  cursorExported: number;
}

/**
 * Archive all discovered session files.
 * - File-based sources (Claude, Codex, Gemini): hard link or copy
 * - Cursor: export conversation data as JSONL to archive dir
 * Idempotent: skips files that already exist in the archive.
 */
export async function archiveSessionFiles(
  sessions: SessionMeta[],
  configDir?: string,
): Promise<ArchiveResult> {
  if (!isArchiveEnabled(configDir)) {
    return { archived: 0, alreadyArchived: 0, failed: 0, cursorExported: 0 };
  }

  const archiveBase = getArchiveDir(configDir);
  const result: ArchiveResult = { archived: 0, alreadyArchived: 0, failed: 0, cursorExported: 0 };

  for (const session of sessions) {
    if (isCursorPath(session.path)) {
      // Cursor: export conversation as JSONL to archive
      await archiveCursorSession(session, archiveBase, result);
    } else if (session.path.startsWith("/")) {
      // File-based: hard link or copy
      await archiveFile(session.path, archiveBase, session.projectDir, result);

      // Archive subagent files
      for (const child of session.children ?? []) {
        if (!child.path.startsWith("/")) continue;
        await archiveFile(child.path, archiveBase, session.projectDir, result);

        // Archive the .meta.json alongside the child .jsonl
        const metaPath = child.path.replace(/\.jsonl$/, ".meta.json");
        await archiveFile(metaPath, archiveBase, session.projectDir, result);
      }
    }
  }

  return result;
}

/**
 * Compute the archive destination path from the original path.
 * Preserves the relative structure under the project directory.
 *
 * Claude:  ~/.claude/projects/{projectDir}/{sessionId}.jsonl
 *       →  ~/.config/heyiam/sessions/{projectDir}/{sessionId}.jsonl
 *
 * Codex:   ~/.codex/sessions/{nested}/{rollout-xxx}.jsonl
 *       →  ~/.config/heyiam/sessions/{projectDir}/{rollout-xxx}.jsonl
 *
 * Gemini:  ~/.gemini/tmp/{hash}/logs.json
 *       →  ~/.config/heyiam/sessions/{projectDir}/{hash}.json
 */
function archiveDestination(
  originalPath: string,
  archiveBase: string,
  projectDir: string,
): string {
  // Claude: find the project dir in the path and take everything after it
  const projectDirIdx = originalPath.indexOf(`/${projectDir}/`);
  if (projectDirIdx !== -1) {
    const relativePath = originalPath.slice(projectDirIdx + 1);
    return join(archiveBase, relativePath);
  }

  // Codex/Gemini: use projectDir + filename
  return join(archiveBase, projectDir, basename(originalPath));
}

/**
 * Archive a Cursor session by exporting its parsed data as JSONL.
 * Cursor stores conversations in its own SQLite DB — we can't hard-link.
 * Instead, we parse the conversation and write it as a JSONL file.
 */
async function archiveCursorSession(
  session: SessionMeta,
  archiveBase: string,
  result: ArchiveResult,
): Promise<void> {
  const dest = join(archiveBase, session.projectDir, `cursor-${session.sessionId}.jsonl`);

  try {
    // Check if already archived
    const destStat = await stat(dest).catch(() => null);
    if (destStat) {
      result.alreadyArchived++;
      return;
    }

    // Parse the Cursor session to get raw entries
    const { parseSession } = await import("./parsers/index.js");
    const analysis = await parseSession(session.path);

    // Write raw entries as JSONL
    await mkdir(dirname(dest), { recursive: true });
    const lines = analysis.raw_entries.map((entry) => JSON.stringify(entry));
    await writeFile(dest, lines.join("\n") + "\n", "utf-8");

    result.cursorExported++;
    result.archived++;
  } catch {
    result.failed++;
  }
}

async function archiveFile(
  sourcePath: string,
  archiveBase: string,
  projectDir: string,
  result: ArchiveResult,
): Promise<void> {
  const dest = archiveDestination(sourcePath, archiveBase, projectDir);

  try {
    // Check if source exists
    const sourceStat = await stat(sourcePath).catch(() => null);
    if (!sourceStat) return; // Source doesn't exist (e.g., meta.json for agents without one)

    // Check if destination already exists
    const destStat = await stat(dest).catch(() => null);
    if (destStat) {
      // Already archived (same inode = hard link, or previously copied)
      result.alreadyArchived++;
      return;
    }

    // Ensure destination directory exists
    await mkdir(dirname(dest), { recursive: true });

    // Try hard link first (zero disk cost)
    try {
      await link(sourcePath, dest);
    } catch {
      // Fallback to copy (cross-filesystem, Windows without permissions, etc.)
      await copyFile(sourcePath, dest);
    }
    result.archived++;
  } catch {
    result.failed++;
  }
}
