/** Format duration in minutes as human-readable (e.g. "1.5h" or "45m"). */
export function formatDuration(minutes: number): string {
  const hours = minutes / 60;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`;
}

/** Format lines-changed count as human-readable (e.g. "2.4k"). */
export function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc);
}
