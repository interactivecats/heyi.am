/** Escape HTML special characters for safe embedding. */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Format LOC as human-readable (e.g. "2.4k"). */
export function formatLoc(loc: number): string {
  if (loc >= 1000) return `${(loc / 1000).toFixed(1)}k`;
  return String(loc);
}

/** Escape LIKE wildcards in user input for safe use in SQL LIKE clauses. */
export function escapeLikeWildcards(str: string): string {
  return str.replace(/[%_]/g, (c) => `\\${c}`);
}
