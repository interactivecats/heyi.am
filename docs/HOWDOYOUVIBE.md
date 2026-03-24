# howdoyouvibe — Implementation Plan

## Context

heyi.am needs a viral growth lever. `howdoyouvibe` is a standalone `npx` CLI tool that scans your local AI coding sessions and gives you a personality breakdown — archetype headline, 2-sentence narrative, and raw stats — with an optional shareable URL and downloadable image.

**Competitive landscape:**
- **Viberank** (`npx viberank`) — Claude Code cost/token leaderboard. Competitive ranking, uploads raw data.
- **ccusage** — Claude Code cost breakdown CLI. Utility-focused.
- **HowYouCode** — GitHub repo analysis → personality card. Generic archetypes.
- **GitHub Wrapped** — yearly GitHub commit stats recap.

**howdoyouvibe differentiates by:**
- Analyzing *decision patterns* from AI conversations (overrides, corrections, thinking-out-loud), not just metadata
- Multi-tool (Claude + Cursor + Codex + Gemini, not just Claude)
- 100% local compute (only computed stats leave your machine, never raw sessions)
- Anti-fluff tone: raw stats > composite scores, dev voice > AI explanation

**One entry point, fully standalone:**
- `npx howdoyouvibe` — its own CLI, its own package, no dependency on heyiam
- Parsers vendored from `cli/src/parsers/` (learn from the patterns, copy the code)
- No `heyiam vibe` command — zero modifications to the existing CLI

**LLM usage:** Stat computation and archetype matching are deterministic and local. The 2-sentence narrative is generated server-side via Gemini Flash when sharing (~$0.0002/vibe). The LLM only receives computed stats, never raw session text.

**Open source readiness:** The vibe backend lives in Phoenix with strict namespacing but zero FKs to core tables (users, shares, projects). Vibes are anonymous. Designed for clean extraction into a separate service before heyi.am goes open source — delete the directory, remove the router scope, drop the migration.

---

## Output: Three Layers

The output has three layers of increasing detail, each serving a different sharing context:

### Layer 1: Archetype Headline (the tweet)
Combinatorial: primary archetype + modifier trait. 10 primaries x 10 modifiers = 100 combos.

Example: **"The Polite Night Owl who reads 5x more than writes"**

### Layer 2: Narrative (the hook)
2-sentence dev-voice paragraph. Generated via LLM (Gemini Flash, ~$0.0002/vibe) before rendering the card — you see the full output before deciding to share. Input to the LLM is the stats blob + archetype only, never raw session text. Falls back to a simple template if the server is unreachable.

Example: *"You said please in 42% of your turns and coded past midnight more often than not. When you pushed back on the AI, you were right 75% of the time."*

### Layer 3: Raw Stats Grid (the proof)
All ~25 computed stats grouped by the three categories. Zero/boring values hidden.

```
Your Voice
  Expletives: 14          Corrections: 23
  Please rate: 42%        Avg prompt: 47 words
  Late night: 62%         Questions: 31

The AI's Habits
  Read:write: 4.2:1       Apologies: 7
  Test runs: 12 (4 fail)  Longest chain: 8

The Back-and-forth
  Override success: 75%   Autopilot: 23 turns
  First blood: 4 min      Scope creep: 2
```

---

## Phase 1: Stat Computation Module

**Goal:** Core computation for the standalone package.

**File:** `packages/howdoyouvibe/src/stats.ts`

**`computeVibeStats(sessions: ParsedSession[]): VibeStats`** — single-pass over raw_entries per session.

### Your Voice (user messages)
| Stat | Key | Detection |
|------|-----|-----------|
| Expletives | `expletives` | Regex word list on user turns |
| Corrections | `corrections` | "no", "wrong", "actually", "undo" after AI turns |
| Please rate | `please_rate` | % of turns with "please"/"thank you" |
| Avg prompt length | `avg_prompt_words` | Mean words per user turn |
| Longest prompt | `longest_prompt_words` | Max single user message |
| Question rate | `question_rate` | % of turns ending in `?` |
| One-word turns | `one_word_turn_rate` | % of 1-3 word turns |
| Reasoning rate | `reasoning_rate` | % with "because", "trade-off", "instead" |
| Late night rate | `late_night_rate` | % of turns between 10pm-4am |
| Weekend rate | `weekend_rate` | % on Sat/Sun |

