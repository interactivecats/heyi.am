# Session Stats

Three categories of stats extractable from raw session transcripts. Each stat should feel like something a dev would brag about (or cringe at) — not something a PM put on a dashboard.

---

## Category 1: Your Voice

_What your prompts say about you._

Stats from the developer's side of the conversation — the things you typed, the way you typed them, the habits you didn't know you had.

| Label | Example | Signal quality |
|-------|---------|---------------|
| **Expletives** — 14 across 8 sessions | `"shit", "damn", "wtf"` in user turns | Genuinely interesting. Shows real frustration moments. |
| **Average prompt** — 47 words | Mean word count per user turn | Interesting at extremes. "12 words" = terse commander. "180 words" = thinking out loud. |
| **Longest prompt** — 312 words | Max single user message length | That one time you wrote an essay to the AI. |
| **"Actually, no"** — 23 corrections | User turns with "no", "wrong", "stop", "actually", "not that", "undo" | Core stat. Direct measure of how much you steer. |
| **Please & thanks** — 42% of turns | Turns containing "please", "thanks", "thank you", "sorry" | Fun/personality. Splits devs into "polite prompters" and "command-line barkers." |
| **Questions asked** — 31 | User turns ending in `?` or starting with "why", "how", "what" | High count = you're interrogating, not just directing. |
| **Code in prompts** — 18 pastes | User turns with code blocks, file paths, or stack traces | Shows whether you describe problems or show them. |
| **Reasoning words** — 8.2% of turns | Turns with "because", "trade-off", "instead", "approach", "design", "rather" | Core stat. This is the heyi.am signal — thinking out loud. |
| **One-word turns** — 34 | User turns that are 1-3 words ("yes", "do it", "looks good") | High ratio = trust. You're rubber-stamping. |
| **Longest silence** — 14 min | Max gap between consecutive user turns | That moment you went to read the docs or question your career. |

---

## Category 2: The AI's Habits

_What the AI actually did when you weren't looking._

Stats from the AI's tool calls, responses, and behavioral patterns.

| Label | Example | Signal quality |
|-------|---------|---------------|
| **Apologies** — 7 "sorry"s | AI turns with "sorry", "apologies", "my mistake" | Each apology is an admission of failure. High count = rough session. |
| **Read:write ratio** — 4.2:1 | Ratio of Read/Grep/Glob calls to Edit/Write calls | Core stat. High = careful. Low = yolo cowboy coding. |
| **Files read, never touched** — 23 | Files opened by Read/Grep that never appeared in Edit/Write | How much context-gathering happened before any changes. |
| **Test runs** — 12 attempts | Bash calls containing "test", "pytest", "jest", "mix test", "cargo test" | Core stat. Zero = shipped without testing. |
| **Failed test runs** — 4 of 12 | Test runs with non-zero exit or "FAILED" in output | Interesting as a ratio. 4/12 = real debugging happened. |
| **Longest tool chain** — 8 calls | Max consecutive AI tool calls without a user turn | Shows autonomy depth. 2 = micromanaged. 15 = adventure. |
| **Self-corrections** — 3 | AI editing a file it already edited without user prompt | AI fixing its own mistakes. |
| **Unique tools** — 7 of 9 | Count of distinct tool types used | Read+Edit = routine. Full toolkit = complex problem. |
| **Lines generated** — 2.4k | Total lines in Edit/Write additions | Context stat. Useful as denominator. |
| **Bash commands** — 34 | Count of Bash tool calls | Interesting at extremes. High = running things, not just editing. |

---

## Category 3: The Back-and-forth

_How you and the AI actually collaborated._

Stats from the interaction pattern — override rates, trust streaks, debugging cycles.

| Label | Example | Signal quality |
|-------|---------|---------------|
| **Overrides that worked** — 6 of 8 (75%) | Corrections followed by successful tool calls (no error in next 3 turns) | Core stat. You were right to push back. Or you weren't. |
| **Longest autopilot** — 23 turns | Max consecutive turns without a user correction | The longest stretch of trust. What was the AI doing? |
| **Redirects per hour** — 4.2 | Corrections normalized by session duration | Core stat. Low = trust. High = wrestling match. |
| **Test-fail-fix cycles** — 3 | Sequences: test → failure → edit → test → pass | Real debugging loops. |
| **Turn density** — 2.3/min | Total turns divided by active duration | Fast back-and-forth vs slow, deliberate exchanges. |
| **First blood** — 4 min | Time from session start to first user correction | How long before you disagreed with the AI? |
| **Recovery time** — avg 2.1 turns | Mean turns from failed tool call to successful one | How quickly the pair bounces back. |
| **Handoff ratio** — 62% AI / 38% dev | Percentage of total LOC from AI edits vs user-pasted code | Who actually wrote the code? |
| **Scope creep moments** — 2 | User turns introducing new files/features mid-session | We've all done it. |
| **Session arc** — explore → build → fix | Dominant activity per third of session | Your working pattern. Not a number — a shape. |

---

## Display Rules

### Tone rules

- Labels are short. "Apologies: 7" not "Number of AI apology instances: 7"
- Units are implicit or minimal. "47 words" not "47 words per turn (mean)"
- Context beats precision. "4.2:1" is fine. "4.2381:1" is not.
- Zero is interesting when it should be non-zero. "Test runs: 0" tells a story. "Scope creep: 0" does not — just hide it.
- The stat label should make you curious. "First blood: 4 min" > "Average time to first correction: 4 minutes"

