# Session Viewer: Product Vision

## The Core Insight

A coding session is not a chat log. It is a **story about problem-solving**. The current viewers treat sessions as data to be displayed. They should instead treat sessions as narratives to be told.

Every session has a shape: someone encountered a problem, formed a plan, navigated obstacles, made decisions, and arrived at an outcome. The raw transcript contains all of this, but it buries it under hundreds of tool calls, file reads, and routine operations. The viewer's job is to surface the story, not reproduce the log.

---

## Who Is Reading This and Why

### Persona 1: The Developer (Self-Review)

**Context:** Just finished a 90-minute session. Wants to understand what happened, capture useful context, and decide if this session is worth showcasing.

**Jobs to be done:**
- "What did I actually accomplish?" -- Needs a quick summary of outcomes, not a replay of the process
- "What files did I touch and what changed?" -- Needs a diff-oriented view to verify correctness
- "Let me grab context for my next session" -- Needs exportable summaries at multiple fidelity levels
- "Is this session portfolio-worthy?" -- Needs to quickly judge whether the session demonstrates interesting thinking

**Key behavior:** Skims first, dives deep only when something looks wrong or interesting. Spends 30 seconds in overview mode, 5+ minutes in deep-dive mode if the session matters.

**Current failure:** Has to choose between a flat transcript (too much noise) and an overview tab (disconnected from the actual work). No way to skim the narrative arc without reading every message.

### Persona 2: The Hiring Manager (Evaluation)

**Context:** Reviewing a candidate's portfolio. Has 2-3 minutes per project, maybe 60 seconds per session. Looking for signals of engineering judgment, not code output.

**Jobs to be done:**
- "Does this person think clearly?" -- Needs to see decision-making, not just tool usage
- "Can they navigate ambiguity?" -- Needs to see how they handled problems, pivots, and tradeoffs
- "Are they effective with AI?" -- Needs to see orchestration skill, not just prompt-and-accept
- "How do they handle things going wrong?" -- Needs to see error recovery and course corrections

**Key behavior:** Will not scroll. Will not expand collapsed sections. Will not read a 200-turn transcript. Needs the signal on first viewport, with progressive disclosure for those who want more.

**Current failure:** Public transcript is paragraphs of text with DEV/AI labels. No decisions highlighted, no structure visible, no tool calls rendered. A hiring manager will bounce in 5 seconds because there is nothing to anchor attention on.

### Persona 3: The Peer (Learning)

**Context:** Another developer browsing portfolios to learn approaches. More patient than a hiring manager, less context than the original developer.

**Jobs to be done:**
- "How did they approach this problem?" -- Needs to see the strategy, not just the execution
- "What tools and patterns did they use?" -- Needs to see the technical choices made
- "What can I steal for my own workflow?" -- Needs actionable takeaways about AI-assisted development patterns

**Key behavior:** Will spend 3-5 minutes on an interesting session. Will follow the narrative if one exists. Will expand interesting sections.

**Current failure:** Same as hiring manager, with the additional problem that the flat transcript has no waypoints -- no table of contents, no phase markers, no way to jump to the interesting parts.

---

## Information Hierarchy

What matters most to least, ordered by the signal-to-noise ratio it provides:

### Tier 1: The Headline (visible immediately, above the fold)

1. **Session title** -- What was this session about?
2. **Developer take** -- The developer's own words about what happened (this is the single highest-value piece of content; it is the "why" behind everything else)
3. **Outcome statement** -- What was achieved? What changed?
4. **Key stats** -- Duration, files changed, LOC (the vital signs, not the story)

### Tier 2: The Narrative Arc (visible on first scroll)

5. **Execution path / phases** -- The session broken into 3-7 logical phases (investigation, implementation, debugging, testing, etc.) with one-line summaries. This is the table of contents for the session.
6. **Key decisions** -- Moments where the developer chose between alternatives, rejected an approach, or changed direction. These are the highest-signal moments in any session.
7. **Skills demonstrated** -- Technologies, patterns, and tools used

### Tier 3: Supporting Evidence (progressive disclosure)

8. **File changes** -- What was actually modified, with diff stats
9. **Tool usage breakdown** -- Which tools were used and how often (signals about workflow, not detail)
10. **Q&A pairs** -- Developer answers to targeted questions about their thinking

### Tier 4: Raw Material (deep dive, opt-in)

11. **Transcript** -- The actual conversation, but structured with collapsible phases, not as a flat dump
12. **Thinking blocks** -- The AI's reasoning (interesting to peers, mostly noise for hiring managers)
13. **Tool call details** -- Inputs and outputs of individual tool calls

### What to cut from the hierarchy:

- **Timestamps on every message** -- Useful for the developer's private view, distracting on the public page. Show duration per phase instead.
- **Model identifiers** -- Internal detail. Nobody evaluating the developer cares that the model was "3-5-sonnet-20250101".
- **Tool output in full** -- Almost always noise. Show what tool was called and on what file. The output matters only for Bash commands that produced errors.

