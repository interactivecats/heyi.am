/** Escape HTML special characters for safe embedding. */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Format LOC as human-readable (e.g. "2.4k"). */
export function formatLoc(loc: number): string {
  if (loc >= 1000) return `${(loc / 1000).toFixed(1)}k`;
  return String(loc);
}

/** Derive a human-readable project name from the encoded directory name. */
export function displayNameFromDir(dirName: string): string {
  const devIdx = dirName.indexOf('-Dev-');
  if (devIdx !== -1) return dirName.slice(devIdx + 5);
  const segments = dirName.split('-').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : dirName;
}

/** Generate a URL-safe slug from a string. */
export function toSlug(s: string, maxLen?: number): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return maxLen !== undefined ? slug.slice(0, maxLen) : slug;
}

/** Escape LIKE wildcards in user input for safe use in SQL LIKE clauses. */
export function escapeLikeWildcards(str: string): string {
  return str.replace(/[%_]/g, (c) => `\\${c}`);
}
