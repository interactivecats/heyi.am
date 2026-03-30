# Duration Calculation: Human Hours vs Agent Hours

How heyi.am computes "how long did this take?" at the session and project level.

---

## The Problem

A developer can run multiple AI coding sessions in parallel. If three Claude sessions run simultaneously for one hour each, the human spent **1 hour** of their time, but the AI agents performed **3 hours** of work. Naively summing session durations double-counts the human's time.

Additionally, sessions have idle gaps. A developer might get a response at 9:05am and not respond until 11:00am. That 2-hour gap should not count as active time.

---

## Two Metrics

### Human Hours ("You")

**What it measures:** How long was the human actively engaged? One human, one chair, one span of attention. Cannot exceed wall-clock time.

**How it's computed:**

1. **Per-session:** Each parser computes `active_intervals` — a list of `[startMs, endMs]` pairs representing bursts of activity. Consecutive messages less than 5 minutes apart (the `IDLE_THRESHOLD_MS`) belong to the same interval. Gaps >= 5 minutes split intervals.

   ```
   Timestamps: 9:00, 9:02, 9:05, [2hr gap], 11:00, 11:03, 11:10
   Active intervals: [(9:00, 9:05), (11:00, 11:10)]
   Per-session duration: 5 + 10 = 15 min
   ```

2. **Per-project:** Collect all `active_intervals` from non-subagent sessions, then merge overlapping intervals using a standard interval-merge algorithm (sort by start, sweep forward). The sum of merged intervals is the true human hours.

   ```
   Session A: [(9:00, 9:30), (11:00, 11:30)]
   Session B: [(9:15, 9:45)]
   Session C: [(10:00, 10:20)]

   Merged:    [(9:00, 9:45), (10:00, 10:20), (11:00, 11:30)]
   Human hours: 45 + 20 + 30 = 95 min
   ```

### Agent Hours ("Agents")

**What it measures:** Total AI compute work performed. Like CPU-hours — parallel work is additive.

**How it's computed:** Simple sum of `duration_minutes` across ALL sessions (including subagents). Three agents running in parallel for 1 hour = 3 agent-hours.

### The Ratio

The ratio between human and agent hours shows **leverage**:
- "1h / 3h" = "You spent 1 hour and got 3 hours of AI work done"
- "2h / 2h" = sequential work, no parallelism

---

## Per-Session Display

Individual session `durationMinutes` is unchanged — it's the sum of that session's own active intervals. This correctly represents how much active work happened in that session, even if another session was running simultaneously.

The "You / Agent" split within a session shows parent active time vs child (subagent) active time.

---

## Data Flow

```
Parser (claude.ts, codex.ts, etc.)
  └─ computeDuration() returns active_intervals: [number, number][]
      └─ Bridge (bridge.ts)
          └─ bridgeToAnalyzer() passes activeIntervals to Session
              └─ DB (db.ts)
                  └─ active_intervals stored as JSON TEXT column
                      └─ Aggregation (context.ts, export.ts)
                          └─ mergeActiveIntervals() + sumIntervalMs()
                              └─ Project-level "You" time
```

---

## Edge Cases

| Scenario | Human hours | Agent hours |
|----------|------------|-------------|
| 3 parallel sessions, 1hr each | 1h | 3h |
| Half-overlap: A(0-60min), B(30-90min) | 90min | 120min |
| Session with 2hr idle gap | Only active bursts counted | Same |
| Another session during idle gap | Each active burst counted once | Additive |
| Session with no timestamps | 0 | 0 |
| Subagent works 10min while human waits | Excluded from human hours (gap > threshold) | Included |
| Pre-v4 data (no intervals stored) | Falls back to naive sum | Same as before |

---

## Implementation

- **Interval merge:** `mergeActiveIntervals()` in `cli/src/bridge.ts` — O(n log n) sort + O(n) sweep
- **DB column:** `active_intervals TEXT` on `sessions` table (JSON array of `[startMs, endMs]` pairs)
- **Migration:** Schema v4 adds the column; sessions are re-parsed on next index to populate it
- **Idle threshold:** `IDLE_THRESHOLD_MS = 5 * 60 * 1000` (5 minutes) — defined in each parser's types
