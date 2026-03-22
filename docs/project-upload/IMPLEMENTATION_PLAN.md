# Project-First Upload — Implementation Plan

**Depends on:** [PRD.md](./PRD.md)
**Order:** CLI first, then Phoenix

## Ground Rules

**No backward compatibility. No production.** There is no deployed database, no real users, no state to preserve. This changes everything:

- **Migrations:** Squash or rewrite all existing migrations into a clean starting set. No additive `alter table` migrations for things that should have been in the original schema.
- **Schema:** If a `projects` table is the right model, create it. Don't hack `project_meta` JSONB onto shares. Design the schema as if starting fresh — because we are.
- **API:** Break any existing API contract that doesn't serve the project-first flow. No versioning, no deprecation shims.
- **UI:** The old session-centric flow can be gutted, not just hidden behind a link. If project-first is the primary flow, make it the ONLY flow and add session drill-down as a sub-view.
- **Disk format:** Enhanced data format, cache files, settings — all can change without migration scripts.
- **Phoenix templates:** Rewrite, don't patch. If the project page template needs a different structure, start from scratch.

This means Phase 5 (Phoenix) should include a migration squash and possibly a `projects` table with proper FKs rather than string-based grouping.

---

## Phase 0: Dead Code Cleanup

**Goal:** Remove dead code before building new code. Clean slate.

**Do this first.** Every file deleted here is code that won't confuse devs, won't show up in searches, and won't accidentally get imported.

### 0.1 Delete old CLI components + update App.tsx

**Delete files:**
- `cli/app/src/components/SessionList.tsx` + `SessionList.test.tsx`
- `cli/app/src/components/EnhanceFlow.tsx` + `EnhanceFlow.test.tsx`
- `cli/app/src/components/SessionEditorPage.tsx` + `SessionEditorPage.test.tsx`
- `cli/app/src/components/SessionDetail.tsx` + `SessionDetail.test.tsx`
- `cli/app/src/components/SessionBrowserFlow.test.tsx`
- `cli/app/src/components/PublishFlow.test.tsx`
- `cli/app/src/components/StatusChips.test.tsx`

**Update `cli/app/src/App.tsx`:**
- Remove imports for deleted components
- Replace routes with placeholder: `/` renders a simple "ProjectDashboard coming soon" div
- Keep `/settings` route (Settings component stays)
- Remove `/session/:id`, `/session/:id/enhance`, `/session/:id/edit` routes

### 0.2 Delete dead CLI server endpoints

**File:** `cli/src/server.ts`

Remove these endpoints (replaced by project flow in later phases):
- `POST /api/publish` (line 534) — replaced by project publish
- `POST /api/upload/bulk` (line 382) — replaced by project publish
- `POST /api/enhance/bulk` (line 278) — replaced by project enhance
- `GET /api/projects/:project/sessions/:id/enhance/stream` (line 251) — never used by React app
- `computeProjectMeta()` helper (line 91) — interim code, replaced by project flow

**Keep these endpoints** (used by the project flow):
- `GET /api/projects` — project list (Phase 1)
- `GET /api/projects/:project/sessions` — session list (Phase 2 triage)
- `GET /api/projects/:project/sessions/:id` — load single session (Phase 3 enhance)
- `POST /api/projects/:project/sessions/:id/enhance` — per-session enhance (Phase 3)
- `DELETE /api/sessions/:id/enhanced` — re-enhance
- Settings, auth, API key endpoints

### 0.3 Delete old mockups

**Already done.** Deleted:
- `mockups/full/stitch/` (old design iteration)
- `mockups/full/stitch2/` (old design iteration)
- `mockups/new/` (old design iteration)
- `mockups/full/create_a_challenge/` (challenge feature removed)
- `mockups/full/interview_comparison_view/` (challenge feature removed)
- `mockups/full-flow.html`, `full-flow-v2.html`, `happy-flow.html` (superseded by interactive-flow.html)
- `mockups/portfolio-drilldown.html`, `portfolio-drilldown-light.html` (superseded)
- `mockups/skill-chips.html` (superseded)

**Remaining mockups (keep):**
- `mockups/interactive-flow.html` — source of truth for all screens
- `mockups/agent-timeline.html` — SVG reference for agent timelines
- `mockups/session-templates.html` — template variations reference
- `mockups/full/` — per-screen reference mockups (useful for detail work)

### 0.4 Phoenix dead code

**Already done** (challenge removal in previous commit). Verify no stale references:
- `grep -r "challenge\|Challenge" phoenix/lib/ phoenix/test/` should return zero results
- `grep -r "portfolio_session\|PortfolioSession" phoenix/lib/` — these stay until Phase 5

**Commit boundary:** Codebase compiles cleanly with dead code removed. App shows placeholder at `/`. All existing tests pass (minus deleted test files).

---

## Phase 1: CLI — Project Dashboard UI

**Goal:** Replace the session-centric browser (Screen 2) with project cards. No new backend logic yet — just the React UI.

### 1.1 Rework SessionList to ProjectDashboard

**File:** `cli/app/src/components/SessionList.tsx` → rename to `ProjectDashboard.tsx`

**Changes:**
- Remove the sidebar project selector + session table
- Replace with project cards (matching mockup Screen 2)
- Each card shows: project name, session count, total time, LOC, files, skills
- "Upload" button on each card → navigates to `/project/:dirName/upload`
- Bottom link: "Browse individual sessions" → preserves old flow at `/sessions`

