# Project-First Upload — Product Requirements Document

**Status:** Draft
**Date:** 2026-03-22
**Mockup:** `mockups/interactive-flow.html` screens 2, 43-47

## Constraints

**No production data. No backward compatibility.** This is a pre-launch product. There are no real users, no production database, no deployed state to preserve. This means:

- Migrations can be rewritten, squashed, or dropped entirely
- Database tables can be renamed, restructured, or replaced
- API contracts can change without versioning
- The old session-centric UI can be removed, not just hidden
- Schema fields can be renamed or repurposed without migration shims
- The `project_meta` JSONB field on shares can be replaced with a proper `projects` table if that's cleaner
- Enhanced data format on disk can change without migration scripts

**Build it right, not backward-compatible.** If a `projects` table is the correct data model, create one. Don't shoehorn project data into `project_meta` on shares just because the column already exists.

## Problem

The current flow is session-centric: users browse individual sessions, enhance them one-by-one, edit, then publish. This creates friction because:

1. **Cognitive overload** — a project with 21 sessions presents 21 individual decisions (enhance? edit? publish?)
2. **Inaccurate project stats** — LOC, time, and file counts only reflect uploaded sessions, not the full project
3. **No project narrative** — the project page is just a collection of session case studies, with no story connecting them
4. **Small sessions are noise** — "Fix typo" (3 min, 2 turns) is shown alongside "Auth rewrite" (47 min, 77 turns)

## Solution

Invert the flow: **users upload projects, not sessions**. The AI reads all session metadata, selects which sessions are worth showcasing, builds a project-level narrative, and publishes the whole bundle. The user's job is to review and add their voice — not manage a publishing pipeline.

## User Flow

```
Open CLI
  -> See your PROJECTS (not sessions)         [Screen 2]
  -> Click a project
  -> "Upload Project"                         [Screen 43]
  -> AI scans all sessions, picks the best    [Screen 44 — Triage]
  -> User reviews/overrides selection
  -> AI enhances selected sessions + builds
     project narrative + timeline             [Screen 45 — Enhance]
  -> Review the project timeline              [Screen 46 — Timeline]
  -> Add your take, review, publish           [Screen 47 — Review]
  -> Done — project page is live with
     accurate total stats
```

## Core Concepts

### Project-level AI triage

Three-layer hybrid approach — deterministic filters first, then signal extraction, then LLM ranking.

**Layer 1: Hard floor (no LLM, instant)**

Auto-skip sessions that can never be interesting:
- Duration < 5 minutes
- Turns < 3
- No files changed

**Layer 2: Signal extraction (no LLM, light transcript scan)**

For every session that passes the hard floor, extract cheap signals by scanning the raw turns:

| Signal | Detection | Why it matters |
|--------|-----------|----------------|
| Correction count | User says "no", "wrong", "not that", "actually", "stop" | Dev overriding AI = decision signal |
| User explanation length | Average words per user turn | Longer explanations = the dev is thinking out loud |
| Error/retry count | Tool results with "error", "failed", test failures | Debugging complexity, resilience |
| User-to-AI ratio | % of turns that are user prompts vs AI auto-pilot | High ratio = dev is driving |
| Tool diversity | Count of distinct tools used | Read+Edit = routine; Read+Edit+Bash+Grep+Write = complex |
| Multi-directory scope | Files across different top-level directories | Cross-cutting work vs single-file fix |
| Architectural keywords | "design", "approach", "trade-off", "instead", "because" in user turns | Reasoning signals |

These signals are computed as a `SessionSignals` struct attached to each session's metadata.

**Layer 3: LLM ranking (cheap model, metadata + signals only)**

The LLM receives a JSON array of session metadata + extracted signals (NOT full transcripts). It returns:

- **Selected sessions** — the ones worth deep-diving into (typically 5-10 out of 20+)
- **Skip reasons** — why each skipped session was skipped ("Too small", "Mechanical", "Redundant")
- **Session significance tags** — one-line reason each selected session matters ("Key decision: full rewrite over patch")

Model: `claude-haiku-4-5-20251001` — this is a ranking task on small structured input, not a creative task. Haiku is fast and cheap enough to run on every triage.

**Fallback:** If LLM is unavailable (no API key, no proxy), fall back to Layer 1 + Layer 2 only. Score sessions by weighted signal sum (`corrections*3 + explanationLen*2 + toolDiversity*2 + ...`), select top N.

### Project narrative

The AI reads the full transcripts of selected sessions (using the existing sampling/summarization approach) and generates:

- **Project description** — 2-3 sentences, what this project IS
- **Project arc** — 4-7 high-level phases that tell the project's story (e.g., "Foundation -> Identity -> Trust -> Presentation")
- **Skills union** — aggregated from all sessions
- **Key decisions** — moments where the developer made a call (overrode AI, chose approach A over B, etc.)