### The AI's Habits (assistant messages + tool calls)
| Stat | Key | Detection |
|------|-----|-----------|
| Apologies | `apologies` | AI turns with "sorry", "apolog" |
| Read:write ratio | `read_write_ratio` | Read/Grep/Glob / Edit/Write calls |
| Test runs | `test_runs` | Bash calls containing test commands |
| Failed tests | `failed_tests` | Test runs with error in output |
| Longest tool chain | `longest_tool_chain` | Max consecutive tool calls between user turns |
| Self-corrections | `self_corrections` | Same file edited 2+ times without user prompt |
| Bash commands | `bash_commands` | Total Bash tool calls |

### The Back-and-forth (interaction patterns)
| Stat | Key | Detection |
|------|-----|-----------|
| Override success | `override_success_rate` | Corrections followed by success (no error in next 3 turns) |
| Longest autopilot | `longest_autopilot` | Max consecutive AI turns without user input |
| First blood | `first_blood_min` | Median time to first user correction |
| Redirects/hr | `redirects_per_hour` | Corrections normalized by duration |
| Turn density | `turn_density` | Turns per active minute |
| Scope creep | `scope_creep` | "also", "while we're at it", "one more thing" |

**Files:**
- Create `packages/howdoyouvibe/src/types.ts` — VibeStats interface, Archetype types
- Create `packages/howdoyouvibe/src/stats.ts` — stat computation
- Create `packages/howdoyouvibe/src/stats.test.ts`

---

## Phase 2: Archetype System (Combinatorial)

**Goal:** Deterministic archetype matching with primary + modifier for 100+ unique combos.

**File:** `packages/howdoyouvibe/src/archetypes.ts`

### Primary Archetypes (10)
Each has 2+ stat conditions (AND logic) and a base tagline.

| Primary | Conditions | Base tagline |
|---------|-----------|-------------|
| The Night Owl | late_night_rate > 0.3 | Codes when the world sleeps. |
| The Backseat Driver | corrections > 10 AND override_success_rate > 0.6 | Knows when the AI is wrong. |
| The Delegator | longest_autopilot > 15 AND one_word_turn_rate > 0.3 | Points and lets the AI run. |
| The Cowboy | read_write_ratio < 1.5 AND bash_commands > 50 | Writes first, reads later. |
| The Overthinker | avg_prompt_words > 80 AND question_rate > 0.4 | Every prompt is a paragraph. |
| The Speed Runner | turn_density > 3 AND avg_prompt_words < 20 | In and out. No wasted time. |
| The Debugger | failed_tests > 3 AND test_runs > 5 | Tests, fails, fixes, repeats. |
| The Diplomat | please_rate > 0.4 AND corrections < 3 | Thanks the AI, trusts the AI. |
| The Architect | read_write_ratio > 5 AND avg_prompt_words > 50 | Reads 5x more than writes. |
| The Pair Programmer | turn_density > 1.5 AND corrections > 10 | Treats the AI like a colleague. |

**Fallback:** "The Vibe Coder" — matches when nothing else qualifies.

### Modifier Traits (10)
Each is a single-stat condition that adds a qualifying phrase: "...who [modifier]"

| Modifier phrase | Condition |
|----------------|-----------|
| who says please | please_rate > 0.3 |
| who codes at 3am | late_night_rate > 0.5 |
| who reads 5x more than writes | read_write_ratio > 5 |
| who never tests | test_runs == 0 |
| who cusses under pressure | expletives > 5 |
| who writes essays for prompts | avg_prompt_words > 100 |
| who lets the AI cook | longest_autopilot > 20 |
| who asks more than tells | question_rate > 0.5 |
| who scope-creeps every session | scope_creep > 3 |
| who ships on weekends | weekend_rate > 0.3 |

**Matching algorithm:**
1. Score all primaries. Pick highest where ALL conditions pass.
2. From remaining modifiers (excluding traits already implied by the primary), pick the strongest match.
3. Compose: "The Night Owl who cusses under pressure"
4. If no primary qualifies: "The Vibe Coder" + best modifier.

