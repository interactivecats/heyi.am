# Stat Picker UX & Data Model Spec

Design spec for session stats — how they're computed, stored, and surfaced across all three display surfaces.

---

## 1. Where Stats Appear

### Surface A: Portfolio Project Card (`/:username`)

**Current state:** 3 inline stats (sessions, time, LOC) in mono text below the description.

**New state:** Keep the existing 3 inline stats (sessions, time, LOC) as the **fixed row**. Below them, add a **featured stats row** — 2-4 user-picked stats from the STAT_FRAMEWORK catalog.

```
┌─────────────────────────────────────────┐
│ heyi-am                                 │
│ Full-stack portfolio platform...        │
│                                         │
│ 21 sessions   4.2h   8.4k LOC          │  ← fixed (unchanged)
│                                         │
│ Overrides: 75%  ·  Autopilot: 23       │  ← featured stats (picked)
│ Read:write: 4.2:1  ·  Expletives: 14   │
│                                         │
│ Elixir  Phoenix  TypeScript             │  ← skills (unchanged)
└─────────────────────────────────────────┘
```

**Rules:**
- Featured stats render as `label: value` pairs in mono, same weight as the fixed stats
- 2-4 slots. If user picks 0, no featured row shows.
- Stats with zero/boring values auto-hide even if picked (e.g., "Expletives: 0" → hidden)
- Featured stats are **aggregated across all sessions in the project** — they represent the project, not a single session

### Surface B: Project Detail Hero (`/:username/:project`)

**Current state:** 4 stat cards (Time, Sessions, LOC, Files) in a grid.

**New state:** Keep the 4 hero stat cards as-is. Below the hero stats, add a **"Session Stats" section** showing the same 2-4 featured stats as the portfolio card, rendered as a horizontal strip of `label: value` pairs (not cards — lighter weight than the hero).

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│   4.2h   │ │    21    │ │  8.4k    │ │    34    │   ← hero cards (unchanged)
│ Tot Time │ │ Sessions │ │   LOC    │ │  Files   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

Overrides: 75%  ·  Autopilot: 23  ·  Read:write: 4.2:1  ·  Expletives: 14
```

**Rules:**
- Same featured stats as the portfolio card (stored per-project)
- Same zero-value hiding
- Same aggregation (project-level, not session-level)

### Surface C: Session Case Study (`/:username/:project/:slug` or `/s/:token`)

**Current state:** 4-card stats strip (Duration, Turns, Files, LOC Changed).

**New state:** Keep the 4-card strip. Add a **"Session Signals" section** below the dev take / context area, showing ALL computed stats for this session, grouped by the three STAT_FRAMEWORK categories.

```
SESSION SIGNALS
───────────────────────────────────────────
Your Voice
  Expletives: 14        Corrections: 23
  Avg prompt: 47 words  Please rate: 42%
  Questions: 31         Reasoning: 8.2%

The AI's Habits
  Read:write: 4.2:1     Test runs: 12
  Failed tests: 4/12    Apologies: 7
  Self-corrections: 3   Longest chain: 8

The Back-and-forth
  Overrides: 6/8 (75%)  Autopilot: 23
  First blood: 4 min    Recovery: 2.1 turns
  Redirects/hr: 4.2     Scope creep: 2
