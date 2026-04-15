// Source Audit — cross-references live sessions with the archive to
// produce per-source scan results and archive health metrics.

import { SOURCE_DISPLAY_NAMES, type SessionSource } from "./parsers/types.js";
import { getDatabase, getSessionCount } from "./db.js";

// ── Types (match frontend types.ts) ──────────────────────────

export interface SourceInfo {
  name: string;
  path: string;
  dateRange: string;
  liveCount: number;
  archivedCount: number;
  retentionRisk?: string;
  health: "healthy" | "warning" | "error";
}

export interface SourceAuditResult {
  sources: SourceInfo[];
}

export interface ArchiveStats {
  total: number;
  oldest: string;
  sourcesCount: number;
  lastSync: string;
  diskUsage?: string;
}

// ── Source paths ─────────────────────────────────────────────

const SOURCE_PATHS: Record<string, string> = {
  claude: "~/.claude/projects",
  cursor: "~/Library/Application Support/Cursor",
  codex: "~/.codex",
  gemini: "~/.gemini/sessions",
};

// ── Retention policy ────────────────────────────────────────

const RETENTION_DAYS: Partial<Record<string, number>> = {
  claude: 30,
};

// ── Main functions ──────────────────────────────────────────

/**
 * Assemble per-source scan results by cross-referencing live sessions
 * (from parser discovery) with archived sessions on disk.
 */
export async function getSourceAudit(configDir?: string): Promise<SourceAuditResult> {
  // Read both live and archived counts from SQLite (fast)
  const archivedBySource = await countArchivedBySource(configDir);

  // Live counts from DB — sessions grouped by source
  const liveBySource = new Map<string, number>();
  try {
    const db = getDatabase();
    if (getSessionCount(db) > 0) {
      const rows = db.prepare(
        'SELECT source, COUNT(*) as c FROM sessions WHERE is_subagent = 0 GROUP BY source',
      ).all() as Array<{ source: string; c: number }>;
      for (const row of rows) {
        liveBySource.set(row.source, row.c);
      }
    }
  } catch { /* DB not ready */ }

  // Collect all source keys that appear in either live or archive
  const allSourceKeys = new Set<string>([
    ...liveBySource.keys(),
    ...archivedBySource.keys(),
  ]);

  const sources: SourceInfo[] = [];
  for (const source of allSourceKeys) {
    const archivedCount = archivedBySource.get(source) ?? 0;
    const liveCount = liveBySource.get(source) ?? 0;
    const displayName = SOURCE_DISPLAY_NAMES[source as SessionSource] ?? source;
    const path = SOURCE_PATHS[source] ?? "unknown";

    // Date range from DB
    let dateRange = `${liveCount} sessions`;
    try {
      const db = getDatabase();
      const row = db.prepare(
        'SELECT MIN(start_time) as earliest, MAX(start_time) as latest FROM sessions WHERE source = ? AND is_subagent = 0',
      ).get(source) as { earliest: string | null; latest: string | null } | undefined;
      if (row?.earliest && row?.latest) {
        const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateRange = `${fmt(row.earliest)} – ${fmt(row.latest)}`;
      }
    } catch { /* ok */ }

    const retentionRisk = getRetentionRisk(source);
    const health = assessHealth(liveCount, archivedCount, source);

    sources.push({
      name: displayName,
      path,
      dateRange,
      liveCount,
      archivedCount,
      retentionRisk,
      health,
    });
  }

  sources.sort((a, b) => b.archivedCount - a.archivedCount || b.liveCount - a.liveCount);

  return { sources };
}

/**
 * Return archive-level statistics: total preserved sessions, oldest session
 * date, source count, last sync time.
 *
 * Reads from the SQLite `sessions` table rather than walking the filesystem
 * archive dir. The DB is authoritative for "what's been preserved" — the
 * filesystem archive is a secondary copy, and the previous version reported
 * `total: 0` whenever the archive dir was empty even though the sessions
 * table held hundreds of indexed sessions. That made the top card diverge
 * from the "By source" table directly beneath it, which was the bug the
 * user called out.
 */
export async function getArchiveStats(_configDir?: string): Promise<ArchiveStats> {
  let total = 0;
  let oldestIso: string | null = null;
  let lastSyncMs = 0;
  const sourcesFound = new Set<string>();

  try {
    const db = getDatabase();

    const totalRow = db.prepare(
      'SELECT COUNT(*) as c, MIN(start_time) as earliest FROM sessions WHERE is_subagent = 0',
    ).get() as { c: number; earliest: string | null };
    total = totalRow.c;
    oldestIso = totalRow.earliest;

    const sourceRows = db.prepare(
      'SELECT DISTINCT source FROM sessions WHERE is_subagent = 0',
    ).all() as Array<{ source: string }>;
    for (const row of sourceRows) sourcesFound.add(row.source);

    // Last sync = newest indexed_at (the clock set when sync wrote the row).
    const syncRow = db.prepare(
      'SELECT MAX(indexed_at) as latest FROM sessions WHERE is_subagent = 0',
    ).get() as { latest: string | null };
    if (syncRow.latest) {
      const ms = Date.parse(syncRow.latest);
      if (!Number.isNaN(ms)) lastSyncMs = ms;
    }
  } catch {
    // DB not ready — return empty state.
  }

  const oldest = oldestIso
    ? formatMonthYear(new Date(oldestIso))
    : "none";

  const lastSync = lastSyncMs === 0
    ? "never"
    : formatRelativeTime(lastSyncMs);

  return {
    total,
    oldest,
    sourcesCount: sourcesFound.size,
    lastSync,
  };
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Count archived .jsonl files per source tool by scanning the archive
 * directory structure. Since archive files don't embed source metadata
 * in their filenames, we detect source by sampling the first file in
 * each project directory.
 */
/**
 * Count archived sessions per source from the SQLite DB.
 * The DB is the real archive — it knows every indexed session by source.
 * This is more accurate than counting files, since one file can contain
 * multiple sessions (Gemini) and some sources don't have files (Cursor).
 */
async function countArchivedBySource(_configDir?: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  try {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT source, COUNT(*) as c FROM sessions WHERE is_subagent = 0 GROUP BY source',
    ).all() as Array<{ source: string; c: number }>;

    for (const row of rows) {
      counts.set(row.source, row.c);
    }
  } catch {
    // DB not available — fall back to 0
  }

  return counts;
}

function getRetentionRisk(source: string): string | undefined {
  const days = RETENTION_DAYS[source];
  if (!days) return undefined;
  return `${days}-day`;
}

function assessHealth(
  liveCount: number,
  archivedCount: number,
  source: string,
): "healthy" | "warning" | "error" {
  // No sessions at all — error
  if (liveCount === 0 && archivedCount === 0) return "error";

  // Has a retention risk and no archive coverage — warning
  if (RETENTION_DAYS[source] && archivedCount === 0 && liveCount > 0) return "warning";

  // Has retention risk and archive covers less than half of live — warning
  if (RETENTION_DAYS[source] && archivedCount < liveCount / 2) return "warning";

  return "healthy";
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