### Narrative Generation (server-side LLM on share)

Narrative is generated before rendering so you see the full card before sharing.

**Flow:** CLI POSTs stats + archetype to `howdoyouvibe.com/api/narrative` → Gemini Flash returns 2 sentences → CLI renders full card → user decides to share.

**Prompt strategy:** System prompt enforces anti-fluff rules (no "leverage", "robust", "seamless"). Input is the stats JSON + archetype ID. Output is 2 sentences max, written as if a dev is describing themselves. The LLM has 25 numbers and an archetype to work with — enough to be varied and interesting without seeing any raw session text.

**Fallback:** If server is unreachable, use a simple template: "{archetype tagline} {session_count} sessions across {sources}." The card still renders — just with a less interesting narrative.

**Files:**
- Create `packages/howdoyouvibe/src/archetypes.ts` — primary + modifier matching
- Create `packages/howdoyouvibe/src/archetypes.test.ts`
- Narrative generation endpoint lives in Phoenix (Phase 4)

---

## Phase 3: Standalone `npx howdoyouvibe` Package

**Goal:** Fully standalone CLI. No dependency on heyi.am CLI. Parsers vendored (learned from `cli/src/parsers/`).

**Package:** `packages/howdoyouvibe/`

```
packages/howdoyouvibe/
  package.json          # name: "howdoyouvibe", bin: { howdoyouvibe: "./dist/index.js" }
  tsconfig.json
  src/
    index.ts            # #!/usr/bin/env node — entry point
    parsers/            # vendored from cli/src/parsers/: types, claude, cursor, codex, gemini, index
    bridge.ts           # stripped version of cli/src/bridge.ts (entriesToTurns, cleanAssistantText only)
    stats.ts            # stat computation (from Phase 1)
    types.ts            # VibeStats, Archetype types (from Phase 1)
    archetypes.ts       # archetype matching (from Phase 2)
    narrative.ts        # template-based narrative (from Phase 2)
    render.ts           # terminal rendering (console.log + box chars)
    share.ts            # POST to howdoyouvibe.com
```

**Dependencies:** `better-sqlite3` as optionalDependency (Cursor parser). Everything else is Node builtins. No chalk, no boxen — raw console.log with box-drawing chars (same style as `heyiam time`).

**better-sqlite3 handling:** Dynamic `import()` with try/catch. If unavailable, skip Cursor with: "Skipping Cursor sessions (native module not available)."

**Entry point (`src/index.ts`):**
```typescript
#!/usr/bin/env node
const sessions = await discoverAndParse();          // local: scan + parse all sessions
const stats = computeVibeStats(sessions);            // local: regex + counting
const { primary, modifier } = matchArchetype(stats); // local: deterministic rules
const narrative = await fetchNarrative(stats, primary, modifier); // server: Gemini Flash
renderCard(stats, primary, modifier, narrative);      // terminal: full card with all 3 layers
const copied = await promptYesNo("Copy to clipboard?");
if (copied) copyToClipboard(formatTextBlock(stats, primary, modifier, narrative));
const shared = await promptYesNo("Share online?");
if (shared) await shareVibe(stats, primary, modifier, narrative);
```

**Terminal output:**
```
  HOW DO YOU VIBE?
  ────────────────────────────────────────

  The Night Owl who cusses under pressure

  You said please in 42% of your turns and coded past
  midnight more often than not. When you pushed back on
  the AI, you were right 75% of the time.

  ────────────────────────────────────────

  Your Voice
    Expletives: 14          Corrections: 23
    Please rate: 42%        Avg prompt: 47 words
    Late night: 62%         Questions: 31

  The AI's Habits
    Read:write: 4.2:1       Apologies: 7
    Test runs: 12 (4 fail)  Longest chain: 8

  The Back-and-forth
    Override success: 75%   Autopilot: 23 turns
    First blood: 4 min      Scope creep: 2

  ────────────────────────────────────────
  847 turns across 23 sessions (Claude Code, Cursor)
  All analysis ran locally. No session data left your machine.
```