```

**Rules:**
- No picker here — show everything that has a non-zero/non-boring value
- Group by the three categories with mono-uppercase section headers
- Stats with zero or uninteresting values are hidden (per STAT_FRAMEWORK rules)
- Category headers hide entirely if all stats in them are zero/hidden
- This section is NOT collapsible — it's a first-class part of the case study. Place it after "Applied Skills", before "Session Questions"

---

## 2. The Stat Picker UX

Stats are picked **per project**, not per user. Different projects may have different interesting stats.

### Where it lives: CLI Upload Flow (Screen 47: Review)

The picker appears on the Review screen, inside the project card preview. This is the last step before publish — the user is already looking at their project card and can customize which stats to feature.

```
┌─ Review ─────────────────────────────────────┐
│                                               │
│  Project Card Preview                         │
│  ┌──────────────────────────────────┐         │
│  │ heyi-am                          │         │
│  │ Full-stack portfolio...          │         │
│  │ 21 sessions  4.2h  8.4k LOC     │         │
│  │                                  │         │
│  │ ┌ Featured Stats ──────────────┐ │         │
│  │ │ [x] Overrides: 75%          │ │         │
│  │ │ [x] Read:write: 4.2:1       │ │         │
│  │ │ [x] Autopilot: 23 turns     │ │         │
│  │ │ [ ] Expletives: 0  (hidden) │ │         │
│  │ │                              │ │         │
│  │ │ + Add stat...                │ │         │
│  │ └─────────────────────────────-┘ │         │
│  │ Elixir  Phoenix  TypeScript      │         │
│  └──────────────────────────────────┘         │
│                                               │
│  [Publish project →]                          │
└───────────────────────────────────────────────┘
```

### Interaction Flow

1. **Default state:** The picker shows 4 auto-selected stats (see Defaults below), each with a checkbox. Stats are pre-computed during the Enhance step.

2. **Toggle off:** Uncheck a stat to remove it from the featured row. Unchecked stats stay visible in the picker (greyed) so the user can re-enable them.

3. **Add stat:** Click "+ Add stat" to open a dropdown/popover listing all available stats grouped by category. Each stat shows its computed value. Stats already in the featured list are marked. Select to add.

4. **Max 4:** If the user tries to add a 5th, the oldest (topmost) auto-deselects with a brief shake animation. The constraint is communicated: "Pick up to 4 stats to feature."

5. **Reorder:** Drag handles (or up/down arrows) to reorder. Order is preserved on publish.

6. **Zero-value indicator:** Stats with zero/boring values show "(hidden on portfolio)" in muted text. They're still selectable — if the project later gets sessions with non-zero values (re-publish), they'll appear.

### NOT in the web portfolio editor

There is no web-based stat picker. Stats are chosen during CLI upload. If a user wants to change featured stats, they re-publish the project (which is already an upsert operation).

Rationale: The CLI is the source of truth for stat computation. Computing stats requires access to raw JSONL files. The web app never has access to raw session data — it only receives pre-computed results.

---

## 3. Defaults

When a user publishes a project and never touches the picker, these 4 stats are auto-selected in order:

1. **Overrides that worked** (if any overrides occurred) — the signature heyi.am stat
2. **Read:write ratio** — universally interesting, always non-zero
3. **Longest autopilot** — invites curiosity
4. **Expletives** (if non-zero) OR **"Actually, no" corrections** (if expletives is zero)

### Default selection algorithm

```
candidates = [
  overrides_that_worked  (if overrides > 0),
  read_write_ratio       (always),
  longest_autopilot      (if > 3 turns),
  expletives             (if > 0),
  actually_no            (if > 0),
  first_blood            (if > 2 min),
  test_fail_fix_cycles   (if > 0),
  please_and_thanks      (if > 20%),
  redirects_per_hour     (always),
]
take first 4 from candidates that have non-boring values
```

"Non-boring" thresholds per stat are defined in the stat catalog (see Data Model).

---

## 4. Data Model

### Stat computation: at CLI parse time

Stats are computed by the CLI from raw JSONL files during the Enhance step (Screen 45). This is the only time the CLI has the raw data loaded in memory. Computing 30 stats from a single-pass scan adds negligible overhead to the enhance step.

### Storage: JSONB blob on `projects` and `shares`

#### New column on `shares` table

```sql
ALTER TABLE shares ADD COLUMN session_stats jsonb DEFAULT '{}';
```

Contains all computed stats for a single session:

```json
{
  "your_voice": {
    "expletives": 14,
    "avg_prompt_words": 47,
    "longest_prompt_words": 312,
    "corrections": 23,
    "please_rate": 0.42,
    "questions_asked": 31,
    "code_in_prompts": 18,
    "reasoning_rate": 0.082,
    "one_word_turns": 34,
    "longest_silence_min": 14
  },
  "ai_habits": {
    "apologies": 7,
    "read_write_ratio": 4.2,
    "files_read_not_touched": 23,
    "test_runs": 12,
    "failed_test_runs": 4,
    "longest_tool_chain": 8,
    "self_corrections": 3,
    "unique_tools": 7,
    "lines_generated": 2400,
    "bash_commands": 34
  },
  "back_and_forth": {
    "overrides_worked": [6, 8],
    "longest_autopilot": 23,
    "redirects_per_hour": 4.2,
    "test_fail_fix_cycles": 3,
    "turn_density": 2.3,
    "first_blood_min": 4,
    "recovery_turns": 2.1,
    "handoff_ratio": [0.62, 0.38],
    "scope_creep": 2,
    "session_arc": ["explore", "build", "fix"]
  }
}
```

**Key decisions:**
- Raw numeric values only. Display formatting (labels, units, ratios like "6 of 8 (75%)") happens in the rendering layer, not storage.
- `overrides_worked` stores `[successes, total]` — the template formats it as "6 of 8 (75%)"
- `handoff_ratio` stores `[ai_pct, dev_pct]`
- `session_arc` stores the three phase labels as strings
- Zero values ARE stored (not omitted) — the rendering layer hides them. This lets us distinguish "computed and zero" from "not computed."

#### New columns on `projects` table

```sql
ALTER TABLE projects ADD COLUMN aggregated_stats jsonb DEFAULT '{}';
ALTER TABLE projects ADD COLUMN featured_stat_keys text[] DEFAULT '{}';
```

**`aggregated_stats`**: Same schema as `session_stats` on shares, but values are aggregated across ALL local sessions (not just published ones). The CLI computes this during publish by scanning all local session caches.

Aggregation rules per stat:
- **Sum:** expletives, corrections, questions_asked, code_in_prompts, one_word_turns, apologies, test_runs, failed_test_runs, self_corrections, bash_commands, lines_generated, scope_creep, test_fail_fix_cycles
- **Mean:** avg_prompt_words, please_rate, reasoning_rate, read_write_ratio, turn_density, redirects_per_hour, recovery_turns
- **Max:** longest_prompt_words, longest_silence_min, longest_tool_chain, longest_autopilot, first_blood_min, unique_tools
- **Weighted:** handoff_ratio (weighted by session LOC), overrides_worked (sum numerators / sum denominators)
- **Mode/concatenate:** session_arc (most common pattern, or omit at project level)

**`featured_stat_keys`**: Ordered array of stat keys the user picked in the CLI. Example:

```json
["overrides_worked", "read_write_ratio", "longest_autopilot", "expletives"]
```

Max 4 entries. Stored as keys, not display labels — labels come from the stat catalog at render time.

### Stat catalog (code, not DB)

A module in both the CLI and Phoenix that maps stat keys to display metadata:

```elixir
# Phoenix: lib/heyi_am/stats/catalog.ex
@catalog %{
  "expletives" => %{
    label: "Expletives",
    category: :your_voice,
    format: :integer,        # "14"
    boring_below: 1,         # hidden if 0
    aggregation: :sum
  },
  "read_write_ratio" => %{
    label: "Read:write",
    category: :ai_habits,
    format: :ratio,          # "4.2:1"
    boring_below: nil,       # always interesting
    aggregation: :mean
  },
  "overrides_worked" => %{
    label: "Overrides",
    category: :back_and_forth,
    format: :fraction_pct,   # "6 of 8 (75%)"
    boring_below: 1,         # hidden if 0 total overrides
    aggregation: :sum_fraction
  },
  # ... etc for all ~30 stats
}
```

This catalog is the single source of truth for display labels, formatting, boring thresholds, and aggregation rules. Both the CLI (for the picker UI) and Phoenix (for rendering) use it.

### Migration summary

| Change | Table | Type | Notes |
|--------|-------|------|-------|
| Add `session_stats` | `shares` | jsonb, default `{}` | All stats for one session |
| Add `aggregated_stats` | `projects` | jsonb, default `{}` | Stats across all local sessions |
| Add `featured_stat_keys` | `projects` | text[], default `{}` | User's 2-4 picked stats, ordered |

No changes to existing columns. The current 4 stats (LOC, duration, turns, files) remain as individual columns for backward compat and because they're used in queries/sorts.

---

## 5. Publish Flow Changes

### CLI → Phoenix payload additions

**POST /api/projects** body gains:

```json
{
  "aggregated_stats": { ... },
  "featured_stat_keys": ["overrides_worked", "read_write_ratio", ...]
}
```

**POST /api/sessions** body gains:

```json
{
  "session_stats": { ... }
}
```

### Computation timing

```
CLI Upload Flow
───────────────
Screen 43 (Overview)
  └─ Stats cache already has LOC/duration/turns/files per session

