# Team Knowledge

## AI Enhancement Integration (Task 8.6) — 2026-03-20

`cli/src/summarize.ts` connects to Anthropic API for session enhancement. Exports `summarizeSession()` (non-streaming) and `summarizeSessionStream()` (async generator of typed `StreamEvent`s). `createSSEHandler()` wraps the stream for Express SSE endpoints. Anti-fluff enforcement at two layers: system prompt bans 6 words + `stripBannedWords()` post-processes all output fields. `parseEnhancementResult()` extracts JSON from potential markdown fences and enforces max constraints (80 char title, 200 char context, 300 char dev take, 20-word step titles, 40-word step bodies, max 7 steps, max 3 questions). Default model is `claude-sonnet-4-6`. 22 tests with mocked Anthropic client.

## Session Analyzer (Task 8.5) — 2026-03-20

`cli/src/analyzer.ts` exports `analyzeSession(analysis: SessionAnalysis): Session` which transforms raw parser output into the frontend `Session` type. Defines `ParsedTurn`, `ParsedFileChange`, and `SessionAnalysis` as the parser contract. Skill detection uses three signals: file extensions (`.tsx`→React), config filenames (`Dockerfile`→Docker), and import patterns in tool output. Execution path groups turns by prompt boundaries and classifies steps as analysis/implementation/testing/deployment. 35 tests in `analyzer.test.ts`.

## CLI Backend Setup (Task 8.1 & 8.2) — 2026-03-20

Backend TypeScript lives in `cli/src/` with its own `cli/tsconfig.json` (ESNext/NodeNext). Entry point `src/index.ts` uses commander with `open`, `login`, `publish` commands. Express server in `src/server.ts` exports `createApp()` (for testing) and `startServer(port)`. Express 5 requires `/{*splat}` syntax for wildcard routes (not `*`). Backend tests use vitest + supertest and run via `npm run test:backend` from `cli/`. All 14 backend tests pass.

## Auth & Publish Flow (Task 8.7) — 2026-03-20

Ed25519 keypair management in `cli/src/machine-key.ts` — keys stored as SPKI/PKCS8 DER base64 in `~/.local/share/heyiam/machine-key.json` with mode 0o600. Auth in `cli/src/auth.ts` implements RFC 8628 device auth flow (code request → browser open → poll for token). All functions accept optional `configDir` param for test isolation using tmp dirs. Both `login` and `publish` commands accept `--api-url` flag and respect `HEYIAM_API_URL` env var. 28 tests cover crypto round-trips, filesystem persistence, and mocked device auth flow.

## Minimal Template CSS (Phase 9) — 2026-03-21

`.tpl-minimal` overrides appended to `phoenix/assets/css/app.css` after the terminal template block (~line 3422). Single-column layout at 42rem max-width. Sidebar is NOT hidden with `display:none` — instead grid collapses to `1fr` so sidebar content flows below main with 5rem spacing. Stats rendered inline as mono text with middot separators (labels hidden). Dev take stripped to transparent bg with 1.5rem/300-weight prose. Exec path uses 3rem step gaps with timeline spine hidden. All scoped under `.tpl-minimal`.

## Parser Interface & Claude Code Parser (Task 8.3 & 8.4) — 2026-03-20

`cli/src/parsers/` implements the pluggable parser system. `types.ts` defines `SessionParser` interface (name, detect, parse), `SessionAnalysis`, `ToolCall`, `LocStats`, `RawEntry`, and content block types. `claude.ts` parses real Claude Code JSONL sessions — entry types: user, assistant, system, progress, file-history-snapshot, agent-name, custom-title, last-prompt, queue-operation. Tool calls are `tool_use` content blocks in assistant entries; results are `tool_result` blocks in user entries. `computeLocStats()` counts Write lines (deduped per file, last write wins) and Edit old/new string diffs. `index.ts` provides `parseSession()` (auto-detect + route) and `listSessions()` (recursive dir scan). 23 tests in `claude.test.ts`.

