/** Shared active-duration computation used by all parsers. */

/** Max gap between consecutive entries before it's considered a break (5 min). */
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

export interface DurationResult {
  duration_ms: number;
  wall_clock_ms: number;
  start_time: string | null;
  end_time: string | null;
  active_intervals: [number, number][];
}

/**
 * Compute active duration from pre-extracted timestamps.
 * Each parser extracts timestamps its own way, then delegates here
 * for the interval-merge algorithm.
 */
export function computeActiveDuration(
  timestamps: number[],
  startStr: string | null,
  endStr: string | null,
): DurationResult {
  if (timestamps.length < 2 || !startStr || !endStr) {
    return { duration_ms: 0, wall_clock_ms: 0, start_time: startStr, end_time: endStr, active_intervals: [] };
  }

  const wallClock = timestamps[timestamps.length - 1] - timestamps[0];

  let activeMs = 0;
  const active_intervals: [number, number][] = [];
  let intervalStart = timestamps[0];

  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap < IDLE_THRESHOLD_MS) {
      activeMs += gap;
    } else {
      active_intervals.push([intervalStart, timestamps[i - 1]]);
      intervalStart = timestamps[i];
    }
  }
  active_intervals.push([intervalStart, timestamps[timestamps.length - 1]]);

  return {
    duration_ms: Math.max(activeMs, 0),
    wall_clock_ms: Math.max(wallClock, 0),
    start_time: startStr,
    end_time: endStr,
    active_intervals,
  };
}
