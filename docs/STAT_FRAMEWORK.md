# Session Stats Framework

Three categories of stats extractable from raw session transcripts. Each stat should feel like something a dev would brag about (or cringe at) — not something a PM put on a dashboard.

---

## Category 1: Your Voice

_What your prompts say about you._

These stats come from the developer's side of the conversation — the things you typed, the way you typed them, the habits you didn't know you had. This is the personality layer. Nobody else's session data looks like yours.

### Stats

| Label | Example | Signal quality |
|-------|---------|---------------|
| **Expletives** — 14 across 8 sessions | `"shit", "damn", "wtf"` in user turns | **Genuinely interesting.** Shows real frustration moments. The number alone tells a story. |
| **Average prompt** — 47 words | Mean word count per user turn | **Interesting at extremes.** "12 words" = terse commander. "180 words" = thinking out loud. Middle range is boring. |
| **Longest prompt** — 312 words | Max single user message length | **Interesting.** That one time you wrote an essay to the AI. What happened? |
| **"Actually, no"** — 23 corrections | User turns containing "no", "wrong", "stop", "actually", "not that", "undo" | **Core stat.** Direct measure of how much you steer. High number = you have opinions. |
| **Please & thanks** — 42% of turns | Turns containing "please", "thanks", "thank you", "sorry" | **Fun/personality.** Splits devs into "polite prompters" and "command-line barkers." |
| **Questions asked** — 31 | User turns ending in `?` or starting with "why", "how", "what" | **Interesting.** High count = you're interrogating, not just directing. |
| **Code in prompts** — 18 pastes | User turns with code blocks, file paths, or stack traces | **Moderately interesting.** Shows whether you describe problems or show them. |
| **Reasoning words** — 8.2% of turns | Turns containing "because", "trade-off", "instead", "approach", "design", "rather" | **Core stat.** This is the heyi.am signal — thinking out loud. |
| **One-word turns** — 34 | User turns that are 1-3 words ("yes", "do it", "looks good") | **Fun.** High ratio = trust. You're rubber-stamping. |
| **Longest silence** — 14 min | Max gap between consecutive user turns (excludes AI processing) | **Interesting.** That moment you went to read the docs, make coffee, or question your career. |

### Vanity warnings

- **Total words typed** — vanity. More words != better developer.
- **Vocabulary diversity** — too academic. Nobody cares about their lexical richness score.
- **Emoji usage** — too twee. Maybe as an easter egg, not a stat.

---

## Category 2: The AI's Habits

_What the AI actually did when you weren't looking._

These stats come from the AI's tool calls, responses, and behavioral patterns. They reveal whether the AI was reading carefully or just winging it, whether it tested its work, and how much code it actually touched vs. how much it just stared at.

### Stats

| Label | Example | Signal quality |
|-------|---------|---------------|
| **Apologies** — 7 "sorry"s | AI turns containing "sorry", "apologies", "my mistake", "I apologize" | **Genuinely interesting.** Each apology is an admission of failure. High count = rough session. |
| **Read:write ratio** — 4.2:1 | Ratio of Read/Grep/Glob calls to Edit/Write calls | **Core stat.** High ratio = careful, studying the codebase. Low ratio = yolo cowboy coding. |
| **Files read, never touched** — 23 | Files opened by Read/Grep that never appeared in an Edit/Write | **Interesting.** Shows how much context-gathering happened before any changes. |
| **Test runs** — 12 attempts | Count of Bash calls containing "test", "pytest", "jest", "mix test", "cargo test" | **Core stat.** Zero = shipped without testing. 12 = actually verified the work. |
| **Failed test runs** — 4 of 12 | Test runs with non-zero exit or "FAILED" / "error" in output | **Interesting only as a ratio.** 4/12 failed = real debugging happened. |
| **Longest tool chain** — 8 calls | Max consecutive AI tool calls without a user turn in between | **Interesting.** Shows autonomy depth. 2 = micromanaged. 15 = the AI went on an adventure. |
| **Self-corrections** — 3 | AI editing a file it already edited (same file, multiple Edit calls) | **Interesting.** AI fixing its own mistakes without being told. |
| **Unique tools** — 7 of 9 | Count of distinct tool types used | **Mildly interesting.** Read+Edit = routine. Full toolkit = complex problem. |
| **Lines generated** — 2.4k | Total lines in Edit/Write additions | **Context stat.** Useful as denominator. Not interesting on its own. |
| **Bash commands** — 34 | Count of Bash tool calls | **Interesting at extremes.** High count = the AI was running things, not just editing. |