---

## The Three Surfaces

### Shared DNA (all surfaces must have this)

Every surface renders the same conceptual structure. The difference is depth, not kind:

1. **Headline block:** Title + developer take + key stats
2. **Phase timeline:** 3-7 phases with one-line descriptions
3. **Decision callouts:** Visually distinct markers where choices were made
4. **Progressive disclosure:** Compact by default, expandable on demand

The shared component model: the CLI React app, the exported HTML, and the public Phoenix page should all render from the same data shape. The Session type already carries `executionPath`, `developerTake`, `skills`, `toolBreakdown`, `filesChanged`, and `qaPairs`. The missing pieces are:

- **Phase-grouped transcript** -- The transcript segmented by execution path phases, so each phase is expandable with its relevant transcript turns inside it
- **Decision annotations** -- Already partially exists in the public transcript (`turn["decision"]`) but not in the CLI viewer or export
- **Outcome statement** -- A one-line "what changed" derived from file changes and the final assistant message

### Surface 1: CLI Local Viewer (Private)

**Purpose:** Developer's workbench. Maximum detail, maximum utility.

**Structure:**
```
HEADER: Title | Stats (duration, turns, files, LOC) | [Copy for AI] [Download]

DEVELOPER TAKE (if present)
  "I refactored the auth middleware to..."

PHASE TIMELINE (expandable)
  Phase 1: Investigation (8 turns, 3m)  [v expand]
    > User: "Let's look at the auth middleware..."
    > Assistant: [thinking] ... [Read auth.ts] ... "The current implementation..."
    > ...
  Phase 2: Implementation (22 turns, 14m)  [v expand]
    > ...
  Phase 3: Testing (6 turns, 4m)  [v expand]
    > ...

KEY DECISIONS (pulled from phases, shown as distinct callout cards)
  Decision: Chose middleware pattern over decorator pattern because...
  Decision: Rejected Redis caching due to...

FILES CHANGED
  src/auth/middleware.ts  +47 -12
  src/auth/types.ts      +8  -0
  test/auth.test.ts      +34 -0

TOOL BREAKDOWN (compact bar chart)
SKILLS
```