**Files:**
- Create all files listed in the structure above
- Create test files: `stats.test.ts`, `archetypes.test.ts`, `narrative.test.ts`, `render.test.ts`

---

## Phase 4: Phoenix Backend (howdoyouvibe.com)

**Goal:** Accept vibe POSTs, store them, serve share pages with OG tags, and a gallery.

Routes added to existing Phoenix app. `howdoyouvibe.com` DNS → same server.

### DB schema
```sql
CREATE TABLE vibes (
  id bigserial PRIMARY KEY,
  short_id varchar(10) NOT NULL UNIQUE,
  archetype_id varchar(50) NOT NULL,
  modifier_id varchar(50),
  narrative text NOT NULL,
  stats jsonb NOT NULL,
  sources text[] DEFAULT '{}',
  session_count integer NOT NULL,
  total_turns integer NOT NULL,
  inserted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX vibes_inserted_at_idx ON vibes (inserted_at DESC);
```

### Routes
```elixir
# API (no auth, rate-limited 10/min per IP)
post "/api/vibes", VibeApiController, :create
post "/api/vibes/narrative", VibeApiController, :narrative  # LLM narrative generation

# Share pages
get "/v", VibeController, :index          # gallery
get "/v/:short_id", VibeController, :show  # individual vibe
get "/v/archetypes/:id", VibeController, :archetype  # archetype page
get "/v/:short_id/card.png", VibeController, :card_image  # downloadable card
```

### API controller (`POST /api/vibes`)
- Validate: stats map, archetype_id string, narrative string, session_count > 0
- Generate 7-char nanoid for short_id
- Insert, return `{ url: "howdoyouvibe.com/v/{short_id}", short_id: "{short_id}", card_url: "howdoyouvibe.com/v/{short_id}/card.png" }`

### Share page (`GET /v/:short_id`)
- Reproduces the three-layer card in web format
- OG meta tags for social sharing:
  - `og:title` = "I'm The Night Owl who cusses under pressure"
  - `og:description` = narrative (2 sentences)
  - `og:image` = `/v/:short_id/card.png`
  - `twitter:card` = `summary_large_image`
- CTA: "Get your vibe → `npx howdoyouvibe`"
- Secondary CTA: "Build your full portfolio → heyi.am"
- "Download card" button (links to `/v/:short_id/card.png`)

### Homepage (`GET /v`)
- **Headline:** "HOW DO YOU VIBE?" + `npx howdoyouvibe` command
- **Counter:** "2,847 devs have vibed" (social proof through volume)
- **Archetype distribution chart:** "34% Night Owls, 18% Backseat Drivers, 3% Architects..." — BuzzFeed quiz psychology, "I'm in the 3%!" is a sharing trigger
- **One example card** showing the three-layer output
- **Recent vibes feed** below the fold (filterable by archetype)
- No login required

### Archetype pages (`GET /v/archetypes/:id`)
- Description, match count, anonymized stat ranges
- "You're one of 847 Night Owls"
- SEO-friendly, linkable from social shares