### Vanity warnings

- **Total tokens used** — meaningless to anyone but the billing page.
- **Response length** — AI verbosity is not a signal of anything useful.
- **Tool call count** (raw total) — without context, just a big number.

---

## Category 3: The Back-and-forth

_How you and the AI actually collaborated._

These stats emerge from the interaction pattern — not what either side said individually, but the rhythm of the conversation. Override rates, trust streaks, debugging cycles. This is where collaboration style lives.

### Stats

| Label | Example | Signal quality |
|-------|---------|---------------|
| **Overrides that worked** — 6 of 8 (75%) | Corrections followed by successful tool calls (no error in next 3 turns) | **Core stat.** You were right to push back. Or you weren't. Both are interesting. |
| **Longest autopilot** — 23 turns | Max consecutive turns without a user correction or redirect | **Genuinely interesting.** Shows the longest stretch of trust. What was the AI doing for 23 turns? |
| **Redirects per hour** — 4.2 | Correction/override turns normalized by session duration | **Core stat.** Stable across session lengths. Low = trust. High = wrestling match. |
| **Test-fail-fix cycles** — 3 | Sequences: test run -> failure -> edit -> test run -> pass | **Genuinely interesting.** Real debugging loops, not just writing code and hoping. |
| **Turn density** — 2.3/min | Total turns divided by active duration | **Context stat.** Fast back-and-forth vs slow, deliberate exchanges. |
| **First blood** — 4 min | Time from session start to first user correction | **Fun.** How long before you disagreed with the AI? |
| **Recovery time** — avg 2.1 turns | Mean turns from a failed tool call to a successful one | **Interesting.** How quickly the pair bounces back from errors. |
| **Handoff ratio** — 62% AI / 38% dev | Percentage of total LOC from AI edits vs user-pasted code | **Interesting.** Who actually wrote the code? |
| **Scope creep moments** — 2 | User turns that introduce new files/features mid-session (detected by "also", "while we're at it", "one more thing") | **Fun.** We've all done it. |
| **Session arc** — explore -> build -> fix | Dominant activity per third of session (Read-heavy, Write-heavy, or Test-heavy) | **Genuinely interesting.** Shows your working pattern. Not a number — a shape. |

### Vanity warnings

- **Total turns** — already displayed as a basic stat. Doesn't need to be in the picker.
- **Session duration** — same, already a basic stat.
- **"Collaboration score"** — any composite index is a lie. Show the components, not a made-up grade.

---

## Display Guidelines

### On project cards (portfolio index)

Users pick 2-4 stats to display alongside the existing 4 (LOC, duration, turns, files). These should be the personality stats — the ones that make someone click through. Good defaults:

- **Expletives: 14** (if non-zero)
- **Overrides that worked: 75%**
- **Read:write ratio: 4.2:1**
- **Longest autopilot: 23 turns**

### On session case studies

All stats for that session, grouped by category. The three category headers appear as section labels. Stats with zero or boring values are hidden — don't show "Expletives: 0".

### Tone rules

- Labels are short. "Apologies: 7" not "Number of AI apology instances: 7"
- Units are implicit or minimal. "47 words" not "47 words per turn (mean)"
- Context beats precision. "4.2:1" is fine. "4.2381:1" is not.
- Zero is interesting when it should be non-zero. "Test runs: 0" tells a story. "Scope creep: 0" does not — just hide it.
- The stat label itself should make you curious. "First blood: 4 min" makes you want to know what happened. "Average time to first correction: 4 minutes" does not.

### Anti-fluff filter

A stat earns its place if it passes ONE of these tests:
1. **Would a dev mention it at a bar?** "I overrode the AI 23 times and was right 75% of the time" — yes. "My average prompt length was 47 words" — no.
2. **Does it differentiate?** If every session has roughly the same value, it's noise.
3. **Does it invite a follow-up question?** "Longest autopilot: 23 turns" makes you wonder what the AI was doing. "Unique tools: 7" does not.
