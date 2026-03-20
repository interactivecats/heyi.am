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
- [ ] **Phase 7** — Web: Public Pages (0/5)
- [ ] **Phase 8** — Backend & Data Model (0/6)
- [ ] **Phase 9** — CLI ↔ Web Integration (0/6)
- [ ] **Phase 10** — Session Templates (0/5)
- [ ] **Phase 11** — Interview / Challenge Flow (0/6)
- [ ] **Phase 12** — Edge Cases & Mobile (0/6)

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
- Cumulative growth chart (SVG: LOC across sessions)
- Directory heatmap (grid: dirs × sessions)
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

### Task 7.5 — Sealed Verification (Interview Only)
**Screen 27**
**Files:** `phoenix/lib/heyi_am_web/controllers/share_controller.ex`

- Ed25519 signature + hash verification
- Only for interview challenge responses

---

## Phase 8: Backend & Data Model

### Task 8.1 — LOC Computation
**Files:** `cli/src/parser.ts`

Extract LOC from Write/Edit tool calls. Compute lines added/removed per file.

### Task 8.2 — Pluggable Parser Architecture
**Files:** `cli/src/parsers/claude-parser.ts`, `cli/src/parsers/types.ts`

Create `SessionAnalysis` interface. Extract Claude Code parser. Prepare for cursor + codex parsers.

### Task 8.3 — Pin/Highlight Data Model
**Files:** Share schema + new migration

Add `pinned_turns` and `highlighted_steps` fields.

### Task 8.4 — Session Auto-Add to Portfolio
**Files:** `phoenix/lib/heyi_am/shares.ex`

Auto-create portfolio entry on publish (default ON).

### Task 8.5 — Project Growth Data
**Files:** `phoenix/lib/heyi_am/projects.ex`

Compute cumulative LOC, file heatmap, session overlap for project visualizations.

### Task 8.6 — AI Collaboration Profile
**Files:** `phoenix/lib/heyi_am/profiles.ex`

Compute per-developer metrics from aggregated session data.

---

## Phase 9: CLI ↔ Web Integration

### Task 9.1 — Share API: Create & Read
**Files:** `phoenix/lib/heyi_am_web/controllers/share_api_controller.ex`, `phoenix/lib/heyi_am_web/router.ex`

JSON API endpoints for the CLI to publish sessions:
- `POST /api/shares` — create a share (accepts session JSON payload, Ed25519 signature)
- `GET /api/shares/:id` — retrieve a share by ID
- Authentication via bearer token (user session token or machine token)
- Validates payload structure, stores raw session data + enhanced fields
- Returns share URL on success

### Task 9.2 — Device Auth Flow (RFC 8628)
**Files:** `phoenix/lib/heyi_am/device_auth.ex`, `phoenix/lib/heyi_am_web/controllers/device_auth_controller.ex`, new migration

Device authorization for CLI login (`heyiam login`):
- `POST /api/device/code` — generate device code + user code
- `GET /device` — web page where user enters the code
- `POST /api/device/token` — CLI polls until user approves
- Device codes expire after 15 minutes
- On approval, return a long-lived machine token for the CLI

### Task 9.3 — CLI Publish: Real API Integration
**Files:** `cli/src/api.ts`, `cli/src/server.ts`, `cli/app/src/components/SessionEditorPage.tsx`

Replace mock publish animation with real API calls:
- Read machine token from `~/.config/heyiam/auth.json`
- POST session payload to `/api/shares` with auth header
- Sign payload with Ed25519 keypair (generate on first publish, store locally)
- Stream terminal animation while request is in-flight
- Handle errors: auth expired, network failure, validation errors
- On success: display real share URL

### Task 9.4 — CLI Session Ingestion: Real Parser
**Files:** `cli/src/parsers/claude-parser.ts`, `cli/src/parsers/types.ts`, `cli/src/server.ts`

Replace `MOCK_SESSIONS` with real session file reading:
- Scan `~/.claude/projects/` for JSONL session files
- Parse Claude Code session format → `Session` structs
- Extract: turns, tool calls, files changed, duration, LOC (from Write/Edit calls)
- Group sessions by project directory
- Watch for new sessions and update the browser via SSE/WebSocket

### Task 9.5 — CLI Enhance: Real AI Enhancement
**Files:** `cli/app/src/components/EnhanceFlow.tsx`, `cli/src/enhance.ts`

Replace mock enhancement with real Anthropic API calls:
- Read API key from local settings
- Send session context to Claude API with structured prompt
- Stream responses: title, skills, execution path, developer questions
- Parse structured output into `Session` fields
- Anti-fluff questions generated from actual session content
- Save enhanced data locally before publish

### Task 9.6 — Portfolio Sync: Sessions → Web
**Files:** `phoenix/lib/heyi_am/shares.ex`, `phoenix/lib/heyi_am/projects.ex`