**Data needed:** The existing `GET /api/projects` already returns `ProjectInfo[]` with `name`, `dirName`, `sessionCount`, `sessions[]`. Need to add aggregate stats.

### 1.2 Add project stats to GET /api/projects

**File:** `cli/src/server.ts` — `GET /api/projects` handler (around line 100)

**Changes:**
- For each project, compute lightweight stats from session metadata
- This means we need LOC/duration/files per session without full parsing
- **Option A (fast):** Add a stats cache file per project that's updated when sessions are loaded
- **Option B (simpler):** Compute on first load, cache in memory for the server lifetime
- Return: `{ name, dirName, sessionCount, totalLoc, totalDuration, totalFiles, skills }`

**Tradeoff:** Full parsing of all sessions is slow (~2s per session). For the project dashboard we need at minimum LOC and duration per session. These require parsing each `.jsonl` file. We should parse lazily and cache.

### 1.3 Add stats cache

**File:** `cli/src/settings.ts` (or new `cli/src/cache.ts`)

**Spec:**
- On first session load, save `{ loc, duration, files, turns, skills }` to `~/.config/heyiam/cache/{sessionId}.json`
- On subsequent loads, read from cache (invalidate if `.jsonl` mtime changed)
- `getProjectStats(sessions: SessionMeta[])` reads cached stats or parses on miss
- This makes the project dashboard fast after first load

### 1.4 Update React routing

**File:** `cli/app/src/App.tsx`

**New routes:**
```
/                          → ProjectDashboard (new — project cards)
/project/:dirName/upload   → ProjectUploadFlow (new — multi-step wizard)
/session/:id               → SessionPreview (new — lightweight read-only view for CLI preview)
```

Old routes removed: `/sessions`, `/session/:id/enhance`, `/session/:id/edit`. All enhancement and publishing happens through the project flow. The `/session/:id` route is kept only for previewing a session within the CLI during the upload flow (e.g., clicking a session in the timeline to check it before publishing).

### 1.5 Tests

- Test `getProjectStats()` cache hit/miss behavior
- Test `ProjectDashboard` renders project cards with correct stats
- Test navigation: project card click → upload flow, "Browse sessions" → old list

**Commit boundary:** Project dashboard renders, old session flow still accessible.

---

## Phase 2: CLI — AI Triage

**Goal:** Implement the session selection step (mockup Screen 43-44).

### 2.1 Signal extraction (Layer 2)

**File:** new `cli/src/llm/triage.ts`

Before the LLM sees anything, extract cheap signals from each session's raw turns. This is a fast scan, no LLM needed.

```ts
interface SessionSignals {
  correctionCount: number;       // user says "no", "wrong", "not that", "actually", "stop"
  avgUserExplanationLength: number; // average words per user turn
  errorRetryCount: number;       // tool results with "error", "failed", test failures
  userToAiRatio: number;         // % of turns that are user prompts
  toolDiversity: number;         // count of distinct tools used
  multiDirScope: number;         // files across how many top-level directories
  architecturalKeywords: number; // "design", "approach", "trade-off", "instead", "because"
}

function extractSignals(sessionPath: string): SessionSignals
```

This requires reading the raw `.jsonl` file but NOT full parsing — just scanning user messages for keywords and counting tool types. Should be <100ms per session.

### 2.2 Triage prompt (Layer 3)

**File:** `cli/src/llm/triage.ts`

**Three-layer pipeline:**
1. Hard floor: skip sessions < 5 min, < 3 turns, 0 files changed
2. Signal extraction: compute `SessionSignals` for remaining sessions
3. LLM ranking: send metadata + signals to Haiku

**LLM input:** JSON array of `{ title, duration, loc, turns, files, skills, signals: SessionSignals }`

The signals give the LLM much better input than raw metadata — it can see "this session had 4 corrections and high explanation length" rather than just "47 min, 77 turns".

**LLM output:** `{ selected: [{ sessionId, reason }], skipped: [{ sessionId, reason }] }`

**Model:** `claude-haiku-4-5-20251001` (cheap, structured input only)

**Fallback (no LLM):** Score sessions by weighted signal sum: `corrections*3 + explanationLen*2 + toolDiversity*2 + multiDirScope + architecturalKeywords*2`. Select top N by score.

**Interface:**
```ts
interface TriageResult {
  selected: Array<{ sessionId: string; reason: string }>;
  skipped: Array<{ sessionId: string; reason: string }>;
}

async function triageSessions(
  sessions: Array<SessionMetaWithStats>,
  provider: LLMProvider | null  // null = fallback to scoring only
): Promise<TriageResult>
```

### 2.2 Triage endpoint

**File:** `cli/src/server.ts`

**New route:** `POST /api/projects/:dirName/triage`

**Handler:**
1. Load project by `dirName`
2. Get cached stats for all sessions (from Phase 1.3)
3. Call `triageSessions()` with metadata
4. Return `TriageResult`

### 2.3 Triage UI

**File:** new `cli/app/src/components/ProjectUploadFlow.tsx`