Screen 45 (Enhance) ← STATS COMPUTED HERE
  └─ For each selected session:
       Parse raw JSONL → compute all ~30 stats → store in enhance result
  └─ Aggregate across ALL local sessions → project-level stats

Screen 47 (Review) ← PICKER SHOWN HERE
  └─ Show pre-computed stats in the picker
  └─ User toggles/reorders
  └─ featured_stat_keys stored in enhance result

Publish
  └─ POST /api/projects includes aggregated_stats + featured_stat_keys
  └─ POST /api/sessions includes session_stats per session
```

---

## 6. Rendering Logic (Phoenix)

### Portfolio project card

```elixir
# In portfolio controller
featured = project.featured_stat_keys || []
stats = project.aggregated_stats || %{}
catalog = HeyiAm.Stats.Catalog.all()

displayable_stats =
  featured
  |> Enum.map(fn key -> {catalog[key], get_stat_value(stats, key)} end)
  |> Enum.reject(fn {meta, val} -> boring?(meta, val) end)
```

Template renders `displayable_stats` as `label: formatted_value` pairs.

### Session case study

```elixir
# In share controller
stats = share.session_stats || %{}
catalog = HeyiAm.Stats.Catalog.all()

grouped =
  catalog
  |> Enum.map(fn {key, meta} -> {meta.category, meta, get_stat_value(stats, key)} end)
  |> Enum.reject(fn {_, meta, val} -> boring?(meta, val) end)
  |> Enum.group_by(fn {cat, _, _} -> cat end)
```

Template renders three category sections with all non-boring stats.

---

## 7. Edge Cases

| Scenario | Behavior |
|----------|----------|
| User never touches picker | 4 auto-defaults selected |
| All 4 picked stats are zero/boring | Featured row hidden entirely |
| User re-publishes project | `aggregated_stats` and `featured_stat_keys` upserted |
| Old sessions without `session_stats` | Case study shows only the 4-card strip, no "Session Signals" section |
| Gemini sessions (limited data) | Stats that can't be computed are omitted from `session_stats` (not stored as zero) |
| Session has no user turns | "Your Voice" category hidden entirely |
| `session_arc` (non-numeric) | Rendered as "explore → build → fix" text, not in featured picker (project cards only show numeric stats) |