### Card image (`GET /v/:short_id/card.png`)
Server-rendered SVG → PNG (1200x630, standard OG size).
- Dark background (#1a1a2e or match heyi.am design system)
- Archetype name + modifier in large text
- Narrative in smaller text
- 3-4 key stats
- "howdoyouvibe.com" watermark
- "npx howdoyouvibe" at bottom

SVG → PNG: Use `resvg` (Rust-based, available as Elixir NIF via `resvg_nif` hex package) or shell out to `rsvg-convert` (installed in Docker image). Cache the PNG — vibes are immutable.

**Files:**
- Create `apps/heyi_am/lib/heyi_am/vibes/vibe.ex` — Ecto schema
- Create `apps/heyi_am/lib/heyi_am/vibes.ex` — context (create, get, list_recent)
- Create migration `create_vibes`
- Create `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/controllers/vibe_api_controller.ex`
- Create `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/controllers/vibe_controller.ex`
- Create `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/controllers/vibe_html.ex`
- Create `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/controllers/vibe_html/show.html.heex`
- Create `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/controllers/vibe_html/index.html.heex`
- Create `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/controllers/vibe_html/card_svg.html.heex` — OG image SVG template
- Modify `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/router.ex`
- Create tests for controllers + context

---

## Phase 5: Share Flow (CLI Side)

**Goal:** POST computed stats to backend, display URL + offer card download.

**File:** `packages/howdoyouvibe/src/share.ts`

### Share payload
```typescript
interface SharePayload {
  stats: VibeStats;
  archetype_id: string;      // "night-owl"
  modifier_id: string | null; // "cusses-under-pressure"
  narrative: string;          // pre-generated 2-sentence narrative
  sources: string[];          // ["claude", "cursor"]
  session_count: number;
  total_turns: number;
}
```

**NOT sent:** Any text from sessions, file paths, project names, directory names.

**Three share formats (priority order):**

1. **Copyable text block** (highest priority — circulates in Discord/Slack where devs actually talk):
```
The Night Owl who cusses under pressure
You said please in 42% of your turns and coded past midnight
more often than not. When you pushed back, you were right 75%.
Expletives: 14 | Override success: 75% | Read:write: 4.2:1
847 turns across 23 sessions — npx howdoyouvibe
```

2. **URL with OG preview** — for Twitter/LinkedIn social cards
3. **Downloadable PNG card** — for manual sharing

**CLI flow after rendering:**
```
Copy to clipboard? (y/n) y
  Copied!

Share online? (y/n) y
  Sharing... done!

  howdoyouvibe.com/v/a8f3k2
  Download card: howdoyouvibe.com/v/a8f3k2/card.png

See your full session-by-session breakdown:
  npx heyiam
```

**Implementation:** Native `fetch()` (Node 18+). POST to `https://howdoyouvibe.com/api/vibes`. Clipboard via `pbcopy` (macOS) / `xclip` (Linux) / `clip` (Windows). On share failure: "Couldn't share — your vibe lives on your machine."

**Files:**
- Create `packages/howdoyouvibe/src/share.ts`
- Create `packages/howdoyouvibe/src/share.test.ts`

---

## Build Order

| Phase | What | Depends on | Parallelizable? |
|-------|------|-----------|-----------------|
| 1 | Stat computation | — | — |
| 2 | Archetype + narrative | Phase 1 | — |
| 3 | Standalone package + terminal UI | Phases 1, 2 | — |
| 4 | Phoenix backend | — | Yes, with Phase 3 |
| 5 | Share flow | Phases 3, 4 | — |

---

## Key Files

**No existing files modified.** This is entirely new code.

**Standalone package (all new, under `packages/howdoyouvibe/`):**
- `src/parsers/` — vendored from `cli/src/parsers/` (same patterns, adapted for standalone use)
- `src/bridge.ts` — stripped from `cli/src/bridge.ts` (entriesToTurns + cleanAssistantText only)
- `src/types.ts`, `src/stats.ts`, `src/archetypes.ts`, `src/narrative.ts`, `src/render.ts`, `src/share.ts`
- Uses same `"type": "module"`, NodeNext resolution, and TS patterns as `cli/`
- Designed so the vibe modules can be moved into `cli/src/vibe/` later with minimal changes

**Phoenix (umbrella):**
- `apps/heyi_am/lib/heyi_am/vibes/` — schema + context
- `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/controllers/vibe_*` — API + HTML controllers
- `apps/heyi_am_vibe_web/lib/heyi_am_vibe_web/router.ex` — add routes

---

## Verification

1. `cd packages/howdoyouvibe && npm test` — stat computation, archetype, narrative tests pass
2. `cd packages/howdoyouvibe && npm run build && node dist/index.js` — scans real sessions, renders terminal card
4. `cd heyi_am_umbrella && mix test` — vibe API + controller + context tests pass
5. `curl -X POST localhost:4002/api/vibes -H 'Content-Type: application/json' -d '{"stats":{...},"archetype_id":"night-owl","modifier_id":"cusses-under-pressure","narrative":"...","sources":["claude"],"session_count":23,"total_turns":847}'` — returns 201 + short_id
6. `open localhost:4002/{short_id}` — share page renders with OG tags, card download works
7. `open localhost:4002` — gallery shows recent vibes