**Multi-step component** (like EnhanceFlow's phase machine):

**Step 1: Session Overview (Screen 43)**
- Full session list with stats table
- "Let AI pick sessions" button → calls triage endpoint
- Loading state while triage runs

**Step 2: Triage Results (Screen 44)**
- Selected sessions with checkboxes (checked) and significance tags
- Skipped sessions in collapsible `<details>` with checkboxes (unchecked)
- User can toggle any session
- "Enhance project" button → proceeds to Phase 3

### 2.4 API client

**File:** `cli/app/src/api.ts`

**New function:**
```ts
async function triageProject(dirName: string): Promise<TriageResult>
```

### 2.5 Tests

- Test hard-floor filtering (< 5 min, < 3 turns)
- Test triage prompt construction
- Test triage response parsing (valid JSON, fallback on malformed)
- Test UI: checkbox toggle updates selection state

**Commit boundary:** Triage works end-to-end, user can select/deselect sessions.

---

## Phase 3: CLI — Project Enhance

**Goal:** Enhance selected sessions + generate project narrative (mockup Screen 45).

**Both CLI and server need changes.** The LLM calls in this phase (triage, project narrative, refinement) must work through both providers:
- **Local (BYOK):** `cli/src/llm/project-enhance.ts` calls Anthropic directly. CLI-only, no server changes needed.
- **Proxy:** `cli/src/llm/proxy-provider.ts` calls Phoenix's `POST /api/enhance` with a `type` field. **Phoenix's enhance endpoint must be extended in Phase 5.9** to handle `type: "triage"`, `type: "project"`, and `type: "refine"`.

During Phase 3, build the local path first. The proxy path depends on Phoenix changes in Phase 5.9. If proxy is unavailable, fall back gracefully (scoring-only triage, no narrative, publish with basic metadata).

### 3.1 Project enhance prompt

**File:** new `cli/src/llm/project-enhance.ts`

**Spec:**
- Input: array of enhanced session summaries (title, devTake, skills, executionSteps, key decisions, duration, LOC)
- System prompt: "You are building a project narrative from multiple coding sessions..."
- Output:
  ```ts
  interface ProjectEnhanceResult {
    narrative: string;           // 2-3 sentence project description
    arc: Array<{                 // 4-7 project phases
      phase: number;
      title: string;
      description: string;
    }>;
    skills: string[];            // union, deduplicated
    timeline: Array<{            // grouped by time period
      period: string;
      label: string;
      sessions: Array<{
        sessionId: string;
        title: string;
        featured: boolean;
        tag?: string;
      }>;
    }>;
  }
  ```
- Model: `claude-sonnet-4-6` (needs to reason across sessions)
- Input also includes skipped session metadata (for timeline completeness)

### 3.2 Project enhance endpoint

**File:** `cli/src/server.ts`

**New route:** `POST /api/projects/:dirName/enhance-project`

**Request body:**
```json
{
  "selectedSessionIds": ["uuid1", "uuid2", ...],
  "skippedSessions": [{ "title": "...", "duration": 3, "loc": 12 }]
}
```

**Handler:**
1. Load project by `dirName`
2. For each selected session:
   a. Check if already enhanced (loadEnhancedData)
   b. If not, enhance it (bulk-style, 3 concurrent)
3. Collect all enhanced session summaries
4. Call `enhanceProject()` with summaries + skipped metadata
5. Return `ProjectEnhanceResult`

**SSE streaming** for progress (same pattern as bulk enhance):
- `{ type: 'session_progress', sessionId, status: 'enhancing'|'done'|'skipped' }`
- `{ type: 'project_enhance', status: 'generating' }`
- `{ type: 'done', result: ProjectEnhanceResult }`

### 3.3 Project enhance also generates targeted questions

The `ProjectEnhanceResult` includes AI-generated questions based on detected patterns:

```ts
interface ProjectEnhanceResult {
  // ... existing fields ...
  questions: Array<{
    id: string;
    category: 'pattern' | 'architecture' | 'evolution';
    question: string;
    context: string;  // why this question was generated
  }>;
}
```

The LLM generates 2-3 questions based on signals it found:
- High correction count → ask about override strategy
- Longest session → ask why that area was worth the investment
- Zero file overlap between sessions → ask about isolation decisions
- Technology switches → ask about the choice

### 3.4 Project enhance UI (Screen 45)

**File:** `cli/app/src/components/ProjectUploadFlow.tsx` — Step 3

**Left panel:** Session processing feed
- Checkmarks for completed sessions
- Spinner for current session
- Greyed out for pending
- "Building project story..." at the bottom

**Right panel:** Draft project narrative streaming in
- Phase bar
- Project name + description
- Skills row
- Timeline periods (progressive reveal)

### 3.5 Questions UI (Screen 48)

**File:** `cli/app/src/components/ProjectUploadFlow.tsx` — Step 4

- Shows 2-3 AI-generated questions with category tags ("Pattern detected", "Architecture", "Evolution")
- Each question has context explaining why it was asked
- Textareas for answers — all optional, can skip any
- "Skip questions" → proceeds with draft narrative as-is
- "Weave into narrative" → triggers second LLM pass

### 3.6 Narrative refinement endpoint

**File:** `cli/src/server.ts`

**New route:** `POST /api/projects/:dirName/refine-narrative`

**Request body:**
```json
{
  "draftNarrative": "...",
  "draftTimeline": [...],
  "answers": [
    { "questionId": "q1", "question": "...", "answer": "..." }
  ]
}
```

**Handler:**
1. Call LLM with draft narrative + user answers
2. LLM rewrites narrative weaving in the user's voice
3. Returns updated `{ narrative, timeline }` — same shape, richer content

Model: `claude-sonnet-4-6` (refinement, not generation — fast)

### 3.7 Narrative refinement prompt

**File:** `cli/src/llm/project-enhance.ts` — add `refineNarrative()` function

System prompt: "You are refining a project narrative by incorporating the developer's own perspective. Weave their answers naturally into the existing narrative — don't quote them verbatim, make it sound like the developer wrote it."

### 3.8 Tests

- Test project enhance prompt construction
- Test that already-enhanced sessions are not re-enhanced
- Test question generation from session signals
- Test narrative refinement with/without answers
- Test skip-questions path (draft narrative passes through unchanged)
- Test SSE event stream parsing

**Commit boundary:** Full enhance pipeline works — sessions enhanced, project narrative generated, questions asked, narrative refined.

---

## Phase 4: CLI — Timeline + Review + Publish

**Goal:** Timeline view, final review with project details (URLs, screenshot), and publish to Phoenix. This is where CLI and backend connect end-to-end.

**Mockup screens:** 46 (Timeline), 47 (Review), 12 (Success)

### 4.1 Timeline UI (Screen 46)

**File:** `cli/app/src/components/ProjectUploadFlow.tsx` — Step 6

**Matches mockup Screen 46.** Renders from `ProjectEnhanceResult.timeline`:
- Vertical timeline with period headers ("Week 1 — Foundation")
- Featured sessions as expanded cards (title, description, skills, duration tag)
- Non-featured sessions collapsed ("N smaller sessions — setup, deps, config")
- Key decision badges (from triage significance tags)
- Clickable featured sessions (link to `/session/:id` for preview)

### 4.2 Review UI (Screen 47)

**File:** `cli/app/src/components/ProjectUploadFlow.tsx` — Step 7

**Matches mockup Screen 47.** Shows:
- Project card preview (name, narrative, stats grid)
- Skills row
- "What gets published" checklist (sessions, stats, timeline, skipped metadata)
- **Project details section (all optional):**
  - Repository URL — pre-filled from `git remote get-url origin`, editable
  - Project URL — manual entry (live site, docs, demo)
  - Screenshot — drag-and-drop image upload
- "Publish project" button

### 4.3 Git remote auto-detection

**File:** `cli/src/server.ts` — new helper

```ts
async function detectGitRemote(projectDir: string): Promise<string | null>
```

Runs `git -C <path> remote get-url origin` and parses the result. Returns cleaned URL (strips `.git` suffix, converts SSH to HTTPS format). Returns null if no remote.

**New endpoint:** `GET /api/projects/:dirName/git-remote`
- Returns `{ url: "github.com/user/repo" }` or `{ url: null }`
- Called when Review step mounts

### 4.4 Screenshot upload

**File:** `cli/src/server.ts` — new endpoint

**New endpoint:** `POST /api/projects/:dirName/screenshot`
- Accepts multipart form data with image file
- Saves to `~/.config/heyiam/screenshots/<dirName>.{png,jpg}`
- Returns `{ path: "..." }`
- The screenshot file is uploaded to Phoenix object storage during publish

### 4.5 Project publish — CLI→Phoenix two-step process

This is the critical integration point. The CLI publishes to Phoenix in two steps:

**Step 1: Create/update the project record**

**CLI endpoint:** `POST /api/projects/:dirName/publish` (internal, localhost)

**Handler in `cli/src/server.ts`:**
1. Authenticate with Phoenix (get Bearer token from `~/.config/heyiam/auth.json`)
2. Build project payload from `ProjectEnhanceResult` + user inputs:
   ```json
   {
     "project": {
       "title": "heyi-am",
       "slug": "heyi-am",
       "narrative": "...",
       "timeline": [...],
       "skills": [...],
       "total_sessions": 21,
       "total_loc": 8400,
       "total_duration_minutes": 852,
       "total_files_changed": 97,
       "skipped_sessions": [...],
       "repo_url": "github.com/bencates/heyi.am",
       "project_url": "https://heyi.am"
     }
   }
   ```
3. `POST ${API_URL}/api/projects` → Phoenix upserts project, returns `{ project_id, slug }`
4. If screenshot exists, upload to Phoenix object storage via presigned URL

**Step 2: Publish selected sessions**

5. For each selected session (sequential, 2s spacing for rate limit):
   - Build session payload (same shape as current publish)
   - Add `project_id` from Step 1 response
   - `POST ${API_URL}/api/sessions` → Phoenix creates share with project FK
   - Call `markAsUploaded(sessionId)` on success
6. Stream SSE progress events to the React app

**SSE events:**
```
{ type: 'project', status: 'creating' }
{ type: 'project', status: 'created', projectId: 123, slug: 'heyi-am' }
{ type: 'screenshot', status: 'uploading' }
{ type: 'screenshot', status: 'uploaded' }
{ type: 'session', sessionId: '...', status: 'uploading', index: 0, total: 8 }
{ type: 'session', sessionId: '...', status: 'uploaded', index: 0, total: 8, url: '/s/...' }
{ type: 'session', sessionId: '...', status: 'failed', error: '...' }
{ type: 'done', projectUrl: '/ben/heyi-am', uploaded: 8, failed: 0 }
```

### 4.6 Project publish API client (React)

**File:** `cli/app/src/api.ts`

```ts
async function publishProject(
  dirName: string,
  enhanceResult: ProjectEnhanceResult,
  projectDetails: {
    repoUrl?: string;
    projectUrl?: string;
    screenshotPath?: string;
  },
  selectedSessionIds: string[],
  onEvent: (event: PublishEvent) => void,
  onError: (error: string) => void
): Promise<void>
```

Calls `POST /api/projects/:dirName/publish` with SSE streaming response (same pattern as existing bulk upload — `fetch` + `ReadableStream` reader).

### 4.7 Publishing UI + Success (Screen 12)

**File:** `cli/app/src/components/ProjectUploadFlow.tsx` — Step 8

**Publishing state** (matches existing bulk upload UX):
- Progress bar: "Publishing project... (3 of 8 sessions)"
- Per-session status chips (uploading → uploaded / failed)
- Cannot navigate away while publishing

**Success state** (matches mockup Screen 12):
- "Project Published" with project card preview
- Project URL: `heyi.am/ben/heyi-am` with copy button
- "View Project Page" → opens in browser
- "View Portfolio" → opens portfolio

### 4.8 Full flow integration

**File:** `cli/app/src/components/ProjectUploadFlow.tsx`

**Step machine:**
```
overview → triage → enhance → questions → timeline → review → publishing → done
```

Maps to mockup screens:
```
Screen 43 → Screen 44 → Screen 45 → Screen 48 → Screen 46 → Screen 47 → (publishing) → Screen 12
```

State held in `ProjectUploadFlow`:
```ts
{
  step: 'overview' | 'triage' | 'enhance' | 'questions' | 'timeline' | 'review' | 'publishing' | 'done';
  project: ProjectInfo;                    // from GET /api/projects
  sessionStats: SessionMetaWithStats[];    // cached stats for all sessions
  triageResult: TriageResult | null;
  selectedSessions: Set<string>;           // user can override triage
  enhanceResult: ProjectEnhanceResult | null;  // includes draft narrative + questions
  questionAnswers: Map<string, string>;    // questionId → answer text
  finalNarrative: string | null;           // after refinement pass (or draft if skipped)
  repoUrl: string;                         // auto-detected, editable
  projectUrl: string;                      // manual entry
  screenshotPath: string | null;           // local file path
  publishProgress: {
    phase: 'project' | 'screenshot' | 'sessions' | 'done';
    current: number;
    total: number;
    results: Array<{ sessionId: string; status: 'uploading' | 'uploaded' | 'failed'; url?: string }>;
  };
  projectPageUrl: string | null;           // set on success
}
```

### 4.9 Tests

- Test git remote detection (HTTPS, SSH, no remote)
- Test screenshot upload/save
- Test publish two-step process (project creation, then sessions)
- Test SSE event stream parsing for publish progress
- Test full step machine transitions (every step reachable)
- Test publish failure recovery (partial success shows which sessions uploaded)
- Test rate limiting behavior (2s spacing between session uploads)

**Commit boundary:** Full project upload flow works end-to-end: CLI → enhance → questions → narrative refinement → timeline → review → publish to Phoenix.

---

## Phase 5: Phoenix — Projects as First-Class Entities

**Goal:** Create a proper `projects` table, squash migrations, rewrite the portfolio controller and templates to render project narrative, arc, and timeline.

**No backward compatibility.** We squash all existing migrations, create a clean schema, and rewrite the portfolio rendering from scratch.

### 5.1 Squash migrations

**Delete** all files in `phoenix/priv/repo/migrations/`. Replace with a single clean migration:

**New file:** `phoenix/priv/repo/migrations/20260322000000_initial_schema.exs`

Creates all tables from scratch with the correct schema from day one:

**Note:** `user_take` is intentionally absent from the projects table. The user's voice is woven into `narrative` via the two-pass refinement (questions → "Weave into narrative"). There is no separate raw quote field — the narrative IS the user's perspective after refinement.

```elixir
# users table (unchanged)

# NEW: projects table
create table(:projects) do
  field :slug, :string, null: false
  field :title, :string, null: false
  field :narrative, :text                      # AI-generated, refined with user's question answers
  field :repo_url, :string                     # optional, auto-detected from git
  field :project_url, :string                  # optional, manual entry
  field :screenshot_key, :string               # optional, S3 key
  field :timeline, {:array, :map}, default: [] # [{period, label, sessions[]}]
  field :skills, {:array, :string}, default: []
  field :total_sessions, :integer
  field :total_loc, :integer
  field :total_duration_minutes, :integer
  field :total_files_changed, :integer
  field :skipped_sessions, {:array, :map}, default: []
  belongs_to :user
  timestamps()
end
create unique_index(:projects, [:user_id, :slug])

# shares table — removed: project_meta, challenge_id. Added: project_id, slug, agent_summary
create table(:shares) do
  # ... all existing fields MINUS project_meta and challenge_id ...
  field :slug, :string                       # NEW: slugified title for friendly URLs
  field :project_name, :string               # kept for CLI-side grouping reference
  field :agent_summary, :map                 # NEW: {is_orchestrated, agents: [{role, duration, loc}]}
  belongs_to :project                        # NEW: FK to projects table
  belongs_to :user
  timestamps()
end

# portfolio_sessions table — NOT CREATED. Replaced by projects table + shares.project_id FK.
```

### 5.2 Create Project schema and context

**New file:** `phoenix/lib/heyi_am/projects/project.ex`

```elixir
schema "projects" do
  field :slug, :string
  field :title, :string
  field :narrative, :string
  field :repo_url, :string
  field :project_url, :string
  field :screenshot_key, :string
  field :timeline, {:array, :map}, default: []
  field :skills, {:array, :string}, default: []
  field :total_sessions, :integer
  field :total_loc, :integer
  field :total_duration_minutes, :integer
  field :total_files_changed, :integer
  field :skipped_sessions, {:array, :map}, default: []
  belongs_to :user, HeyiAm.Accounts.User
  has_many :shares, HeyiAm.Shares.Share
  timestamps()
end
```

**Rename:** `phoenix/lib/heyi_am/projects.ex` (current pure-computation module) → `phoenix/lib/heyi_am/projects/stats.ex` to avoid naming collision. The new `phoenix/lib/heyi_am/projects.ex` becomes the context module with `create_project/1`, `update_project/2`, `get_project_by_slug/2`, `list_user_projects/1`.

### 5.3 New API endpoint: create/update project

**New route:** `POST /api/projects`

**File:** `phoenix/lib/heyi_am_web/controllers/project_api_controller.ex`

**Accepts:**
```json
{
  "project": {
    "title": "heyi-am",
    "slug": "heyi-am",
    "narrative": "...",
    "repo_url": "github.com/bencates/heyi.am",
    "project_url": "https://heyi.am",
    "timeline": [...],
    "skills": [...],
    "total_sessions": 21,
    "total_loc": 8400,
    "total_duration_minutes": 852,
    "total_files_changed": 97,
    "skipped_sessions": [...]
  }
}
```

**Behavior:** Upserts by `(user_id, slug)`. If project exists, updates it. If not, creates it. Returns `{ project_id, slug }`.

### 5.4 Modify session creation to link to project

**File:** `phoenix/lib/heyi_am_web/controllers/share_api_controller.ex`

**Change:** Accept optional `project_id` in session payload. If present, set the FK. The CLI sends `project_id` (received from the `POST /api/projects` response) with each session in the bulk upload.

Remove `project_meta` from share schema and changeset — project data lives on the `projects` table now.

### 5.5 Add friendly session URL route

**File:** `phoenix/lib/heyi_am_web/router.ex`

Add `/:username/:project/:session` route. **Route ordering is critical** — this must go BEFORE the `/:username/:project` catch and the `/:username` catch-all:

```elixir
# Session within project context — must be before /:username/:project
get "/:username/:project/:session", ShareController, :show_in_project

# Project page
get "/:username/:project", PortfolioController, :project

# Portfolio — catch-all, must be last
get "/:username", PortfolioController, :show
```

The `show_in_project` action looks up by `(username, project_slug, session_slug)` and renders the same template as `/s/:token` but with breadcrumbs showing the project context.

### 5.6 Rewrite portfolio controller

**File:** `phoenix/lib/heyi_am_web/controllers/portfolio_controller.ex`

**`show/2` (portfolio index):**
- Query `projects` table directly for the user (not derived from share grouping)
- Each project has its own stats, skills, narrative — no computation needed
- Shares without a `project_id` grouped as "Ungrouped" (backward compat for any stragglers)

**`project/2` (project detail):**
- Load project by `(user_id, slug)` with preloaded shares
- Project narrative, arc, timeline, skills, stats all come from the project record
- Shares provide the individual session case studies
- No more `build_project_detail/2` computing stats from shares — the source of truth is the project record

### 5.7 Rewrite portfolio template

**File:** `phoenix/lib/heyi_am_web/controllers/portfolio_html/show.html.heex`

**Rewrite from scratch.** Matches **mockup Screen 24** (`interactive-flow.html`).

1. **User hero** — name, bio, location, avatar, skills
2. **AI Collaboration Profile** — 4 dimension bars (computed from all shares)
3. **Project cards** — one card per project, each with: title, narrative (2-3 lines), stats grid (sessions with "N published", time, LOC, files), skills row. Clicking → `/:username/:project`
4. **Aggregate stats** — total sessions, total time, total LOC across all projects
5. **Sidebar** — project links (repo/project URLs), recent activity

**Data:** `projects = Projects.list_user_projects(user.id)`. For each project, compute `published_count` from `shares` table. Collaboration profile computed from all user's shares.

### 5.8 Rewrite project template

**File:** `phoenix/lib/heyi_am_web/controllers/portfolio_html/project.html.heex`

**Rewrite from scratch.** New structure:

Matches **mockup Screen 25** (`interactive-flow.html`).

1. **Breadcrumb** — `ben / heyi-am`
2. **Project header** — title + repo link + project link (optional)
3. **Project narrative** — `@project.narrative` (border-left accent)
4. **Skills row** — from `@project.skills`
5. **Screenshot** — from `@project.screenshot_key` (optional)
6. **Hero stats** — from project record, with "N published" count from shares
7. **Agent activity** — SVG timelines per session showing orchestration patterns
8. **Project timeline** — from `@project.timeline`, period headers as arc, featured sessions link to `/:username/:project/:session-slug`, collapsed groups for small sessions
9. **Growth chart** — computed from published shares (existing SVG logic)
10. **Directory heatmap** — computed from published shares (existing logic)
11. **Top files** — computed from published shares (existing logic)

### 5.9 Extend enhance proxy for project-level calls

**File:** `phoenix/lib/heyi_am_web/controllers/enhance_api_controller.ex` + `phoenix/lib/heyi_am/llm.ex`

The existing `POST /api/enhance` handles single-session enhancement. Extend it to handle project-level calls via a `type` field:

```elixir
def create(conn, %{"type" => "triage", "sessions" => sessions}) -> triage response
def create(conn, %{"type" => "project", "sessions" => sessions}) -> project narrative response
def create(conn, %{"type" => "refine", "narrative" => ..., "answers" => ...}) -> refined narrative
def create(conn, %{"session" => session}) -> existing session enhancement (default)
```

Each type routes to a different prompt builder in `HeyiAm.LLM`. All types share the same auth, rate limiting, and quota tracking.

**New LLM submodules:**
- `phoenix/lib/heyi_am/llm/triage_prompt.ex` — triage system/user prompts
- `phoenix/lib/heyi_am/llm/project_prompt.ex` — project narrative prompts
- `phoenix/lib/heyi_am/llm/refine_prompt.ex` — refinement prompts

### 5.10 Screenshot presigned URL endpoint

**File:** `phoenix/lib/heyi_am_web/controllers/project_api_controller.ex`

**New route:** `POST /api/projects/:slug/screenshot-url`

**Handler:**
1. Authenticate (require Bearer token)
2. Look up project by `(user_id, slug)`
3. Generate presigned PUT URL for `projects/<slug>/screenshot.<ext>` (ext from request)
4. Return `{ upload_url: "...", key: "projects/<slug>/screenshot.png" }`
5. After CLI uploads, a follow-up `PATCH /api/projects/:slug` updates `screenshot_key`

### 5.11 Replace portfolios context with projects context

**Delete:** `phoenix/lib/heyi_am/portfolios.ex` and `phoenix/lib/heyi_am/portfolios/portfolio_session.ex`

**What moves where:**
- `Portfolios.list_visible_portfolio_sessions/1` → replaced by `Projects.list_user_projects/1` which returns projects with preloaded shares
- `Portfolios.add_to_portfolio/2` (called from `Shares.create_share/1`) → removed entirely. Shares are linked to projects via `project_id` FK at publish time, not auto-added.
- `PortfolioSession` ordering/visibility → session ordering within a project is determined by `recorded_at` (chronological). Visibility is project-level: if a project exists, it's visible. No per-session visibility toggle in v1.
- `portfolio_sessions` table → not created in the squashed migration

**Update `Shares.create_share/1`:** Remove the `add_to_portfolio` call (line 31 in current `shares.ex`). Shares are just inserted into the DB. The project FK is set in the payload.

### 5.12 Update CLI publish flow

**File:** `cli/src/server.ts`

**Change the bulk upload to a two-step process:**
1. `POST /api/projects` — create/update the project record, get back `project_id`
2. If screenshot: `POST /api/projects/:slug/screenshot-url` → presigned PUT → upload image
3. `POST /api/sessions` (x N) — each session includes `project_id` FK

Remove `project_meta` from session payloads entirely. Remove `computeProjectMeta()` helper.

### 5.13 Tests

- Test project creation via `POST /api/projects`
- Test project upsert (same slug updates, doesn't duplicate)
- Test screenshot presigned URL generation
- Test session creation with `project_id` FK
- Test portfolio index renders projects from `projects` table (Screen 24)
- Test project detail page with narrative, timeline (Screen 25)
- Test project page with no narrative (project created without AI enhance)
- Test stats come from project record, not from summing shares
- Test friendly URL `/:username/:project/:session-slug` resolves same as `/s/:token`

**Commit boundary:** Clean schema, proper projects table, rewritten portfolio rendering.

---

## Phase 6: Polish + Edge Cases

### 6.1 Re-upload flow

When a project has already been published:
- Screen 2 shows "Update Project" instead of "Upload"
- Triage pre-checks already-published sessions
- Enhance skips already-enhanced sessions
- CLI calls `POST /api/projects` (upsert) + publishes only new sessions
- Project narrative updated, old sessions remain

### 6.2 No API key fallback

- Triage: hard floor only (skip < 5 min, < 3 turns, select the rest)
- Enhance: uses proxy provider
- Project enhance: uses proxy provider
- If proxy unavailable: publish sessions with basic project metadata (title, stats), no narrative

### 6.3 Small project optimization

Projects with < 5 sessions:
- Skip triage (select all)
- Go directly from overview to enhance
- Timeline grouped as single period

### 6.4 Error recovery

- Session enhance fails: mark failed, continue with others
- Project enhance fails: offer to publish sessions without narrative
- Publish fails midway: show which succeeded, offer retry for remaining

---

## File Change Summary

### New files

| File | Purpose |
|------|---------|
| `cli/src/llm/triage.ts` | AI triage — hard floor + signal extraction + LLM ranking |
| `cli/src/llm/project-enhance.ts` | Project narrative generation + question generation + narrative refinement |
| `cli/src/cache.ts` | Session stats cache (LOC, duration per session) |
| `cli/app/src/components/ProjectDashboard.tsx` | Project cards landing page (Screen 2) |
| `cli/app/src/components/ProjectUploadFlow.tsx` | Multi-step project upload wizard (Screens 43→44→45→48→46→47→12) |
| `phoenix/lib/heyi_am/projects/project.ex` | Project schema |
| `phoenix/lib/heyi_am_web/controllers/project_api_controller.ex` | Project API endpoint (POST /api/projects) |
| `phoenix/priv/repo/migrations/20260322000000_initial_schema.exs` | Squashed clean migration |

### Rewritten files

| File | Change |
|------|--------|
| `cli/src/server.ts` | Add triage, project-enhance, refine-narrative, git-remote, screenshot, publish endpoints |
| `cli/app/src/App.tsx` | New routes: `/` → ProjectDashboard, `/project/:dirName/upload` → ProjectUploadFlow |
| `cli/app/src/api.ts` | Add triage, project-enhance, refine-narrative, publish-project, git-remote API functions |
| `cli/app/src/types.ts` | Add `ProjectEnhanceResult`, `TriageResult`, `SessionSignals`, `SessionMetaWithStats`, `PublishEvent` types |
| `cli/app/src/SessionsContext.tsx` | Add project stats to Project type |
| `phoenix/lib/heyi_am/projects.ex` | Context module (was pure computation, now DB context) |
| `phoenix/lib/heyi_am/shares/share.ex` | Remove `project_meta`, add `project_id` FK |
| `phoenix/lib/heyi_am/shares.ex` | Update `create_share` to link project |
| `phoenix/lib/heyi_am_web/controllers/share_api_controller.ex` | Accept `project_id` |
| `phoenix/lib/heyi_am_web/controllers/portfolio_controller.ex` | Query projects table directly |
| `phoenix/lib/heyi_am_web/controllers/portfolio_html/project.html.heex` | Full rewrite (Screen 25) |
| `phoenix/lib/heyi_am_web/controllers/portfolio_html/show.html.heex` | Rewrite as project index (Screen 24) |
| `phoenix/lib/heyi_am_web/controllers/share_html/show.html.heex` | Add agent timeline SVG (Screen 23) |
| `phoenix/lib/heyi_am_web/router.ex` | Add `POST /api/projects`, `/:username/:project/:session-slug` routes |

### Deleted files

| File | Reason |
|------|--------|
| `phoenix/priv/repo/migrations/20260321*` | Squashed into single initial migration |
| `phoenix/priv/repo/migrations/20260322100000_add_project_meta_to_shares.exs` | Replaced by projects table |
| `phoenix/lib/heyi_am/portfolios.ex` | Simplified — portfolio is just "user's projects" now |
| `cli/app/src/components/SessionList.tsx` | Replaced by ProjectDashboard |
| `cli/app/src/components/EnhanceFlow.tsx` | Enhancement happens inside ProjectUploadFlow |
| `cli/app/src/components/SessionEditorPage.tsx` | No per-session editing in v1 |
| `cli/app/src/components/SessionDetail.tsx` | No standalone session detail in v1 |

### Mockup Reference

All UI mockups are in `mockups/interactive-flow.html`. Open in browser and use the nav tabs:

| Screen | Nav Label | Purpose |
|--------|-----------|---------|
| 1 | Empty | CLI empty state |
| 2 | Projects | Project dashboard (landing page) |
| 43 | Upload | Project overview with session list |
| 44 | Triage | AI session selection with override controls |
| 45 | Enhance | Session + project enhancement with progress feed |
| 48 | Questions | Context-aware questions from AI findings |
| 46 | Timeline | Project timeline with featured + collapsed sessions |
| 47 | Review | Final review with project details + publish button |
| 12 | Success | Project published confirmation |
| 24 | Portfolio | Public portfolio page (project cards) |
| 25 | Project | Public project page (narrative, timeline, agent activity) |
| 23 | Session | Public session case study (agent timeline SVG) |

## Commit Sequence

```
 0. [Cleanup] Delete dead CLI components, endpoints, old mockups, update App.tsx
 1. [CLI] Add session stats cache + project stats in GET /api/projects
 2. [CLI] ProjectDashboard component (Screen 2)
 3. [CLI] Triage — signal extraction + LLM prompt + endpoint (local provider)
 4. [CLI] ProjectUploadFlow — overview (Screen 43) + triage (Screen 44) steps
 5. [CLI] Project enhance — narrative + questions prompt + endpoint (local provider)
 6. [CLI] ProjectUploadFlow — enhance step (Screen 45)
 7. [CLI] Narrative refinement prompt + endpoint (local provider)
 8. [CLI] ProjectUploadFlow — questions step (Screen 48)
 9. [CLI] ProjectUploadFlow — timeline step (Screen 46)
10. [CLI] Git remote detection + screenshot upload
11. [CLI] ProjectUploadFlow — review step (Screen 47)
12. [Phoenix] Squash migrations, create projects table + shares.slug + shares.agent_summary
13. [Phoenix] POST /api/projects endpoint (upsert)
14. [Phoenix] Update share creation — accept project_id FK, slug, agent_summary
15. [Phoenix] Add /:username/:project/:session-slug route (before catch-alls)
16. [Phoenix] Extend POST /api/enhance — add type: triage/project/refine handlers
17. [CLI] Update ProxyProvider to send type field for project-level calls
18. [CLI] Two-step publish: POST /api/projects then POST /api/sessions
19. [CLI] ProjectUploadFlow — publishing + success (Screen 12)
20. [CLI] Full e2e test: project upload flow (both local and proxy providers)
21. [Phoenix] Rewrite portfolio controller to query projects table
22. [Phoenix] Rewrite portfolio template (Screen 24) — project cards
23. [Phoenix] Rewrite project template (Screen 25) — narrative, timeline, agent activity
24. [Phoenix] Rewrite session case study template (Screen 23) — agent timeline SVG
25. [Phoenix] Tests for project API + enhance proxy + portfolio rendering
26. [Polish] Re-upload, small project optimization, error recovery
```

Each commit references its mockup screen. No backward compatibility preserved.