## Subagent Data Model & Parser Linking (Tasks 8.8 & 8.9) — 2026-03-20

Subagent hierarchy lives across 4 layers: frontend types (`cli/app/src/types.ts`), parser types (`cli/src/parsers/types.ts`), session scanner (`cli/src/parsers/index.ts`), and analyzer (`cli/src/analyzer.ts`). All gain `childSessions`, `parentSessionId`, `agentRole`, `isOrchestrated` fields. `listSessions()` links children to parents by matching `{uuid}/subagents/*.jsonl` directory to `{uuid}.jsonl` parent file — children nested in parent's `children` array, filtered from top-level results. `mapAgentRole()` strips `trc-` prefix from teamrc names and lowercases built-in types (Explore→explore). `RawEntry` now includes `agentId` field for child session identification. 12 new tests cover linking, orphans, empty dirs, and role extraction.

## Hierarchical Session API & Browser (Tasks 8.10-8.11) — 2026-03-20

Server: `GET /api/projects/:project/sessions` returns parent sessions only with `childCount` and lightweight `children` summary (sessionId + role, no full parse). `GET /api/projects/:project/sessions/:id` fully parses children via `bridgeChildSessions()` and attaches `childSessions`, `isOrchestrated`, and `aggregatedStats` (totalLoc, totalDurationMinutes, agentCount). Frontend: `SessionList.tsx` renders parent rows with disclosure triangle (collapsed by default), agent count badge in mono, and indented child rows with role labels. 5+ children truncated with expand-more link. Preview panel switches between orchestration summary (parent selected) and raw log (solo/child). CSS classes in `App.css`: `session-browser__row--parent/--child`, `__connector` (1px vertical line at 30% opacity), `__agent-count`, `__child-role` (uppercase mono primary), `__expand-more`, `__disclosure`. Frontend `types.ts` adds `ChildSessionSummary` interface and `childCount`/`children` fields to Session.

## CLI Codebase Review (Phases 1-4) — 2026-03-20

All 8 test files exist with 111 passing tests (vitest run confirms green). The vitest script is invoked as `npx vitest run` from `cli/app/` — there is no `npm test` script alias in `package.json`. Design tokens match Phoenix exactly: Seal Blue `#084471`, Space Grotesk/Inter/IBM Plex Mono all declared in `index.css`. `EnhanceFlow.tsx` implements the 4-phase state machine (analyzing → questions → streaming → done) with timer-driven transitions tested with `vi.useFakeTimers()`. `SessionEditorPage.tsx` handles all 5 publish phases including the `auth-prompt` modal and terminal animation. Two issues noted: `handleAddSkill` in `SessionEditor.tsx:249` uses `window.prompt()` which is untestable and blocks the browser; the `SuccessLinked` and `SuccessAnonymous` success screen "View on Portfolio" / "View Case Study" links both route to `/` (placeholder), not to the actual session or portfolio URLs.

## Terminal Template CSS (Phase 9) — 2026-03-21

`.tpl-terminal` overrides appended to `phoenix/assets/css/app.css` (line ~3141). Scoped under `.tpl-terminal` class on the `.case-study-layout` root div. Dark bg `#0c0f10`, terminal green `#7ee787`, all text forced to `var(--font-mono)`. Dev take restyled as block comment (`/* ... */`). Exec path spine/line hidden; numbers become timestamp-style brackets. Stats, sidebar cards, highlights, collapsibles all get dark `rgba(255,255,255,0.03)` backgrounds with green accents. Links use `#60a5fa` for contrast. `.chip--inverted` added as a global variant (line ~3135).

## Neon Night Template CSS (Phase 9) — 2026-03-21