Wire published shares into portfolio:
- On share creation, auto-create portfolio entry (linked to user)
- Auto-assign to project based on project directory or user selection
- Portfolio editor reads real shares/projects from database
- Public portfolio page queries real data instead of mock assigns
- Project page computes real growth charts from session LOC data

---

## Phase 10: Session Templates

### Task 10.1 — Terminal Template
**Screen 28**
**Mockup image:** `mockups/new/templates/session_template_terminal_v2/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_terminal_v2/code.html`
**Files:** `phoenix/assets/css/app.css` (template overrides)

- Full dark bg, green monospace, terminal command execution path, file staging, status bento

### Task 10.2 — Minimal Template
**Screen 29**
**Mockup image:** `mockups/new/templates/session_template_minimal/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_minimal/code.html`

- White, max whitespace, large prose take, numbered path, terminal at bottom

### Task 10.3 — Brutalist Template
**Screen 30**
**Mockup image:** `mockups/new/templates/session_template_brutalist/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_brutalist/code.html`

- B&W only, thick borders, zero radius, ALL CAPS, photo grid placeholders

### Task 10.4 — Campfire Template
**Mockup image:** `mockups/new/templates/session_template_campfire/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_campfire/code.html`

- Warm solarized palette, 2-col with "The Spark" narrative, params table, image gallery

### Task 10.5 — Neon Night Template
**Mockup image:** `mockups/new/templates/session_template_neon_night/screen.png`
**Mockup HTML:** `mockups/new/templates/session_template_neon_night/code.html`

- Dark navy, cyan/magenta, gradient quotes, tool usage bars, card-grid execution path

---

## Phase 11: Interview / Challenge Flow

### Task 11.1 — Create a Challenge
**Screen 33**
**Mockup image:** `mockups/new/create_a_challenge/screen.png`
**Mockup HTML:** `mockups/new/create_a_challenge/code.html`
**Files:** `phoenix/lib/heyi_am_web/controllers/challenge_controller.ex`, new templates

- Form: title, problem statement, criteria, time limit, access code
- Live candidate preview panel
- "Generate Link" CTA

### Task 11.2 — Challenge Landing (Candidate)
**Screen 34**
**Files:** Challenge templates

- Company branding, problem statement, requirements grid
- Time limit, sealed notice, access code input
- "Begin Challenge" CTA

### Task 11.3 — Challenge In Progress
**Screen 35**

- Split: requirements left, live terminal right
- Timer, "heyiam publish --challenge"

### Task 11.4 — Challenge Submitted
**Screen 36**

- "Response Sealed & Submitted"
- Ed25519 hash, immutability notice

### Task 11.5 — Comparison View (Manager)
**Screen 37**
**Mockup image:** `mockups/new/interview_comparison_view/screen.png`
**Mockup HTML:** `mockups/new/interview_comparison_view/code.html`
**Files:** Challenge controller (new action)

- Unbiased view — no ranking
- Table: session detail, metrics, AI profile, trust hash
- Evidence disclaimer

### Task 11.6 — Candidate Deep Dive
**Screen 38**

- Full case study with challenge banner
- "← Prev | 2 of 4 | Next →" navigation

---

## Phase 12: Edge Cases & Mobile

### Task 12.1 — 404 Page
**Screen 31**
**Files:** `phoenix/lib/heyi_am_web/controllers/error_html.ex`

### Task 12.2 — Deleted/Expired Session
**Screen 32**

### Task 12.3 — Mobile: Session Case Study
**Screen 39** — Responsive CSS at 375px

### Task 12.4 — Mobile: Portfolio
**Screen 40** — Responsive at 375px

### Task 12.5 — Mobile: Session Browser
**Screen 41** — Project dropdown, sticky bottom CTA

### Task 12.6 — Mobile: Challenge Landing
**Screen 42** — Stacked requirements, full-width CTA

---

## Execution Strategy

### Dependencies
- **Phase 1** (Foundation) → blocks everything
- **Phases 2-4** (CLI) → can run in parallel with Phases 5-7 (Web)
- **Phase 8** (Backend) → do after Phase 7, provides real schemas
- **Phase 9** (Integration) → depends on Phases 4, 5, 8; connects CLI to real API and replaces all mock data
- **Phase 10** (Templates) → depends on Phase 7.1 (session page)
- **Phase 11** (Interview) → depends on Phases 7.1 + 8.3
- **Phase 12** (Mobile) → depends on Phases 7.1, 7.2

### Suggested Team Split
- **Dev A**: Phase 1 → Phase 2 → Phase 3 → Phase 4 (CLI end-to-end)
- **Dev B**: Phase 1 → Phase 5 → Phase 6 (Web auth + editor)
- **Dev C**: Phase 1 → Phase 7 → Phase 8 (Public pages + templates)
- **Phase 9-11**: Assign after core phases ship

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