### Anti-fluff filter

A stat earns its place if it passes ONE of:
1. **Would a dev mention it at a bar?** "I overrode the AI 23 times and was right 75% of the time" — yes.
2. **Does it differentiate?** If every session has roughly the same value, it's noise.
3. **Does it invite a follow-up question?** "Longest autopilot: 23 turns" makes you wonder what the AI was doing.

### Vanity warnings (never surface these)

- Total words typed, vocabulary diversity, emoji usage
- Total tokens used, response length, raw tool call count
- Total turns, session duration (already basic stats)
- Any "collaboration score" composite index

---

## Where Stats Appear

### Portfolio Project Card (`/:username`)

3 fixed inline stats (sessions, time, LOC) plus 2-4 user-picked **featured stats** below:

```
21 sessions   4.2h   8.4k LOC          ← fixed
Overrides: 75%  ·  Autopilot: 23       ← featured (picked)
Read:write: 4.2:1  ·  Expletives: 14
```

- Featured stats render as `label: value` pairs in mono
- 2-4 slots. If user picks 0, no featured row shows.
- Stats with zero/boring values auto-hide even if picked
- Aggregated across all sessions in the project

### Project Detail Hero (`/:username/:project`)

4 hero stat cards (Time, Sessions, LOC, Files) plus featured stats as a horizontal strip below:

```
Overrides: 75%  ·  Autopilot: 23  ·  Read:write: 4.2:1  ·  Expletives: 14
```

Same featured stats as the portfolio card (stored per-project).

### Session Case Study (`/:username/:project/:slug` or `/s/:token`)

4-card strip (Duration, Turns, Files, LOC Changed) plus **all** computed stats grouped by category:

```
SESSION SIGNALS
───────────────────────────────────────────
Your Voice
  Expletives: 14        Corrections: 23
  Avg prompt: 47 words  Please rate: 42%

The AI's Habits
  Read:write: 4.2:1     Test runs: 12
  Failed tests: 4/12    Apologies: 7

The Back-and-forth
  Overrides: 6/8 (75%)  Autopilot: 23
  First blood: 4 min    Recovery: 2.1 turns
```

No picker — show everything non-zero. Category headers hide if all stats are zero.

---

## Stat Picker UX

Stats are picked **per project** in the CLI upload flow (Review step).

### Interaction

1. **Default:** 4 auto-selected stats shown with checkboxes (see defaults below)
2. **Toggle off:** Uncheck to remove from featured row
3. **Add stat:** Dropdown listing all stats grouped by category with computed values
4. **Max 4:** Adding a 5th auto-deselects the oldest
5. **Reorder:** Drag handles or up/down arrows
6. **Zero-value indicator:** Shows "(hidden on portfolio)" in muted text

No web-based stat picker. Stats are chosen during CLI upload. Re-publish to change.

### Default Selection

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
take first 4 with non-boring values
```

---

## Data Model

### Storage

Stats computed at CLI parse time during Enhance step. Stored as JSONB:

| Column | Table | Contents |
|--------|-------|----------|
| `session_stats` | `shares` | All stats for one session |
| `aggregated_stats` | `projects` | Stats across all local sessions |
| `featured_stat_keys` | `projects` | User's 2-4 picked stats, ordered (`text[]`) |

### JSON schema

```json
{
  "your_voice": {
    "expletives": 14,
    "avg_prompt_words": 47,
    "corrections": 23,
    "please_rate": 0.42,
    "question_rate": 0.31,
    "reasoning_rate": 0.082
  },
  "ai_habits": {
    "apologies": 7,
    "read_write_ratio": 4.2,
    "test_runs": 12,
    "failed_test_runs": 4,
    "longest_tool_chain": 8,
    "self_corrections": 3
  },
  "back_and_forth": {
    "overrides_worked": [6, 8],
    "longest_autopilot": 23,
    "redirects_per_hour": 4.2,
    "first_blood_min": 4,
    "scope_creep": 2
  }
}
```

Raw numeric values only. Display formatting happens in the rendering layer. Zero values ARE stored (distinguishes "computed and zero" from "not computed").

### Aggregation rules

- **Sum:** expletives, corrections, apologies, test_runs, failed_test_runs, self_corrections, bash_commands, scope_creep
- **Mean:** avg_prompt_words, please_rate, reasoning_rate, read_write_ratio, turn_density, redirects_per_hour
- **Max:** longest_prompt_words, longest_tool_chain, longest_autopilot, first_blood_min, unique_tools
- **Weighted:** overrides_worked (sum numerators / sum denominators)

### Stat catalog

A module in both CLI and Phoenix maps stat keys to display metadata:

```elixir
@catalog %{
  "expletives" => %{label: "Expletives", category: :your_voice, format: :integer, boring_below: 1, aggregation: :sum},
  "read_write_ratio" => %{label: "Read:write", category: :ai_habits, format: :ratio, boring_below: nil, aggregation: :mean},
  "overrides_worked" => %{label: "Overrides", category: :back_and_forth, format: :fraction_pct, boring_below: 1, aggregation: :sum_fraction},
}
```

Single source of truth for labels, formatting, boring thresholds, and aggregation rules.

### API payload additions

**POST /api/projects:** `aggregated_stats`, `featured_stat_keys`
**POST /api/sessions:** `session_stats`
