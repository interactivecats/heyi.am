// Session Archive — preserves session files via hard links to prevent
// loss from Claude Code's 30-day auto-cleanup (and future cleanup by
// other tools like Cursor, Codex, Gemini).
//
// Hard links point to the same inode — zero extra disk space. When the
// original tool deletes its copy, the archive reference survives.

import { link, copyFile, stat, mkdir, readdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { getArchiveDir, isArchiveEnabled } from "./settings.js";
import type { SessionMeta } from "./parsers/index.js";

export interface ArchiveResult {
  archived: number;
  alreadyArchived: number;
  failed: number;
}

/**
 * Archive all discovered session files via hard links.
 * Idempotent: skips files that already exist in the archive.
 * Falls back to copyFile if hard link fails (cross-filesystem, permissions).
 */
export async function archiveSessionFiles(
  sessions: SessionMeta[],
  configDir?: string,
): Promise<ArchiveResult> {
  if (!isArchiveEnabled(configDir)) {
    return { archived: 0, alreadyArchived: 0, failed: 0 };
  }

  const archiveBase = getArchiveDir(configDir);
  const result: ArchiveResult = { archived: 0, alreadyArchived: 0, failed: 0 };

  for (const session of sessions) {
    // Skip virtual paths (e.g., cursor:// URLs)
    if (!session.path.startsWith("/")) continue;

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

  return result;
}

/**
 * Compute the archive destination path from the original path.
 * Preserves the relative structure under the project directory.
 *
 * Original: ~/.claude/projects/{projectDir}/{sessionId}.jsonl
 * Archive:  ~/.config/heyiam/sessions/{projectDir}/{sessionId}.jsonl
 *
 * Original: ~/.claude/projects/{projectDir}/{parentId}/subagents/{childId}.jsonl
 * Archive:  ~/.config/heyiam/sessions/{projectDir}/{parentId}/subagents/{childId}.jsonl
 */
function archiveDestination(
  originalPath: string,
  archiveBase: string,
  projectDir: string,
): string {
  // Find the project dir in the path and take everything after it
  const projectDirIdx = originalPath.indexOf(`/${projectDir}/`);
  if (projectDirIdx !== -1) {
    const relativePath = originalPath.slice(projectDirIdx + 1); // includes projectDir/...
    return join(archiveBase, relativePath);
  }

  // Fallback: use projectDir + filename
  return join(archiveBase, projectDir, basename(originalPath));
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