### Project timeline

A chronological view of the project, grouped by time period (weeks or logical phases). Featured sessions are expanded cards; small/skipped sessions are collapsed into "N smaller sessions" groups.

### Accurate totals

The project page shows stats computed from ALL local sessions (not just uploaded ones), using the `project_meta` field already implemented. "21 sessions (8 published)" tells the viewer the scope.

## LLM Provider Strategy

The project flow has 4 LLM calls. Both local (BYOK) and proxy paths must work.

| LLM Call | Model | Local (BYOK) | Proxy (Phoenix) | Fallback (no LLM) |
|----------|-------|-------------|-----------------|-------------------|
| **Triage** | Haiku | Direct Anthropic API | `POST /api/enhance` with `type: "triage"` | Hard floor + signal scoring only |
| **Session enhancement** | Sonnet | Direct (existing) | `POST /api/enhance` (existing) | Skip — publish without enhancement |
| **Project narrative** | Sonnet | Direct Anthropic API | `POST /api/enhance` with `type: "project"` | Skip — publish without narrative |
| **Narrative refinement** | Sonnet | Direct Anthropic API | `POST /api/enhance` with `type: "refine"` | Skip — use draft narrative as-is |

### Provider resolution (unchanged from current)

1. `ANTHROPIC_API_KEY` env var → local AnthropicProvider
2. Key in `~/.config/heyiam/settings.json` → local AnthropicProvider
3. No key → ProxyProvider (calls Phoenix `POST /api/enhance`)

### Phoenix proxy changes

The existing `POST /api/enhance` endpoint accepts `{ session }` and returns enhancement results. It needs to be extended to handle project-level calls:

```json
// Triage
{ "type": "triage", "sessions": [{ title, duration, loc, turns, files, skills, signals }] }

// Project narrative
{ "type": "project", "sessions": [{ title, devTake, skills, executionSteps, duration, loc }] }

// Narrative refinement
{ "type": "refine", "narrative": "...", "timeline": [...], "answers": [...] }
```

The Phoenix-side LLM handler (`HeyiAm.LLM`) routes based on `type` and calls the appropriate prompt builder. This keeps the proxy endpoint simple — one URL, multiple call types.

### Cost

- **Triage (Haiku):** ~$0.001 per project (small structured input)
- **Session enhancement (Sonnet):** ~$0.02–0.05 per session (existing cost)
- **Project narrative (Sonnet):** ~$0.03–0.08 per project (summaries of 5-10 sessions)
- **Narrative refinement (Sonnet):** ~$0.01 per project (small input: draft + 2-3 answers)
- **Total per project upload:** ~$0.15–0.50 depending on session count

Proxy users are rate-limited by the existing enhance quota (default 10/month per user).

## What Gets Published

| Data | Source | Storage |
|------|--------|---------|
| Project narrative + arc | AI-generated from selected sessions | `projects` table |
| 5-10 session case studies | AI-enhanced (full transcripts) | Individual shares (with `project_id` FK) |
| Aggregate stats (LOC, time, files) | Computed from ALL local sessions | `projects` table |
| Project timeline | AI-generated from session order + content | `projects` table |
| Skipped session metadata | Title, duration, LOC only | `projects` table |

## What Does NOT Get Published

- Full transcripts of skipped sessions
- Raw JSONL for skipped sessions
- Any session the user explicitly excludes

## User Controls

- **Override triage** — check/uncheck any session to include/exclude
- **Edit narrative** — the project description and arc are editable before publish
- **Add your take** — optional question: "What should a hiring manager notice about this project?"
- **Correct the AI** — optional question: "Anything the AI got wrong about the project story?"
- **Single session fallback** — "Want to publish a single session instead?" link always available

## Context-Aware Questions (anti-slop)

After the AI generates the draft narrative, it asks the user 2-3 targeted questions based on patterns it detected in the sessions. These are NOT generic — they reference specific things the AI found:

- **Pattern-based:** "You overrode the AI's suggestion 4 times. Was that a conscious strategy?" (detected high correction count)
- **Architecture-based:** "You spent 52 minutes on Ed25519 sealing. What made that worth the investment?" (detected longest single-agent session)
- **Evolution-based:** "The auth and sealing sessions share zero files. Were these intentionally isolated?" (detected zero file overlap)

**Two-pass narrative generation:**
1. First pass: AI generates draft narrative from session transcripts (Screen 45)
2. User answers 2-3 questions (Screen 48) — can skip any or all
3. Second pass: AI rewrites narrative incorporating the user's answers (triggered by "Weave into narrative" button)
4. Timeline (Screen 46) shows the final narrative with the user's voice baked in