`.tpl-neon-night` overrides appended to `phoenix/assets/css/app.css` (line ~3700). Pure black bg `#000000`, cyan accent `#00E5FF`, magenta accent `#FF2D7B`, muted text `#737c7f`. Surface cards use `rgba(255,255,255,0.03)` bg with `rgba(255,255,255,0.05)` borders. Dev take gets magenta border/bg tint with magenta heading and italic white body. Exec path steps are individual dark cards with cyan hover border. Skill chips and links use cyan. No text-shadow glow, no backdrop-filter, no gradients (except subtle dev-take rgba). Follows same scoping pattern as tpl-terminal.

## Campfire Template CSS (Phase 9) — 2026-03-21

`.tpl-campfire` overrides appended to `phoenix/assets/css/app.css` (line ~3963). Warm cream bg `#fdf6e3` (solarized light), amber accent `#b58900`, dark text `#2b3437`, variant text `#586e75`. Surface containers use warm tints: `#f5f0e1` (low), `#ece7d8` (medium), `#e3dece` (high). Dev take styled as warm sidebar panel with `rgba(88,110,117,0.08)` bg and 3px `#586e75` left border, italic body. Exec path uses amber numbers/lines with alternating warm bg on even steps. Terminal kept dark but warm-tinted `#1e1c18` with amber prompts. Border radius bumped to `0.375rem`. All borders use `rgba(181,137,0,0.12-0.25)`. No glassmorphism, no gradients. Q&A answers are italic.

## Phase 9 Template System Architecture — 2026-03-21

Templates are per-session (not per-user). Mock session `template` field (string, default "editorial") drives rendering. ShareController `resolve_template/1` validates against `@valid_templates` MapSet and falls back to "editorial". Query param `?template=terminal` overrides for visual testing. The `tpl-{name}` class sits on the `.case-study-layout` root div. All 5 templates are CSS-only overrides scoped under their `.tpl-*` selector, with 2-3 small `<%= if %>` conditionals in `show.html.heex` for chip label text and heading variants. `.chip--inverted` is a global class at line 3135. CSS file grew from 3131 to 4484 lines. 220 tests all passing.

## SessionDetailOverlay Component — 2026-03-22

