# heyi.am — Complete Product Implementation Plan

## Context

heyi.am turns AI coding sessions into evidence-backed developer portfolios. Two surfaces:
- **CLI (`heyiam`)**: Local React app — browse, enhance, publish sessions
- **Web (Phoenix)**: Public pages, portfolio editor, auth, interview challenges

**Source of truth:**
- **Interactive prototype:** `mockups/interactive-flow.html` — 42 clickable screens, open in browser, arrow keys to navigate
- **Design system:** `mockups/full/DESIGN.md` — colors, typography, spacing, component philosophy ("The Calibrated Archive")
- **Per-screen mockups:** `mockups/new/*/screen.png` + `code.html` — referenced in each task below

**Note:** The interactive prototype is the latest iteration and supersedes the static mockup images where they differ (e.g., LOC stats, collapsible evidence sections, no sealing on portfolio sessions). Use the prototype as the primary reference, mockup images for visual detail.

**Key decisions:**
- CLI command is `heyiam` (not `ccs`)
- No sealing on portfolio sessions — sealing is interview-only
- Anti-fluff questions happen inline during AI enhancement
- Sessions auto-add to portfolio on publish
- LOC stats alongside turns/files/tool calls
- Devs can pin prompts and highlight execution steps
- Growth chart + directory heatmap on project pages
- Design system: Seal Blue (#084471), tonal layering, no border separators

---

## Progress

- [x] **Phase 0** — Archive & Cleanup (3/3)
- [x] **Phase 1** — Design System & Shared Components (4/5) — Task 1.5 skipped (already done)
- [x] **Phase 2** — CLI: Session Browser (3/3)
- [x] **Phase 3** — CLI: Session Detail & Enhancement (3/3)
- [x] **Phase 4** — CLI: Editor & Publishing (5/5)
- [x] **Phase 5** — Web: Landing, Auth & Onboarding (6/6)
- [x] **Phase 6** — Web: Portfolio Editor (3/3)
- [x] **Phase 7** — Web: Public Pages (4/4, 7.5 deferred to Phase 12)
- [x] **Phase 8** — CLI Backend & Parser (12/12) — scaffold, parser, LOC, analyzer, AI enhance, auth, subagent hierarchy, fork/join timeline
- [ ] **Phase 9** — Session Templates (0/5)
- [ ] **Phase 10** — Interview / Challenge Flow (0/6)
- [ ] **Phase 11** — Edge Cases & Mobile (0/6)
- [ ] **Phase 12** — Backend & Data Model extras (0/4)

---

## Phase 0: Archive & Cleanup

### Task 0.1 — Archive Current Codebase ✅
Move current implementation to `old/` for reference:
```
mv phoenix/ old/phoenix/
mv cli/ old/cli/
```
The `old/` directory preserves working business logic, API contracts, tests, and schemas for reference during the rebuild.

### Task 0.2 — Clean Up Old Docs ✅
Delete outdated docs:
- `docs/DESIGN_PRD.md`
- `docs/MANUAL_TEST_PLAN.md`
- `docs/PORTFOLIO_COMPLETION.md`
- `docs/SEALED_SESSIONS_AND_CHALLENGES.md`

Replace with this implementation plan.

### Task 0.3 — Scaffold New Apps ✅
Create fresh Phoenix app and CLI app with correct naming:
- `phoenix/` — new Phoenix app
- `cli/` — new CLI app with `heyiam` as the command name

---

## Phase 1: Design System & Shared Components

### Task 1.1 — Phoenix CSS Rewrite ✅
**Screen ref:** All screens (design foundation)
**Files:** `phoenix/assets/css/app.css` (1,414 lines, 25KB bundled)
**Source:** `mockups/full/DESIGN.md`

Built complete CSS from DESIGN.md spec: tokens, 5-tier surface system, ghost borders, typography scale (15 classes), 20+ component classes (topbar, sidebar, buttons, chips, cards, stats grid, terminal, exec-path, dev-take, data tables, badges, glass bar, layouts, utilities). esbuild asset pipeline configured (0.25.4 binary). Google Fonts loaded in root.html.heex.

### Task 1.2 — CLI CSS Rewrite ✅
**Screen ref:** All CLI screens
**Files:** `cli/app/src/App.css`, `cli/app/src/index.css`

Same tokens as Phoenix. Component classes: `.app-shell`, `.app-header`, `.app-sidebar`, `.session-card`, `.raw-log`, `.enhance-flow`, `.editor-panel`, `.btn`, `.chip`, `.stats-grid`, `.terminal`, `.exec-path`, `.badge`, `.glass-panel`, `.card`. Google Fonts in `index.html`.

### Task 1.3 — Phoenix App Shell Component ✅
**Screen ref:** Screens 14, 23-27 (public shell), Screens 20-22 (editor shell)
**Files:** `phoenix/lib/heyi_am_web/components/app_shell.ex`

Two function components: `public_shell/1` (light topbar, centered content, nav slots) and `editor_shell/1` (dark topbar, sidebar slot, action buttons). Imported globally via HeyiAmWeb html_helpers. 14 component tests passing.

### Task 1.4 — CLI App Shell Component ✅
**Screen ref:** Screens 1-13
**Files:** `cli/app/src/components/AppShell.tsx`

React component with header (logo, back arrow, title, auth dot, settings gear), optional sidebar, main content, optional glassmorphism bottom bar. 14 tests passing (Vitest + React Testing Library).

### Task 1.5 — Rename CLI from `ccs` to `heyiam` ✅ (pre-existing)
Already done — `cli/package.json` has `"name": "heyiam"` and `"bin": { "heyiam": ... }`.

---

## Phase 2: CLI — Session Browser

### Task 2.1 — Session Browser: Empty State ✅
**Screen 1**
**Files:** `cli/app/src/components/SessionList.tsx`

App shell with "heyiam" logo + settings gear. Setup banner card prompting for API key with link to settings. Centered "No sessions found" empty state. React Router added for navigation between views. 12 component tests.

### Task 2.2 — Session Browser: With Projects ✅
**Screen 2**
**Mockup image:** `mockups/new/session_browser/screen.png`
**Mockup HTML:** `mockups/new/session_browser/code.html`
**Files:** `cli/app/src/components/SessionList.tsx`

Three-panel layout: project sidebar with colored dots and "All Projects" filter, session card list (title, date, duration, turns, LOC, status badge), raw log preview terminal with blinking cursor. "Enhance with AI" CTA in glassmorphism bottom bar (visible only when session selected). Mock data: 4 projects, 6 sessions.

### Task 2.3 — Settings Page ✅
**Screen 4**
**Files:** `cli/app/src/components/Settings.tsx`

Three sections: API Configuration (password input with show/hide toggle), Authentication (status badge, username, `heyiam login` terminal block), Machine Identity (Ed25519 token + SHA256 fingerprint). Back navigation to home. Settings-specific CSS added to App.css. 11 component tests.

---

## Phase 3: CLI — Session Detail & Enhancement

### Task 3.1 — Session Detail: Raw View ✅
**Screen 3**
**Mockup image:** `mockups/new/public_case_study/screen.png` (similar layout, CLI variant)
**Files:** `cli/app/src/components/SessionDetail.tsx`, `cli/app/src/components/SharePreview.tsx`

Built single-column centered layout (max-width 56rem) matching interactive prototype Screen 3. Stats grid (duration, turns, files changed, LOC), context block, skills chips, execution path with timeline spine, collapsible sections (tool breakdown bar chart, turn timeline, files changed). Two action buttons: "Enhance with AI" + "Edit & Publish". Extended Session data model with rich fields (executionPath, toolBreakdown, filesChanged, turnTimeline, skills, context, developerTake) in `types.ts` + `mock-data.ts`. SharePreview built as standalone reusable case study renderer. 12 SessionDetail tests, 13 SharePreview tests.

### Task 3.2 — Enhance: No API Key Error ✅
**Screen 5**
**Files:** `cli/app/src/components/SessionDetail.tsx` (conditional)

Implemented as inline banner (per product decision — not a separate screen as shown in interactive prototype). `hasApiKey` prop on SessionDetail (default true). When false and user clicks "Enhance with AI", shows `.setup-banner` error with link to Settings + "publish without enhancement" link to editor. 3 tests covering error show/hide behavior.

### Task 3.3 — Enhance: Interactive Flow (4 phases) ✅
**Screen 6** (JS-interactive: phases advance on click)
**Mockup image:** `mockups/new/enhancement_view/screen.png`
**Mockup HTML:** `mockups/new/enhancement_view/code.html`
**Files:** `cli/app/src/components/EnhanceFlow.tsx`

Single `EnhanceFlow.tsx` with `Phase` state machine (`'analyzing' | 'questions' | 'streaming' | 'done'`). Two-column split: dark raw log panel (left, persists) + phase-dependent right panel. Phase 1: pulsing status + AI feed lines revealed progressively, auto-advances after 2s. Phase 2: 3 context-aware questions with textareas (suggested answers as placeholders), skip/unskip per question, "Continue" button. Phase 3: case study items stream in with fade transition (title → skills → steps → take), auto-advances to done. Phase 4: complete results + Q&A summary + "Edit & Publish" / "Discard" actions. Breadcrumb nav at top. 404 handling. 12 tests with fake timers covering all phase transitions.

---

## Phase 4: CLI — Editor & Publishing

### Task 4.1 — Session Editor
**Screen 9**
**Mockup image:** `mockups/new/workbench_editor_v2/screen.png`
**Mockup HTML:** `mockups/new/workbench_editor_v2/code.html`
**Files:** `cli/app/src/components/SessionEditor.tsx`, `cli/app/src/components/SessionEditorPage.tsx`

- Left: raw session digest (dark terminal)
- Right: editable fields — title (large), YOUR TAKE (textarea + char counter), context, execution path (reorderable), skills (chips)
- Pin/highlight controls: pin icon per turn, highlight toggle per step
- "Publish →" CTA (no "Seal" language)

### Task 4.2 — Editor: Auth Prompt
**Screen 10**
**Files:** `cli/app/src/components/SessionEditorPage.tsx`

- Modal: "Connect your account?"
- "Connect now" → device auth flow
- "Publish anonymously" fallback

### Task 4.3 — Publish: Terminal Animation
**Screen 11**
**Mockup image:** `mockups/new/workbench_share_success/screen.png`
**Mockup HTML:** `mockups/new/workbench_share_success/code.html`
**Files:** `cli/app/src/components/SessionEditorPage.tsx`

- Terminal window with `$ heyiam publish`
- Animated: signing → uploading → published
- No "sealed" language

### Task 4.4 — Publish Success: Linked
**Screen 12**
**Files:** `cli/app/src/components/SessionEditorPage.tsx`

- "Session Published" + URL + copy button + "View on Portfolio"

### Task 4.5 — Publish Success: Anonymous
**Screen 13**
**Files:** `cli/app/src/components/SessionEditorPage.tsx`

- Delete code warning
- "Want a portfolio? Run: heyiam login"

---

## Phase 5: Web — Landing, Auth & Onboarding

### Task 5.0 — Auth Foundation ✅
**Files:** `phoenix/lib/heyi_am/accounts.ex`, `phoenix/lib/heyi_am/accounts/user.ex`, migrations

Fresh `mix phx.gen.auth Accounts User users`. Clean migration for profile fields (username, display_name, bio, avatar_url, github_id, github_url, location, status, portfolio_layout, portfolio_accent). User schema with `profile_changeset/2`, `username_changeset/2` (3-39 chars, lowercase alphanumeric + hyphens), `github_changeset/2`. GitHub OAuth via ueberauth + ueberauth_github — `OAuthController` at `/auth/github`, `find_or_create_from_github/1` matches on `github_id` only. 162 tests passing.

### Task 5.1 — Landing Page ✅
**Screen 14**
**Files:** `phoenix/lib/heyi_am_web/controllers/page_html/home.html.heex`

Built full landing page with `public_shell`: hero with terminal visual, 3 feature cards (CLI Ingestion, AI Enhancement, Cryptographic Sealing), Featured Takes with 4 mock session cards, AI Collaboration Profile bars, dark dual-audience section, bottom CTA with install command. All hardcoded placeholder content. Responsive grid classes added to app.css.

### Task 5.2 — Sign Up Page ✅
**Screen 15**
**Files:** `phoenix/lib/heyi_am_web/controllers/user_registration_html/new.html.heex`

### Task 5.3 — Log In Page ✅
**Screen 16**
**Files:** `phoenix/lib/heyi_am_web/controllers/user_session_html/new.html.heex`

Auth pages styled with `public_shell`, centered `.auth-card` layout, GitHub OAuth button with SVG icon, "or" divider, design system typography and colors. Login supports magic link, email+password, and GitHub OAuth. Confirm page also styled.

### Task 5.4 — Claim Username ✅
**Screen 17**
**Mockup image:** `mockups/new/claim_your_name/screen.png`
**Mockup HTML:** `mockups/new/claim_your_name/code.html`
**Files:** `phoenix/lib/heyi_am_web/live/onboarding/claim_username_live.ex`

LiveView at `/onboarding/username` with `live_session :authenticated`. 3-column layout: mock live feed, form with live AVAILABLE/TAKEN badge via phx-change, protocol note. Redirects to vibe picker on claim. Route guard redirects to portfolio if username already set.

### Task 5.5 — Portfolio: Empty State ✅
**Screen 18**
**Files:** `phoenix/lib/heyi_am_web/controllers/portfolio_html/show.html.heex`, `portfolio_controller.ex`

`/:username` route with `PortfolioController`. Template-aware rendering via `tpl-{layout}` CSS class from user's `portfolio_layout` field. Shows user info + terminal install commands. 404 for unknown usernames.

### Task 5.6 — Vibe Picker ✅
**Screen 19**
**Mockup image:** `mockups/new/workbench_vibe_picker/screen.png`
**Mockup HTML:** `mockups/new/workbench_vibe_picker/code.html`
**Files:** `phoenix/lib/heyi_am_web/live/onboarding/vibe_picker_live.ex`

LiveView at `/onboarding/vibe`. 6 template cards in grid with live preview panel. "Save & Deploy" saves `portfolio_layout` to user and redirects to portfolio. Reusable in Phase 6 portfolio editor.

---

## Phase 6: Web — Portfolio Editor

### Task 6.1 — Portfolio Editor: Overview ✅
**Screen 20**
**Mockup image:** `mockups/new/portfolio_editor_wysiwyg_2/screen.png`
**Mockup HTML:** `mockups/new/portfolio_editor_wysiwyg_2/code.html`
**Files:** `phoenix/lib/heyi_am_web/live/portfolio_editor_live.ex`

- Editor shell with left sidebar (project list, nav)
- WYSIWYG hero (inline-editable name, bio)
- Project cards with expand/collapse
- Expertise ledger (categorized skill bars)
- Bottom dock: template + accent + "View as Visitor"

### Task 6.2 — Portfolio Editor: Project Expanded ✅
**Screen 21**
**Files:** `phoenix/lib/heyi_am_web/live/portfolio_editor_live.ex`

- Session list per project
- Toggle: in portfolio / not (default ON for newly published)
- Drag reorder via native HTML5 drag-and-drop + Sortable LiveView hook

### Task 6.3 — Project Editor (New Page) ✅
**Screen 22**
**Mockup image:** `mockups/new/project_editor_project_alpha/screen.png`
**Mockup HTML:** `mockups/new/project_editor_project_alpha/code.html`
**Files:** `phoenix/lib/heyi_am_web/live/project_editor_live.ex`

- Left sidebar: project nav
- Main left: Project Definition — title, description, taxonomy tags
- Main right: Session Management — list with reorder + visibility
- Drag reorder via shared Sortable hook (`phoenix/assets/js/app.js`)

---

## Phase 7: Web — Public Pages

### Task 7.1 — Session Case Study (Editorial)
**Screen 23**
**Mockup image:** `mockups/new/public_case_study/screen.png`
**Mockup HTML:** `mockups/new/public_case_study/code.html`
**Files:** `phoenix/lib/heyi_am_web/controllers/share_html/show.html.heex`, `share_controller.ex`

- 2-col: main (ref, title, stats with LOC, Developer Take card, skills, Q&A) + sidebar (execution timeline, terminal preview, source info)
- Full-width below: highlights, collapsibles (tools, turns, files, narrative)
- No seal badge for portfolio sessions

### Task 7.2 — Portfolio Page
**Screen 24**
**Mockup image:** `mockups/new/developer_portfolio_v2/screen.png`
**Mockup HTML:** `mockups/new/developer_portfolio_v2/code.html`
**Files:** `phoenix/lib/heyi_am_web/controllers/portfolio_html/show.html.heex`, `portfolio_controller.ex`

- Public shell
- Hero (col-8) + sidebar card (col-4)
- AI Collaboration Profile (bar charts)
- "Active Deployment Logs" (2-col project cards)
- Bottom metric boxes

### Task 7.3 — Project Detail Page
**Screen 25**
**Mockup image:** `mockups/new/project_portfolio_project_alpha/screen.png`
**Mockup HTML:** `mockups/new/project_portfolio_project_alpha/code.html`
**Files:** `phoenix/lib/heyi_am_web/controllers/portfolio_html/project.html.heex`, `portfolio_controller.ex`

- Breadcrumb, title, hero stat + supporting stats
- Project Take section
- ~~Cumulative growth chart (SVG: LOC across sessions)~~ — **deferred to Phase 8** (needs real session LOC data)
- ~~Directory heatmap (grid: dirs × sessions)~~ — **deferred to Phase 8** (needs real file change data)
- Top files table (collapsible)
- Session cards (2-col, gradient headers, LOC)

### Task 7.4 — Transcript: Deep Dive
**Screen 26**
**Mockup image:** `mockups/new/session_deep_dive_log/screen.png`
**Mockup HTML:** `mockups/new/session_deep_dive_log/code.html`
**Files:** `phoenix/lib/heyi_am_web/controllers/share_html/transcript.html.heex`

- Chat-style with PROMPT_ID/RESPONSE_ID labels + timestamps
- CRITICAL DECISION highlight blocks
- Full conversation

### Task 7.5 — Sealed Verification (Interview Only) — **deferred to Phase 11**
**Screen 27**
**Files:** `phoenix/lib/heyi_am_web/controllers/share_controller.ex`

- Ed25519 signature + hash verification
- Only for interview challenge responses
- Depends on challenge schema from Phase 11; no value in rendering with mock data

---

## Phase 8: CLI Backend & Parser

The CLI frontend (Phases 2-4) renders React components with mock data. This phase builds the real backend: the `heyiam` command, Express server, session parser, analyzer, LOC computation, and publish API. Without this, the CLI cannot be installed or read real `~/.claude/projects/` sessions.

### Task 8.1 — CLI Scaffold & `heyiam` Command ✅
**Files:** `cli/package.json`, `cli/src/index.ts`, `cli/tsconfig.json`, `cli/src/server.ts`

Set up the CLI as an installable command:
- `package.json` with `"bin": { "heyiam": "./dist/index.js" }`, build script, TypeScript config
- `cli/src/index.ts` — entry point: parses CLI args (`heyiam open`, `heyiam login`, `heyiam publish`)
- `heyiam open` — builds React app, starts Express server, opens browser
- `heyiam login` — device auth flow (stub for now)
- `heyiam publish --token <token>` — publish from CLI (stub for now)
- `npm link` should make `heyiam` available globally

### Task 8.2 — Server & API Routes ✅
**Files:** `cli/src/server.ts`

Express server that serves the built React app and exposes API routes:
- `GET /api/projects` — list all projects from `~/.claude/projects/`
- `GET /api/projects/:project/sessions` — list sessions for a project
- `GET /api/projects/:project/sessions/:id` — load full session with parsed analysis
- `POST /api/publish` — publish session to heyi.am
- `GET /api/auth/status` — check auth state

### Task 8.3 — Parser Interface & Claude Code Parser ✅
**Files:** `cli/src/parsers/types.ts`, `cli/src/parsers/claude.ts`, `cli/src/parsers/claude.test.ts`, `cli/src/parsers/index.ts`

Define a tool-agnostic `SessionAnalysis` interface, then implement the Claude Code parser as the first concrete parser. Future parsers (Cursor, Codex, Gemini, Antigravity) slot in by implementing the same interface.

**`cli/src/parsers/types.ts`** — shared interface:
- `SessionAnalysis`: turns, tool_calls, files_touched, duration, loc_stats, raw_entries
- `SessionParser`: `{ detect(path): boolean, parse(path): SessionAnalysis }`
- `SessionSource`: `"claude" | "cursor" | "codex" | "gemini" | "antigravity"`

**`cli/src/parsers/claude.ts`** — Claude Code `.jsonl` parser:
- Read JSONL entries, filter by type (user/assistant/system)
- Extract turns (user↔assistant pairs), compute turn count
- Extract tool calls (name, input, result) from `tool_use` content blocks
- Compute duration from first/last timestamps
- Extract files touched from Write/Edit/Read tool calls
- `detect()`: checks for `~/.claude/projects/` path structure

**`cli/src/parsers/index.ts`** — registry:
- Auto-detect session source from path/format
- Route to correct parser
- Extensible: add new parsers by registering them

### Task 8.4 — LOC Computation ✅
**Files:** `cli/src/parsers/claude.ts` (extends Task 8.3)

Add `computeLocStats(entries)` function:
- Scan `tool_use` content blocks for `Write` and `Edit` tool names
- **Write**: count lines in `input.content`; track per-file to detect overwrites
- **Edit**: count lines in `input.new_string` (added) and `input.old_string` (removed)
- Return `{ loc_added, loc_removed, loc_changed, files_changed }`
- Deduplicate multiple writes to same file path (last write wins)

### Task 8.5 — Session Analyzer ✅
**Files:** `cli/src/analyzer.ts`, `cli/src/analyzer.test.ts`

Higher-level analysis that feeds the UI:
- Skills extraction (from tool names, file extensions, framework patterns)
- Execution path (ordered sequence of major actions)
- Tool breakdown (counts per tool type)
- Context detection (git branch, project type)

### Task 8.6 — AI Enhancement Integration ✅
**Files:** `cli/src/summarize.ts`, `cli/src/summarize.test.ts`

Connect to Anthropic API for session enhancement:
- Generate title, developer take, refined skills
- Anti-fluff question generation (3 targeted questions from session context)
- Streaming response support for progressive UI updates

### Task 8.7 — Auth & Publish Flow ✅
**Files:** `cli/src/auth.ts`, `cli/src/machine-key.ts`

- Machine key generation (Ed25519)
- Auth status check against heyi.am API
- Session signing and publish payload construction
- `heyiam login` device auth flow

### Task 8.8 — Subagent Data Model ✅
**Files:** `cli/app/src/types.ts`, `cli/src/parsers/types.ts`, `cli/src/analyzer.ts`
**Spec:** `docs/SUBAGENT_PRODUCT_SPEC.md`

Extend `Session` and parser types for parent→child hierarchy:
- `Session` gains: `childSessions?: Session[]`, `parentSessionId?: string`, `agentRole?: string`
- `SessionAnalysis` (parser output) gains: `agent_role?: string`, `parent_session_id?: string`
- `SessionMeta` gains: `parentSessionId?: string`, `agentRole?: string`
- Analyzer's `SessionAnalysis` input type gains: `childSessions`, `agentRole`

### Task 8.9 — Parser: Child Session Detection & Linking ✅
**Files:** `cli/src/parsers/claude.ts`, `cli/src/parsers/index.ts`, `cli/src/parsers/claude.test.ts`

Detect subagent sessions and link to parents:
- `listSessions()` links children to parents: child's path contains parent's session ID in directory structure (`{parentId}/subagents/{childId}.jsonl`)
- Extract `agentRole` from parent session's `Agent` tool call (`input.subagent_type` field) or from child's first entry (`agentId` field)
- `SessionMeta` carries `parentSessionId` so server can build hierarchy without re-parsing
- Only return **parent sessions** from `listSessions()` by default; children accessible via parent

### Task 8.10 — Server: Hierarchical Session API ✅
**Files:** `cli/src/server.ts`, `cli/src/bridge.ts`

Wire parent→child through the API:
- `GET /api/projects/:project/sessions` returns parent sessions only, each with `childCount` and `children` summary (role, title, LOC, duration — no full parse)
- `GET /api/projects/:project/sessions/:id` returns full session with `childSessions` populated (full parse of children)
- Bridge maps child parser output into child `Session` objects with `agentRole` and `parentSessionId`
- Aggregated stats on parent: total LOC/duration "across N agents"

### Task 8.11 — CLI: Session Browser with Agent Hierarchy ✅
**Files:** `cli/app/src/components/SessionList.tsx`, `cli/app/src/App.css`
**Design ref:** `docs/SUBAGENT_UX_SPEC.md` § Session Browser

- Parent rows show "N agents" badge after turn count in metadata
- Disclosure triangle (▸/▾) expands to show child rows
- Child rows: indented with role label (`FRONTEND-DEV`), lighter text, no status chip
- 5+ children: show first 5 + "... N more" expand link
- Preview panel: orchestration summary when parent selected

### Task 8.12 — Fork/Join Timeline Component ✅
**Files:** `cli/app/src/components/AgentTimeline.tsx`, `cli/app/src/App.css`
**Design ref:** `mockups/agent-timeline.html`

SVG-based fork/join timeline visualization:
- Single line for solo sessions (with activity ticks)
- Fork into parallel lanes when agents spawn, reconverge when they return
- Lane width = wall-clock duration, color = agent role
- Compact variant for case study cards (~400px wide)
- Full variant for transcript pages (with time labels, clickable lanes)
- Multi-wave support: fork → join → fork again
- Data input: `Session` with `childSessions` (start_time, end_time, agentRole per child)

---

## Phase 9: Session Templates

### Task 9.1 — Terminal Template
**Screen 28**
**Mockup image:** `mockups/new/templates/session_template_terminal_v2/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_terminal_v2/code.html`
**Files:** `phoenix/assets/css/app.css` (template overrides)

- Full dark bg, green monospace, terminal command execution path, file staging, status bento

### Task 9.2 — Minimal Template
**Screen 29**
**Mockup image:** `mockups/new/templates/session_template_minimal/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_minimal/code.html`

- White, max whitespace, large prose take, numbered path, terminal at bottom

### Task 9.3 — Brutalist Template
**Screen 30**
**Mockup image:** `mockups/new/templates/session_template_brutalist/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_brutalist/code.html`

- B&W only, thick borders, zero radius, ALL CAPS, photo grid placeholders

### Task 9.4 — Campfire Template
**Mockup image:** `mockups/new/templates/session_template_campfire/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_campfire/code.html`

- Warm solarized palette, 2-col with "The Spark" narrative, params table, image gallery

### Task 9.5 — Neon Night Template
**Mockup image:** `mockups/new/templates/session_template_neon_night/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_neon_night/code.html`

- Dark navy, cyan/magenta, gradient quotes, tool usage bars, card-grid execution path

---

## Phase 10: Interview / Challenge Flow

### Task 10.1 — Create a Challenge
**Screen 33**
**Mockup image:** `mockups/new/create_a_challenge/screen.png`
**Mockup HTML:** `mockups/new/create_a_challenge/code.html`
**Files:** `phoenix/lib/heyi_am_web/controllers/challenge_controller.ex`, new templates

- Form: title, problem statement, criteria, time limit, access code
- Live candidate preview panel
- "Generate Link" CTA

### Task 10.2 — Challenge Landing (Candidate)
**Screen 34**
**Files:** Challenge templates

- Company branding, problem statement, requirements grid
- Time limit, sealed notice, access code input
- "Begin Challenge" CTA

### Task 10.3 — Challenge In Progress
**Screen 35**

- Split: requirements left, live terminal right
- Timer, "heyiam publish --challenge"

### Task 10.4 — Challenge Submitted
**Screen 36**

- "Response Sealed & Submitted"
- Ed25519 hash, immutability notice

### Task 10.5 — Comparison View (Manager)
**Screen 37**
**Mockup image:** `mockups/new/interview_comparison_view/screen.png`
**Mockup HTML:** `mockups/new/interview_comparison_view/code.html`
**Files:** Challenge controller (new action)

- Unbiased view — no ranking
- Table: session detail, metrics, AI profile, trust hash
- Evidence disclaimer

### Task 10.6 — Candidate Deep Dive
**Screen 38**

- Full case study with challenge banner
- "← Prev | 2 of 4 | Next →" navigation

---

## Phase 11: Edge Cases & Mobile

### Task 11.1 — 404 Page
**Screen 31**
**Files:** `phoenix/lib/heyi_am_web/controllers/error_html.ex`

### Task 11.2 — Deleted/Expired Session
**Screen 32**

### Task 11.3 — Mobile: Session Case Study
**Screen 39** — Responsive CSS at 375px

### Task 11.4 — Mobile: Portfolio
**Screen 40** — Responsive at 375px

### Task 11.5 — Mobile: Session Browser
**Screen 41** — Project dropdown, sticky bottom CTA

### Task 11.6 — Mobile: Challenge Landing
**Screen 42** — Stacked requirements, full-width CTA

---

## Phase 12: Backend & Data Model

### Task 12.1 — Pin/Highlight Data Model
**Files:** Share schema + new migration

Add `pinned_turns` and `highlighted_steps` fields.

### Task 12.2 — Session Auto-Add to Portfolio
**Files:** `phoenix/lib/heyi_am/shares.ex`

Auto-create portfolio entry on publish (default ON).

### Task 12.3 — Project Growth Data
**Files:** `phoenix/lib/heyi_am/projects.ex`

Compute cumulative LOC, file heatmap, session overlap for project visualizations.

### Task 12.4 — AI Collaboration Profile
**Files:** `phoenix/lib/heyi_am/profiles.ex`

Compute per-developer metrics from aggregated session data.

---

## Execution Strategy

### Dependencies
- **Phase 1** (Foundation) → blocks everything
- **Phases 2-4** (CLI frontend) → can run in parallel with Phases 5-7 (Web)
- **Phase 8** (CLI backend) → blocks CLI from working with real data; depends on Phases 2-4 for the UI it serves. Tasks 8.8-8.10 (subagent data/parser/server) block 8.11-8.12 (subagent UI)
- **Phase 9** (Templates) → depends on Phase 7.1 (session page structure)
- **Phase 10** (Interview) → depends on Phases 7.1 + 12.1
- **Phase 11** (Mobile) → depends on Phases 7.1, 7.2
- **Phase 12** (Backend extras) → slot in as frontend phases need them

### Suggested Team Split
- **Dev A**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 8 (CLI end-to-end)
- **Dev B**: Phase 1 → Phase 5 → Phase 6 (Web auth + editor)
- **Dev C**: Phase 1 → Phase 7 → Phase 9 (Public pages + templates)
- **Phase 10-12**: Assign after core phases ship

### Per-Phase Requirements
1. **Tests first, tests always**: Every new function, endpoint, component, and behavior must have tests before the task is considered complete. Write tests as you build, not after. Unit tests for pure logic, integration tests for I/O boundaries. If you modify existing code, update or add tests to cover the changed behavior. No exceptions — untested code is unfinished code.
2. **Architecture doc**: Each phase must update `docs/ARCHITECTURE.md` with decisions made, data models, API contracts, and component relationships. This is a living doc — append as you go, don't wait until the end.
3. **Verification**:
   - `mix test` — all tests pass (run after every task)
   - `mix compile --force` — zero warnings
   - `npx tsc --noEmit` — TypeScript clean
   - `npm test` — CLI tests pass
   - Visual: each screen matches prototype at 1440px
   - Responsive: stacks at 375px
4. **Progress**: Update the Progress checklist at the top of this file after completing each task.