The second pass is cheap — it's refining an existing narrative with short user inputs, not generating from scratch. The result sounds like a dev thinking out loud, not AI explaining.

Users can skip all questions — the draft narrative still works, it just won't have their perspective.

## Project Links + Screenshot

All optional:

- **Repository URL** — auto-detected from `git remote get-url origin`. User can override or clear.
- **Project URL** — live site, docs, demo, etc. Manually entered.
- **Screenshot** — image upload. Displayed on the project page. Stored in object storage.

## URL Structure

Friendly, hierarchical URLs:

```
/:username                          → portfolio (project index)
/:username/:project                 → project page (timeline, stats, agent activity)
/:username/:project/:session-slug   → session case study (within project context)
/s/:token                           → session case study (direct share link, works without project context)
/s/:token/transcript                → full raw transcript
```

Both `/:username/:project/:session-slug` and `/s/:token` resolve to the same session. The friendly URL shows breadcrumbs (ben / heyi-am / auth-rewrite), the `/s/` URL is for sharing.

## Transcript Drill-Down

Transcripts are evidence, accessed by drilling down:

```
Portfolio → Project page → Click featured session → Session case study → "View transcript"
```

- The session timeline on the project page has clickable cards for featured sessions
- Each session case study page has a "View full transcript →" link
- The transcript page shows the full turn-by-turn raw log

## Non-Goals (v1)

- Per-session editing within the project flow
- Re-ordering sessions in the timeline (AI determines order, user can correct via "Anything the AI got wrong?")
- Multi-project bundles
- Real-time streaming of the project enhance (v1 uses progress events, not token streaming)

## Portfolio UI Change

The public portfolio page (`/:username`) changes from a session index to a **project index**.

**Before:** Flat list of session cards grouped by project name string. Individual sessions are the unit of display.

**After:** Project cards are the unit of display. Each card shows:
- Project title
- AI-generated narrative (2-3 sentences)
- Stats: sessions (N published), total time, LOC, files
- Skills chips
- Click through → project detail page

Individual sessions are never shown on the portfolio index. They live inside the project detail page (`/:username/:project`), which now includes:
- Project narrative + developer's take
- Project arc (numbered phases)
- Project timeline (chronological, with featured + collapsed sessions)
- Growth chart, heatmap, top files (existing, from published shares)
- Published session case studies (existing cards)

**Mockup:** Screen 24 (portfolio) and Screen 25 (project detail) updated.

## Success Metrics

- Users publish projects (not just sessions) as the primary action
- Time from "open CLI" to "project published" drops significantly
- Project pages have accurate total stats (no more partial LOC counts)
- Average published project has 5+ sessions (vs current 1-2)

## E2E Flows

### Flow 1: First-time project upload (happy path)

```
1. User opens CLI (localhost:17845)
2. CLI scans ~/.claude/projects/ → finds 3 projects
3. Screen 2: User sees 3 project cards with stats
4. User clicks "Upload" on "heyi-am" (21 sessions)
5. Screen 43: Full session list shown, user clicks "Let AI pick sessions"
6. CLI sends all 21 session metadata to triage endpoint
7. Screen 44: AI returns 8 selected, 13 skipped
   - User sees selection with significance tags
   - User unchecks 1, checks 1 from skipped
   - Final selection: 8 sessions
8. User clicks "Enhance project"
9. CLI loads full transcripts for 8 selected sessions
10. CLI calls enhance for each session (3 concurrent, bulk-style)
11. CLI calls project-enhance with all 8 enhanced sessions
12. Screen 45: Project narrative streams in
    - Left panel: session processing feed (checkmarks + spinner)
    - Right panel: project description + arc + skills
13. User clicks "View timeline"
14. Screen 46: Timeline view with weeks, featured sessions, collapsed groups
15. User clicks "Review & publish"
16. Screen 47: Final review card with stats, checklist, optional questions
    - User types a take: "I didn't just build features — I made hard calls"
17. User clicks "Publish project"
18. CLI publishes 8 sessions (sequential, rate-limited) with project_meta
19. Screen 12 (existing success): Published! URL shown
20. Portfolio project page shows:
    - Accurate stats: "21 sessions (8 published)"
    - Project narrative and arc
    - Timeline with featured + collapsed sessions
    - Heatmap, growth chart, top files from all uploaded sessions
```

### Flow 2: Project with all sessions already enhanced

```
1. User has previously enhanced 15 of 21 sessions individually
2. Opens CLI → Screen 2 → clicks "Upload" on project
3. Screen 43 → "Let AI pick sessions"
4. Triage runs on metadata
5. Screen 44: 10 selected (6 already enhanced, 4 need enhancement)
6. User confirms → "Enhance project"
7. CLI skips re-enhancing the 6, enhances only 4 new ones
8. Project narrative generated from all 10
9. Continue to timeline → review → publish
```