`SessionDetailOverlay` lives at `cli/app/src/components/SessionDetailOverlay.tsx`. It is a fullscreen overlay (z-index 110, above ProjectPreview's 100) with two-column layout: left column has breadcrumb, title, stats grid, developer take, skills, Q&A, and highlights; right column has execution path timeline, raw log preview, and source info. Full-width collapsible sections below for tool breakdown and files changed. Opened from `ProjectPreview` via `detailSession` state — both session cards and timeline featured cards open it. Escape key is scoped: detail overlay handles its own Escape, ProjectPreview skips Escape when detail is open. CSS appended to end of `cli/app/src/App.css` using `.session-detail-*` class names. 17 dedicated tests in `SessionDetailOverlay.test.tsx`.

## Lazy-loading orchestrated session data for AgentTimeline — 2026-03-22

Session list endpoint returns lightweight `children` summaries (sessionId + role) but not full `childSessions` with duration/LOC. `AgentActivitySection` and `SessionDetailOverlay` now lazy-load full session detail via `fetchSession(projectDirName, sessionId)` when `childCount > 0` but `childSessions` is absent. Uses `useRef` for an `attemptedRef` set to prevent infinite re-fetch loops on error. `AgentActivitySection` accepts optional `projectDirName` prop (passed from `ProjectPreview` as `project.dirName`). Both components show "Loading agent activity..." during fetch and gracefully degrade to fallback rendering on fetch failure. 8 new tests cover lazy-loading, error handling, and skip-when-unnecessary scenarios.

## Security Review — 2026-03-26

Full security audit found 8 vulnerabilities (0 critical, 4 medium, 4 low), 10 hardening items. Top issues: Express binds 0.0.0.0 (should be 127.0.0.1), SSRF in screenshot capture (no URL validation), `style` attribute allowed in HTML sanitizer (CSS exfiltration), FTS5 query injection, and osascript command injection in daemon. Redaction coverage gaps: missing patterns for Datadog, DigitalOcean, Vercel, Hugging Face tokens. Secretlint failure is silent (H10). Good: domain split architecture, parameterized SQL throughout, HTML sanitizer with separate rendered_html changeset, rate limiting on Phoenix API, proper CSP on public web.

## Template Responsive CSS Audit — 2026-04-01

27 templates at `docs/mockups/{name}/project.html`. Most already had 768px breakpoints; daylight and zen use mobile-first (min-width). 8 templates were missing a 480px breakpoint to collapse stats grids from 3-col to 2-col: carbon, ember, noir, signal, obsidian, blueprint, bauhaus, parchment. All skill chip containers already use `flex-wrap: wrap`. SVG charts are either contained with `width:100%; height:auto` or wrapped in `overflow-x:auto` containers. Screenshots use fixed height with no width constraints so they naturally fill their parent. No horizontal scroll issues found on any main content containers.

## Portfolio workspace UX fixes — 2026-04-15

Dropped the duplicate "View live" primary action from `StatusBar` — once
published, it now always shows "Re-publish" and leaves viewing the live site
to `PreviewPane`'s `Open in browser ↗`. Added `publicBaseUrl` to
`/api/auth/status` (emitted from `PUBLIC_URL`) and propagated through the
`AuthStatus` type; PreviewPane now rebuilds Open-in-browser URLs as
`${publicBaseUrl}/${username}[/${slug}]` and deliberately ignores stale
`target.url` values from old publish responses. Preview target tabs were
relabeled "Home / Project page / Case study" with a "PREVIEW" prefix so they
can't be mistaken for top-level nav. Added a ResizeObserver shim in both
`PortfolioWorkspace.test.tsx` and `PreviewPane.test.tsx` — jsdom was
crashing ScaledIframe at mount, masking 31 pre-existing failures.

## CLI Delete + Transcript Toggle — 2026-04-13

New `cli/src/routes/delete.ts` exposes `DELETE /api/projects/:project/remote` and `DELETE /api/projects/:project/sessions/:sessionId/remote`. Both proxy to Phoenix with bearer auth, preserve local archived data, clear local uploaded-state on 204, and map 404/401/5xx to structured errors. UI: shared `ConfirmModal` component, trash-icon delete per uploaded session row in `SessionManageModal`, and "Remove from heyi.am" action in `ProjectDetail` sidebar. Transcript toggle is **CLI-only** — `settings.ts::isTranscriptIncluded/setTranscriptIncluded` plus `PUT /api/sessions/:sessionId/transcript-setting`. When off, `publish.ts` skips all three transcript S3 uploads (raw/log/session JSON) and drops `transcript_excerpt` + `turn_timeline` from the S3 session-data payload. Checkbox renders inline on every row in `SessionManageModal`. Adds 30+ tests across `delete.test.ts`, `publish-transcript.test.ts`, `settings.test.ts` (CLI), and `SessionManageModal.test.tsx`, `ProjectDetail.test.tsx` (frontend). All backend tests green (1760); frontend baseline unchanged (31 pre-existing PortfolioWorkspace failures, now 131 passing).

## Template Type Scale Tokens — 2026-04-16

/normalize step in template-readability-a11y pass. Added `--font-size-xs..3xl` (12/14/16/18/20/24/32px) to shared `cli/src/render/templates/styles.css :root`. Replaced 6 still-9px labels (.section-header__meta, .stat-card__label, .source-table__th, .sidebar-section__heading, .stat__label) plus 10px export-footer and 0.6875rem phase-timeline label with `var(--font-size-xs)` — these were the floor-violations /typeset swept in per-template files but missed in shared. Also tokenized common literals in the global section (1rem→base, 1.25rem→xl, 1.5rem→2xl, 0.875rem→sm, 0.75rem→xs) so future typography passes touch tokens instead of literals. Showcase-scoped section and per-template files left untouched — those keep identity-bearing literals like 1.0625rem narrative and 2.25rem hero. 0.8125rem (13px) intentionally not added to scale; templates can keep using the literal for dense meta text. All 1957 tests green (1793 CLI + 164 app).

## Template Typography Pass — 2026-04-16

Two-pass fix for "text too small / spacing cramped" feedback. /harden first raised muted-text contrast in neon (--neon-text-tertiary #6b5280 → #a894c0) and noir (--noir-text-muted #737373 → #9a9a9a) to pass WCAG AA, replaced three -webkit-text-fill-color gradient headings in neon with solid color (also fixes Windows High Contrast + forced-colors), and doubled .heyiam-project .chip vertical padding. /typeset then swept 25+ template CSS files: mono/signal base 14px → 16px, eight templates' narrative prose 0.9375rem → 1rem, showcase six 9px labels → 12px, kinetic four 0.5rem (8px!) legend labels → 0.75rem, universal stat-label floor raised to 12px (36+ rules), nav links 12–13px → 14px in paper/signal/grid, strata body line-height 1.5 → 1.6. Source of truth is cli/src/render/templates/{name}/styles.css — pre-commit hook auto-syncs to heyi_am_umbrella/apps/heyi_am_public_web/priv/static/css/templates/. docs/mockups/ is design reference, not rendered at runtime. All 846 render tests still green.

## Template Readability Pass Complete — 2026-04-16

PR #1 (https://github.com/interactivecats/heyi.am/pull/1) merges the full 6-step pass. /adapt added `@media (max-width: 480px)` to mono/paper/chalk/verdant (other templates already covered — glacier uses clamp(), aurora had comprehensive 480 rules). /animate audited all 30 templates and found one RM-block gap: editorial's 0.6s `.ed-agent-bar-fill` width transition; added minimal colocated reduced-motion guard. /polish caught a regression — `.radar .chip` override (specificity 0,2,0) silently out-specificity'd the /harden base bump (0,1,0); re-aligned to 0.25rem. Three /polish items deferred on purpose: `exec-path-*` CSS has zero callers (dead, flagged for sweep), 0.8125rem literal kept between xs and sm tokens, `!important` in template CSS all legitimate (RM-block overrides). Key lesson: token-level base-value changes need a grep for per-component `.template .chip` overrides — specificity silently swallows intended bumps. Two follow-ups noted in PR: dead `exec-path-*` CSS in app.css, and `team-knowledge.md` tracked-despite-gitignored ambiguity. All 1957 tests green across the full pass.

## Hide Session Dates Toggle — 2026-05-07

Per-project flag `hideSessionDates` on `ProjectEnhanceCache` (`cli/src/settings.ts`). When on, the work-timeline replaces dates with ordinal labels ("Session 1, 2, 3…") AND strips `date`/`endTime` from the embedded `data-sessions` JSON so timestamps don't leak via View Source. Three layers honor the flag: (1) Liquid templates (paper/bauhaus/glacier) hide the Date column via `{% unless hideSessionDates %}`; glacier chart axis swaps to `#N`. (2) `mount.tsx` reads `data-hide-dates="1"` from each `[data-work-timeline]` div and threads `hideDates` to both `WorkTimeline` and `SessionOverlay`. (3) `WorkTimeline.tsx` injects synthetic monotonic dates internally when `hideDates` is on so the existing layout/sort/lane math runs unchanged — only display is suppressed (`buildLegendEntries`/`layoutSegments` emit `Session N` instead of `formatTimestamp`); gap segments are filtered out. UI: checkbox in `ProjectDetail.tsx` sidebar; the existing debounced `saveProjectEnhanceLocally` flow + `invalidateProjectPreviewCache` already plumb the change to live preview. Standalone `session.liquid` page headers were intentionally left alone — toggle scope is the timeline only. Mono portfolio aggregation also skipped (per-project flag doesn't apply at portfolio level). 1821 CLI + 167 app + 28 UI tests green.

## DELETE /api/sessions/:id contract repair — 2026-05-12

Phoenix DELETE `/api/sessions/:id` originally required an **integer** share ID (`Integer.parse` at `share_api_controller.ex:135`), but the CLI never has one — `POST /api/sessions` returns a `token` (random string), not the DB row `id`. So every CLI-initiated DELETE was 404'ing silently, which surfaced both as "trash button claims session isn't there" and as the root cause of "Manage Sessions checkbox doesn't actually remove sessions from heyi.am on re-publish." Fix layers: (1) Phoenix DELETE now accepts a non-integer `:id` plus `?project_id=X&slug=Y` query params and resolves via `Shares.get_share_by_project_slug/2`, gated by `Projects.get_user_project/2` for BOLA protection. (2) CLI `delete.ts` and the new `demoteRemovedSessions` helper in `project-session-upload.ts` send `(project_id, slug)` as query params, deriving slug from `loadEnhancedData(sessionId)?.title` via `toSlug(_, 80)` (same recipe as upload). (3) Both single-project and portfolio publish flows in `publish.ts` call `demoteRemovedSessions` before `uploadSelectedSessions` so deselections from Manage Sessions actually leave heyi.am. Slug-staleness edge case: if title was edited after the last upload, the derived slug won't match server-side and the DELETE 404s; helper treats 404 as success (idempotent intent) but the local-still-on-server reality stays broken until re-publish or manual cleanup. Tests: `share_api_controller_test.exs` (Elixir, 4 new), `delete.test.ts` (1 new + 1 updated), `project-session-upload.test.ts` (new file, 5 tests). 218 CLI route tests + 19 Phoenix controller tests green. Bumped CLI to 0.3.10; requires heyi.am deploy. **Known follow-up**: `POST /api/sessions` should return the integer `id` alongside `token`, and the CLI should store it — would let us use the cleaner DELETE-by-id contract everywhere.

## Known Broken: GET /api/sessions/:id returns 500 in test fixture — 2026-05-12

`server.test.ts` line 935 `describe('GET /api/sessions/:id')` → `it('returns session by ID after indexing')` is failing on HEAD (independently of the 2026-05-12 archive fallback / slug resolver work). The route resolves the row correctly but `ctx.loadSession` 500s inside the test harness — likely a fixture path issue where the seeded `abc-123.jsonl` isn't being found via the route context's `loadSession`, or one of the merge steps in `mergeEnhancedData` blows up on missing data. The companion `it('resolves a title-derived slug with .html suffix to the canonical session')` test added in the slug-resolver work shares the same 500, so when the underlying issue is fixed both pass together. Suspect either (a) the `createApp(tmpDir)` path threading not reaching `findReadableSessionPath` correctly, or (b) something in the bridgeToAnalyzer call given the test's minimal RawEntry fixture. Reproduce: `cd cli && npx vitest run src/server.test.ts -t "returns session by ID"`. Pre-existing — surfaced when adding slug-resolution tests in the same describe block.

## Self-Healing Archive Fallback for Purged Sessions — 2026-05-12

`loadSession` (`cli/src/routes/context.ts`) used to pass `meta.path` straight to `parseSession`, so when Claude Code's 30-day cleanup deleted a `.jsonl` the DB had already indexed, every enhance/preview/upload flow ENOENT'd — even though `archiveSessionFiles` had already hard-linked the file into `~/.local/share/heyiam/sessions/{projectDir}/`. Fix layers a new `findReadableSessionPath()` (`cli/src/archive.ts`) that returns the original path if it exists, else `resolveArchivePath()` (also newly exported), else null. `loadSession` calls it on every read and, when the original is gone, runs `updateSessionPath()` (`cli/src/db.ts`) to rewrite `sessions.file_path` to the archive copy — so the next read is fast-path. Discovery scans both live and archive (`listClaudeSessions`), so this only matters for sessions indexed *before* their source-tool deletion. Design principle: archive is heyi.am-owned storage and the canonical source; live tool dirs are discovery hints only. Tests in `archive.test.ts`. Bumped CLI to 0.3.9.