**Key changes from current:**
- Kill the Transcript/Overview tab split. Merge them into a single phased view.
- Transcript is not a separate tab -- it lives inside each phase as expandable detail.
- "Copy for AI" moves to a prominent position (it is the developer's primary action on revisiting a session).
- Search operates across all phases, with results showing which phase they are in.

### Surface 2: Public Transcript (heyi.am)

**Purpose:** Showcase. Hiring manager and peer evaluation surface. Maximum signal density, minimum noise.

**Structure:**
```
HEADER: Title | Date | Duration | Files | LOC

DEVELOPER TAKE (always visible, prominent)
  "I refactored the auth middleware to..."

PHASE TIMELINE (visual, not just text)
  [1] Investigation  ->  [2] Implementation  ->  [3] Testing
  3m                     14m                      4m

  Phase 1: Investigation
    Summary: Explored the existing auth implementation...
    Key decision: Chose to refactor rather than rewrite because...
    [Show 8 turns v]  (collapsed by default)

  Phase 2: Implementation
    Summary: Built middleware chain with...
    Key decision: Used composition over inheritance for...
    [Show 22 turns v]

  Phase 3: Testing
    Summary: Added integration tests covering...
    [Show 6 turns v]

SKILLS: [typescript] [testing] [middleware-design]
```

**Key changes from current:**
- The public transcript currently renders flat DEV/AI paragraphs. Replace with the phased structure.
- Render tool calls visually: show what tool was used and on what file, but collapse output by default. Show Bash commands and their results (these are the most readable tool calls for non-technical reviewers).
- Decision callouts are visually prominent -- colored left border, distinct background. These are what hiring managers actually want to see.
- "Skipped turns" indicator becomes phase-level collapsing. Instead of "...47 more turns...", each phase shows its turn count and is expandable.
- No model names, no timestamps on individual turns (show per-phase duration instead).

### Surface 3: HTML Export (Offline)

**Purpose:** Portable artifact. Must work without JavaScript for basic reading, with JS for interactivity.

**Structure:** Same as public transcript, but:
- All phases are expanded by default (since there is no server to fetch collapsed content)
- Tool calls show summary line only (no expandable output -- keep file size down)
- Decision callouts remain visually prominent
- No search (static file)
- Skills and stats are fully rendered inline

**Key changes from current:**
- Currently just renders the SessionOverlay component (stats + execution path + tool breakdown). Add the phased transcript structure.
- Featured sessions get the full phased view. Non-featured sessions get the headline block only (title + stats + developer take).

---

## Design Principles

### 1. Story over log

The default view is the narrative, not the transcript. The transcript is evidence that supports the narrative, available on demand. Never show a flat chronological dump as the primary view.

### 2. Decisions are the signal

In any coding session, there are maybe 3-5 moments that actually reveal engineering judgment. Everything else is execution. Surface those moments. Give them distinct visual treatment. Make them the thing a skimmer sees.

### 3. Progressive disclosure, not progressive hiding

"Collapsed by default" is not the same as "hidden." Every collapsed section should show enough summary text that a reader knows whether it is worth expanding. A collapsed phase should say "Investigation: explored 3 approaches to auth caching, rejected Redis" -- not just "Phase 1 (8 turns)."

### 4. The developer's voice is primary

The `developerTake` field and `qaPairs` are the most valuable content on the page because they are the developer's own words. AI-generated summaries of what happened are supporting evidence. The developer's interpretation of what happened is the headline.

### 5. Consistent structure, varying depth

All three surfaces use the same conceptual structure (headline -> phases -> decisions -> evidence). They differ in how much depth is shown by default, not in what sections exist. A developer who uses the CLI viewer and then looks at their published page should recognize the same structure.

### 6. Kill vanity metrics

Tool call counts and LOC totals are interesting to developers but meaningless to hiring managers. Show them in the CLI. On the public page, replace raw tool counts with qualitative signals: "used 4 different tools across investigation and implementation" rather than "Read: 23, Edit: 12, Bash: 8, Grep: 5."

---

## What to Cut / Kill

### Kill immediately
- **Transcript/Overview tab split** (CLI) -- Merge into single phased view
- **Flat chronological transcript as primary view** (all surfaces) -- Replace with phased structure
- **DEV/AI paragraph rendering** (public) -- Replace with structured turn rendering
- **"...N more turns..." skipped indicator** (public) -- Replace with per-phase collapsing
- **Model names on individual messages** (public, export) -- Internal detail, keep in CLI only
- **Per-message timestamps** (public, export) -- Show per-phase duration instead

### Demote (move deeper in hierarchy)
- **Tool breakdown bar chart** (CLI) -- Useful but not primary. Move below phases.
- **Full tool output** (all surfaces) -- Show tool name + target file. Output on expand only.
- **Thinking blocks** (public, export) -- Interesting to peers, noise to hiring managers. Collapse aggressively.
- **Stats grid as 4 equal boxes** (all surfaces) -- These are vital signs, not the story. Make them a compact inline row, not a grid that dominates the viewport.

### Promote (make more visible)
- **Developer take** -- Should be the first thing read after the title on every surface
- **Decision callouts** -- Need distinct visual treatment (currently only partially implemented in public transcript, not at all in CLI or export)
- **Phase timeline** -- Should be the primary navigation mechanism, not a section buried under stats
- **Copy for AI** (CLI) -- This is the developer's primary action on revisit. Promote from dropdown to primary button.

---

## Data Model Gaps

The current `Session` interface is close but needs additions:

1. **Phase-grouped transcript** -- The `executionPath` has steps, and the transcript has messages, but nothing links them. Need a mapping from each execution step to its corresponding transcript message range (start/end indices or message IDs).

2. **Decision annotations** -- The public transcript has `turn["decision"]` but the CLI transcript has no equivalent. Need a `decisions` field on Session or embedded in execution steps, each with: `phase`, `choice`, `alternatives_considered`, `rationale`.

3. **Outcome statement** -- A computed or AI-generated one-liner: "Refactored auth middleware, added 3 integration tests, reduced response latency by 40ms." Lives at session level.

4. **Phase summaries** -- Each execution step needs a `summary` field that is longer than the current `description` -- a 2-3 sentence explanation of what happened in that phase, suitable for display when the phase is collapsed.

---

## Sequencing

### Phase A: Data Foundation
- Add phase-transcript mapping to the enhancement pipeline (link execution steps to transcript message ranges)
- Add decision extraction to the enhancement pipeline
- Add outcome statement generation
- Enrich execution step descriptions into proper summaries

### Phase B: CLI Viewer Rebuild
- Replace tab split with single phased view
- Implement phase-grouped transcript with expand/collapse
- Add decision callout rendering
- Promote Copy for AI
- Carry search into phased structure

### Phase C: Public Transcript Rebuild
- Replace flat DEV/AI rendering with phased structure
- Add tool call rendering (summary line + expandable output)
- Add decision callout rendering
- Replace "skipped turns" with per-phase collapsing
- Remove model names and per-turn timestamps

### Phase D: Export Update
- Render phased structure in static HTML
- All phases expanded by default
- Decision callouts with distinct styling
- Keep file size reasonable (tool outputs trimmed)

---

## Success Metrics

- **Hiring manager engagement:** Time on public transcript page (target: median > 45 seconds, up from estimated < 10 seconds)
- **Developer utility:** Frequency of "Copy for AI" usage (already tracked, should increase with prominence)
- **Portfolio completion rate:** Percentage of users who publish at least one project after viewing their sessions in the CLI (the viewer should make sessions look worth publishing)
- **Decision visibility:** Average number of decision callouts per published session (target: 2-5, signals that the enhancement pipeline is extracting them)