### Flow 3: Small project (< 5 sessions)

```
1. Project "claude-code-summary" has 4 sessions
2. Screen 43: All 4 shown, short enough to show inline
3. AI triage: all 4 selected (no skips — project is small)
4. No triage screen needed — skip directly to enhance
5. Rest of flow identical
```

### Flow 4: Re-upload after new sessions

```
1. User published "heyi-am" last week (8 sessions)
2. User did 5 more sessions this week
3. Opens CLI → Screen 2 → "heyi-am" now shows "26 sessions"
4. Clicks "Update Project" (instead of "Upload" — project already published)
5. Triage includes all 26 sessions, already-published ones are pre-checked
6. AI may suggest 2-3 new sessions to add
7. Enhance only the new ones
8. Project narrative updated to include new arc phases
9. Re-publish: updates project_meta, publishes new sessions
10. Old sessions remain published (no destructive action)
```

### Flow 5: User prefers single-session publish

```
1. Screen 2: User sees projects, but clicks "Browse individual sessions" link
2. Goes to existing session list (screen 3)
3. Existing single-session flow unchanged
```

### Flow 6: No API key configured

```
1. User clicks "Upload" on a project
2. Screen 43 → "Let AI pick sessions"
3. Error: "API key required for AI triage"
4. Two options: "Go to Settings" or "Upload all sessions without AI curation"
5. If "Upload all": publishes all sessions with basic metadata, no narrative
```

### Flow 7: Auth required

```
1. User clicks "Upload" on a project
2. Not authenticated → redirect to auth flow (Screen 10)
3. After auth, return to Screen 43
```

## Data Flow Diagram

```
CLI (local)                          Phoenix (server)
-----------                          ----------------

All sessions on disk
        |
        v
[1] Compute metadata for all sessions
    (title, LOC, duration, turns, files)
        |
        v
[2] AI Triage (local LLM call)
    Input: all metadata
    Output: selected[], skipped[], tags
        |
        v
[3] Load full transcripts for selected sessions
        |
        v
[4] Enhance selected sessions (bulk, 3 concurrent)
    Input: full session data
    Output: EnhancedData per session
        |
        v
[5] Project Enhance (local LLM call)
    Input: all enhanced session summaries
    Output: narrative, arc, timeline, skills
        |
        v
[6] Compute project stats from ALL sessions
    {total_sessions, total_loc, total_duration, total_files}
        |
        v
[7] Create/update project record              -->  POST /api/projects
    (narrative, arc, timeline, stats)                Creates/upserts projects row
        |
        v
[8] Publish selected sessions (sequential)    -->  POST /api/sessions (x8)
    Each includes project_id FK                     Creates shares linked to project
        |
        v
[9] Project page renders                      <--  GET /:username/:project
    Stats from projects table                       Narrative, arc, timeline from project
    Sessions from shares with project_id FK         Growth chart, heatmap from shares
```

## API Changes

### New CLI endpoints (internal, localhost)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects/:dirName/triage` | AI triage — select sessions to showcase |
| POST | `/api/projects/:dirName/enhance-project` | Generate project narrative from enhanced sessions |
| POST | `/api/projects/:dirName/refine-narrative` | Rewrite narrative incorporating user's question answers |

### New Phoenix endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects` | Create or update a project record (upsert by user_id + slug) |

### Modified Phoenix endpoints

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/sessions` | Accept `project_id` FK (replaces `project_meta`) |

## Projects Table Schema

Projects are first-class entities, not JSONB blobs on shares.

```sql
CREATE TABLE projects (
  id            bigserial PRIMARY KEY,
  slug          varchar NOT NULL,              -- URL-safe identifier
  title         varchar NOT NULL,
  narrative     text,                          -- AI-generated, refined with user's answers from questions step
  repo_url      varchar,                       -- auto-detected from git remote, optional
  project_url   varchar,                       -- live site / docs / demo, optional
  screenshot_key varchar,                      -- S3 key for uploaded screenshot, optional
  timeline      jsonb DEFAULT '[]',            -- [{period, label, sessions[]}]
  skills        text[] DEFAULT '{}',           -- aggregated from all sessions
  total_sessions      integer,                 -- from ALL local sessions (not just uploaded)
  total_loc           integer,
  total_duration_minutes integer,
  total_files_changed integer,
  skipped_sessions    jsonb DEFAULT '[]',      -- metadata for non-published sessions
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inserted_at   timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL,
  UNIQUE(user_id, slug)
);

-- shares.project_id FK replaces shares.project_meta
ALTER TABLE shares ADD COLUMN project_id bigint REFERENCES projects(id) ON DELETE SET NULL;
```
