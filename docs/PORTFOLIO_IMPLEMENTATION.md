# Portfolio Workspace Implementation Plan

**Branch:** `feature/portfolio-workspace-ux`
**Design source:** `docs/PORTFOLIO_UX.md` (supersedes `docs/PORTFOLIO_PREVIEW_PRD.md`)
**Mockups:** `docs/mockups/portfolio-ux.html` (9 frames)

---

## 1. Executive Summary

The portfolio has been treated as a side effect of the project upload flow — something that materialized on `heyi.am/:username` whenever a user published enough projects and filled out their bio in Settings. That framing produced the UX the founder called terrible: a debug tunnel linked from the Projects page (`Projects.tsx` "My Portfolio" link to `/preview/portfolio` in a new tab), a profile editor buried in `Settings.tsx` with no visual feedback, and a publish flow in `cli/src/routes/publish.ts` that never uploaded the portfolio landing page HTML to `rendered_portfolio_html` until late in the project upload wizard.

This plan rebuilds the portfolio as the primary artifact of the CLI. Three things change at a structural level. First, the renderer gains a portfolio-site mode: instead of fragments for Phoenix to wrap, it can produce a complete static site directory — `index.html`, `projects/gpx-cli/index.html`, `projects/gpx-cli/sessions/debugging-the-parser.html` — with the same visual output as the hosted version. This makes "Export to folder" a real first-class target. Second, the Portfolio workspace becomes a first-class sidebar destination, replacing the scattered surfaces that currently handle portfolio work. Third, the publish flow becomes multi-target: the same artifact goes to Export to folder, heyi.am hosted, or GitHub Pages.

The sequence is chosen by dependency. Phases 1 and 2 are infrastructure with no user-visible surface. Phase 3 is the first thing users see. Phases 4 and 5 add targets. Phase 6 is polish. Each phase leaves the codebase in a working state.

What this plan deliberately defers: per-project template overrides, multi-portfolio support, the Project workspace redesign, the Enhance/Triage/Questions wizard, and any recruiter or analytics features. These are listed in Section 7 with one-line justifications.

---

## 2. The Five Layers of Work

**L1: Renderer becomes portfolio-site aware.** Currently `cli/src/render/liquid.ts` produces HTML fragments with no `<html>` wrapper. `cli/src/export.ts` wraps single-project fragments via `buildStandalonePage` — but there is no portfolio-level equivalent that renders a complete site (landing page + all projects + sessions). This layer adds `generatePortfolioSite()` and `generatePortfolioHtmlFragment()` to `export.ts`. Nothing depends on this layer before it starts; everything else depends on it after.

**L2: Portfolio publish API contract.** The `rendered_portfolio_html` column on `users` exists and `rendered_html_changeset` is wired. But there is no `POST /api/portfolio/publish` endpoint in `heyi_am_app_web`, and the CLI has no `publishPortfolio()` function. This layer adds both, plus per-target publish state storage in `settings.json`. It depends on L1 (needs a portfolio fragment to upload) and gates L3 (the workspace needs a real publish action).

**L3: Portfolio workspace UI.** New `/portfolio` route. New `PortfolioWorkspace.tsx` with status bar, live preview iframe, and edit rail. The edit rail absorbs the profile editor from `Settings.tsx`. Publish button calls L2's API. This is the first user-visible layer. It depends on L1 (real preview data) and L2 (real publish action). L4 and L5 add targets to the workspace shell established here.

**L4: Multi-target publish flow.** Target picker sheet, inline target config, static export wired to L1, GitHub Pages OAuth + push + polling. This layer adds surfaces to the L3 workspace shell without restructuring it. Export to folder and GitHub Pages are separated into Phase 4 and Phase 5 to keep each phase shippable.

**L5: Polish and reach.** Template browser refactored to dual-mode (modal from workspace + standalone route). Template pill in preview pane header. "Open in browser" button. Settings cleanup. Onboarding nudge at end of FirstRun flow.

---

## 3. Phased Build Sequence

### Phase 1 — Portfolio site renderer

**Goal:** `generatePortfolioSite(opts)` exists in `cli/src/export.ts` and produces a correct static site directory. Engineer can verify by calling it directly in a test.

**Files to create / modify:**

- `cli/src/export.ts` — add `generatePortfolioSite(profile, listedProjects, outputDir, opts)`. This renders `index.html` using `renderPortfolioHtml`, then iterates listed projects and writes `projects/{slug}/index.html` and `projects/{slug}/sessions/{session-slug}.html`, reusing the existing `buildStandalonePage` helper. For project pages, `sessionBaseUrl` is `'./sessions'` — same relative scheme already used by `exportHtml()`. Also add `generatePortfolioHtmlFragment(profile, listedProjects, username)` which returns the fragment only (no shell) for the Phoenix upload path.
- `cli/src/export.ts` — add `safePortfolioExportPath(outputPath)` that validates the path is absolute and user-writable, without restricting to `EXPORTS_BASE`. The existing `safeExportPath` for per-project exports is unchanged.
- `cli/src/render/types.ts` — add `export type RenderTarget = 'fragment' | 'static'`. Not yet threaded through render functions; defined here for Phase 2 to consume.

**Key technical decisions:**

The diff between fragment and standalone mode is: standalone inlines CSS via `<style>` and the mount script inline; fragment is the raw body HTML. The existing `buildStandalonePage` in `export.ts` already handles this. The new `generatePortfolioSite` wraps each page type with `buildStandalonePage` and sets appropriate OG tags. CSS is inlined per-page (not a shared `assets/` file) — this duplicates ~40KB of CSS across pages but keeps each page self-contained and diffable by Devon. Font loading stays CDN-linked; offline bundling is out of scope.

**Risks:**

The `portfolio.liquid` templates use project card `href` values that may link to `/:username/:slug` absolute paths. Before writing `generatePortfolioSite`, audit `cli/src/render/templates/editorial/portfolio.liquid` (and one or two other templates) to confirm project links use the `slug` variable as a relative path. If they hardcode `/{{user.username}}/{{project.slug}}`, the export will produce broken links. Fix in the templates before wiring the generator.

**Done when:** Running `generatePortfolioSite` with real local fixture data produces an `index.html` that renders in a browser, links to at least one `projects/{slug}/index.html`, and that project page links to at least one `sessions/{slug}.html`. All links resolve correctly without a server.

**Tests:** Unit test `generatePortfolioSite` with two projects and three sessions. Assert directory structure. Test relative link correctness at all three page levels. Test `generatePortfolioHtmlFragment` produces no `<html>` wrapper. Test `safePortfolioExportPath` rejects system directories.

---

### Phase 2 — Portfolio publish API + Phoenix endpoint

**Goal:** `POST /api/portfolio/upload` on the CLI Express server uploads portfolio HTML to Phoenix and stores it in `rendered_portfolio_html`. Visiting `heyi.am/:username` serves the new HTML. Publish state is written to `settings.json`.

**Files to create / modify:**

- `heyi_am_umbrella/apps/heyi_am_app_web/lib/heyi_am_app_web/controllers/portfolio_api_controller.ex` — create. `publish/2` action: requires `api_auth`, accepts `%{"rendered_html" => html, "template" => name}`, calls `Accounts.update_user_rendered_portfolio_html(user, html)`, returns `%{ok: true, url: "https://heyi.am/#{username}"}`.
- `heyi_am_umbrella/apps/heyi_am_app_web/lib/heyi_am_app_web/router.ex` — add `post "/portfolio/publish", PortfolioApiController, :publish` inside the existing `rate_limit_api_session` scope (around line 82).
- `heyi_am_umbrella/apps/heyi_am/lib/heyi_am/accounts.ex` — add `update_user_rendered_portfolio_html/2` delegating to `rendered_html_changeset`.
- `heyi_am_umbrella/apps/heyi_am/lib/heyi_am/accounts/user.ex` — update `validate_inclusion` for `portfolio_layout` (line 194) to accept all 29 template names, or remove the restrictive validation. The `portfolio_layout` field is a display hint, not a security boundary; the HTML itself is sanitized by `rendered_html_changeset`.
- `cli/src/routes/publish.ts` — add `POST /api/portfolio/upload` Express route. Calls `generatePortfolioHtmlFragment` from Phase 1, then `fetch(${API_URL}/api/portfolio/publish)`. Returns `{ ok: true, url }`. Also calls `savePortfolioPublishState` (below).
- `cli/src/settings.ts` — add `PortfolioPublishState` interface: `{ targets: Record<string, { lastPublishedAt: string, lastPublishedProfileHash: string, lastPublishedProfile: PortfolioProfile, config: Record<string, unknown>, url?: string }> }`. Add `savePortfolioPublishState` and `getPortfolioPublishState`. The hash is `sha256(JSON.stringify(sortedKeys(profile))).slice(0, 16)` — used for draft detection without a full re-render.

**Key technical decisions:**

Draft state detection is profile-hash-based, not HTML-hash-based. Computing a hash of the sorted JSON of `PortfolioProfile` is cheap (no render required). The hash is stored at publish time alongside a full snapshot of `PortfolioProfile`. The "View changes" popover in Phase 3 diffs `getPortfolioProfile()` against the stored snapshot field-by-field. This is simpler and more accurate than diffing rendered HTML.

Verify `HeyiAm.HtmlSanitizer` in `heyi_am_umbrella/apps/heyi_am/lib/heyi_am/html_sanitizer.ex` preserves `data-template`, `data-accent`, and `data-mode` attributes on the template wrapper element — these are required for chart hydration via `mount.js`. If they're stripped, add them to the sanitizer allowlist.

**Risks:**

The `rendered_portfolio_html` column stores potentially ~500KB of HTML for large portfolios. This is consistent with how project HTML is stored today and is fine for Postgres. No changes needed to the Phoenix serving layer — `PortfolioController.show` already pattern-matches on the column value.

**Done when:** `curl -X POST .../api/portfolio/upload` (with valid auth) results in `heyi.am/:username` showing the new portfolio HTML. `settings.json` contains `portfolioPublishState`. `Settings.tsx` profile editor is not removed yet (Phase 3 handles that).

**Tests:** Integration test for `POST /api/portfolio/publish` in Phoenix: happy path, unauthenticated rejection, XSS payload sanitized, `data-*` attributes preserved. Unit test `Accounts.update_user_rendered_portfolio_html/2`. CLI-side unit tests for `savePortfolioPublishState` / `getPortfolioPublishState` round-trips.

---

### Phase 3 — Portfolio workspace UI (single target, heyi.am only)

**Goal:** Clicking "Portfolio" in the CLI nav opens the workspace. Frames 1, 2, and 3 from the mockups are real. Profile editing is gone from `Settings.tsx`. Publish to heyi.am works from the workspace.

**Files to create / modify:**

- `cli/app/src/components/PortfolioWorkspace.tsx` — create. Top-level component. Renders `StatusBar`, `PreviewPane`, and `EditRail` in a split layout (60/40). Manages local state via `usePortfolioStore` hook. Keyboard shortcut `⌘↵` fires the primary action.
- `cli/app/src/components/PortfolioWorkspace/StatusBar.tsx` — create. Target pill (heyi.am only in this phase), state dot with phrase ("Never published" / "Draft — N changes" / "Published, in sync" / "Last publish failed"), primary button. State dot color: gray/amber/green/red. Dot transitions on publish result.
- `cli/app/src/components/PortfolioWorkspace/PreviewPane.tsx` — create. Iframe src is `/preview/portfolio`. Segmented control for Landing / Project (dropdown) / Session (dropdown). 300ms debounce on edit. Scroll preservation via `postMessage`. Template pill and "Open in browser" button stubbed (Phase 6).
- `cli/app/src/components/PortfolioWorkspace/EditRail.tsx` — create. Six collapsible sections: Identity (name, handle, bio — open by default), Contact, Photo & resume, Projects on portfolio (open by default), Template, Accent color. All section content lifted from `Settings.tsx`. Commits on blur for text fields, on selection for everything else. No Save button anywhere.
- `cli/app/src/hooks/usePortfolioStore.ts` — create. `useReducer` + context pattern (check `cli/app/package.json` first; if Zustand is already present, use it). State shape: `{ activeTarget, publishState, profile, isDraft, changeList, isPublishing, lastPublishError }`. `isDraft` is derived by comparing `sha256(sortedJson(profile))` against stored hash.
- `cli/app/src/App.tsx` — add `<Route path="/portfolio" element={<PortfolioWorkspace />} />`. Add Portfolio to the nav (alongside Projects, Settings in the existing nav structure).
- `cli/app/src/components/Projects.tsx` — remove the "My Portfolio" link that opens `/preview/portfolio` (the debug tunnel).
- `cli/app/src/components/Settings.tsx` — remove the "Portfolio profile" card (lines 231–480) and the "Portfolio theme" card (lines 159–228). Settings now contains only: API configuration, Privacy defaults, Authentication. The `Link to="/templates"` at line 213 is removed.
- `cli/app/src/api.ts` — add `publishPortfolio()` and `fetchPortfolioPublishState()`.
- `cli/src/routes/preview.ts` — add a 30-second TTL cache for the `/preview/portfolio` render data (same pattern as `previewDataCache` used for projects). Key: `'portfolio'`. Invalidate on any `POST /api/portfolio` (profile save) or when the project list changes.

**Key technical decisions:**

The sidebar IA is **five top-level destinations** in this order: Dashboard, Projects, Portfolio, Sessions, Settings. Dashboard and Sessions are existing surfaces and are NOT touched by this work — they keep working exactly as they do today. The only structural change Phase 3 introduces is extending `AppShell` to render a persistent 220px left rail with these five items, plus a ⌘K search pill in the top bar (right side, mono). Onboarding and the project upload wizard both deposit users on the **Dashboard at `/`**, not on the Portfolio workspace — the Dashboard is the orientation surface and the post-onboarding landing; Portfolio is something users navigate into from the Dashboard or the sidebar, not a place they get dropped. The Phase 6 `FirstRun.tsx` task and the wizard Done handoff both terminate at `/`, not `/portfolio`.

**Risks:**

The profile editor in `Settings.tsx` has file upload logic for photos and resumes (base64 encoding via FileReader, 5MB/10MB limits). This logic must be copied exactly to `EditRail.tsx` before deleting it from `Settings.tsx`. Copy-then-delete, never refactor-and-move in a single step.

**Done when:** Opening `/portfolio` shows the workspace. Editing a field in the edit rail updates the preview pane within 300ms. Clicking publish transitions the status bar to published state. `heyi.am/:username` shows the updated portfolio. `Settings.tsx` no longer contains the profile editor.

**Tests:** Render tests for `PortfolioWorkspace.tsx` at idle/draft/published/error states. Unit tests for `usePortfolioStore` state transitions (isDraft computation, publish lifecycle). Test that EditRail fields call the correct update handler. Test that the preview pane debounces correctly.

---

### Phase 4 — Static export target (folder)

**Goal:** Target picker sheet opens from the status bar. "Export to folder" is the first card. Picking it, choosing a folder, and clicking Publish writes a complete static site to disk and opens Finder. Frames 4 and the Export half of Frame 6 are real.

**Files to create / modify:**

- `cli/app/src/components/PortfolioWorkspace/TargetPickerSheet.tsx` — create. Sheet that slides from the status bar (CSS transform, not a full modal). Three target cards in order: Export to folder, heyi.am, GitHub Pages (disabled/grayed in this phase). Card for Export shows inline config on selection: one directory path field with a native folder picker button (File System Access API `showDirectoryPicker()`, with text input fallback). "Publish" button in the sheet footer commits the target config.
- `cli/app/src/components/PortfolioWorkspace/StatusBar.tsx` — extend. Target pill chevron opens `TargetPickerSheet`. When the active target is Export, the primary button reads "Publish to Folder." Multi-target per-target dots on pill hover (Phase 4 only has two targets — Export and heyi.am — the dots are simple).
- `cli/src/routes/publish.ts` — add `POST /api/portfolio/export` route. Calls `generatePortfolioSite` from Phase 1 with the user-chosen output directory. On success, calls platform-appropriate open command (`open` on macOS, `xdg-open` on Linux; check `process.platform`). Returns `{ ok: true, path: outputDir, fileCount }`. The existing `safeExportPath` is not used for this route — use `safePortfolioExportPath` from Phase 1.
- `cli/app/src/api.ts` — add `exportPortfolioToFolder(outputDir)`.
- `cli/src/settings.ts` — extend `PortfolioPublishState.targets` config schema. Export target config: `{ outputDir: string }`.

**Key technical decisions:**

The File System Access API `showDirectoryPicker()` is available in Chromium but not Firefox or Safari. The CLI runs at localhost:17845 in the user's default browser. Most devs use Chrome or a Chromium-based browser, but provide the text-input fallback regardless. The text input is preferable for Devon anyway — he will type the path.

"Export" uses "Publish to Folder" as the primary button label. The post-publish toast reads "Published 47 files to ~/sites/portfolio. [Reveal in Finder]." This is the consistent-verb moment from the UX doc. Do not use "Exported" anywhere.

**Risks:**

The `open` command in `cli/src/routes/export.ts` is macOS-only (line 211: `execFileSync('open', [resolved])`). The new portfolio export handler must branch on `process.platform`. Use `xdg-open` on Linux; log a warning and skip the reveal on Windows (no `explorer` equivalent that reliably works cross-distro without admin setup).

**Done when:** Target picker sheet opens from the status bar. User selects Export, chooses a folder, clicks Publish. A static site directory appears. Finder opens at that path on macOS. Status bar updates to show the Export target as the active target with a green dot.

**Tests:** Integration test for `POST /api/portfolio/export` writing to a temp directory; assert `index.html` and `projects/` subdirectory exist. Unit test `TargetPickerSheet` renders cards in the correct order (Export first). Test platform-branching for the open-directory command.

---

### Phase 5 — GitHub Pages target

**Goal:** GitHub Pages appears as the third target card, fully functional. User connects GitHub, picks a repo, clicks Publish, and the dot goes green after Pages build. Connected accounts section appears in Settings. Frames 7 and the GitHub Pages half of Frame 6 are real.

**Files to create / modify:**

- `cli/src/github.ts` — create. Functions: `startGitHubDeviceAuth()`, `pollGitHubDeviceToken(deviceCode)`, `storeGitHubToken(token)` (calls `keytar.setPassword('heyiam', 'github-oauth', token)`), `getGitHubToken()`, `deleteGitHubToken()`, `listUserRepos(token)`, `pushPortfolioToPages(outputDir, repoFullName, branch, cname?)`, `pollPagesDeployStatus(repoFullName, commitSha)`. Uses the GitHub API; does not require `git` CLI on the user's machine.
- `cli/src/routes/github.ts` — create Express router. Routes: `POST /api/github/auth/start`, `POST /api/github/auth/poll`, `DELETE /api/github/auth/token`, `GET /api/github/repos`, `POST /api/portfolio/publish-pages`.
- `cli/src/server.ts` — register the new GitHub router.
- `cli/app/src/components/PortfolioWorkspace/TargetPickerSheet.tsx` — enable GitHub Pages card. Inline config flow: "Connect GitHub" button → device auth inline panel (shows `user_code` + `verification_uri`, polls automatically) → repo/branch/CNAME fields after auth completes. "Connect and publish" button in footer does both config save and initial publish in one chain.
- `cli/app/src/components/Settings.tsx` — add "Connected accounts" section showing connected GitHub account (email, avatar, disconnect button). This section appears here for management only; connection happens inline in the target picker.
- `cli/package.json` — add `keytar` dependency. Verify native addon compilation works alongside `better-sqlite3` (existing precedent for native addons in this project).

**Key technical decisions:**

GitHub tokens go in the OS keychain via keytar. They never appear in `~/.config/heyiam/settings.json`. This is non-negotiable.

File push strategy: use the GitHub Git Data API to push a tree in one batch request (Create Tree + Create Commit + Update Ref). This is 3 API calls regardless of file count, not N calls. This avoids rate limit problems on large portfolios. The single-file `PUT /repos/:owner/:repo/contents/:path` approach is simpler but has per-file overhead; go straight to the tree approach in Phase 5.

Pages build polling: `GET /repos/:owner/:repo/pages/builds/latest` every 5 seconds for up to 120 seconds. If `status === 'built'` and `commit.sha` matches the push SHA, flip green. If timeout, set amber with "Pushed, Pages build unknown." Never show green when uncertain.

**Risks:**

Keytar requires native compilation. If `better-sqlite3` already compiles correctly in the build setup, keytar should follow the same pattern. If the CLI is distributed as a standalone binary via `pkg` or similar, keytar needs special handling (native addons don't bundle cleanly with pkg). Verify the distribution format before committing to keytar.

**Done when:** User can connect GitHub from the target picker, push to a Pages branch, and the green dot appears after the Pages build completes. Token is in keychain. Settings → Connected accounts shows connected GitHub account with a working disconnect button. GitHub Pages card in target picker is enabled.

**Tests:** Unit tests for `github.ts` with mocked `keytar` and mocked fetch. Test the device auth state machine. Test `pushPortfolioToPages` makes the correct GitHub API calls. Test polling returns the right states. Integration tests for the Express routes against a mocked GitHub service.

---

### Phase 6 — Template browser + polish

**Goal:** Template browser works as a modal invoked from the Portfolio workspace edit rail. Template pill appears in the preview pane header. "Open in browser" button works. FirstRun ends at Portfolio. Settings has Local data section. Frames 5, 8, and 9 are real.

**Files to create / modify:**

- `cli/app/src/components/TemplateBrowser.tsx` — refactor to support `mode: 'modal' | 'route'` prop. In `modal` mode: renders as a fixed overlay with a close button and a "Use this template" footer button. In `route` mode: renders as the existing page with `AppShell` wrapper. Add "My data" toggle: when on, the preview iframe switches from `/preview/template/:name` to `/preview/portfolio?template=:name`. All existing filtering and sorting logic is preserved.
- `cli/app/src/components/PortfolioWorkspace/PreviewPane.tsx` — add Template pill (monospace badge, shows active template name, opens TemplateBrowser in modal mode). Add "Open in browser ↗" button: on heyi.am target, opens `https://heyi.am/:username` in a new tab if published, `/preview/portfolio` if not; on Export target, opens the export directory; on GitHub Pages, opens the Pages URL.
- `cli/app/src/components/PortfolioWorkspace/EditRail.tsx` — wire the Template section's "Change template" button to open the `TemplateBrowser` modal. Handle the `onSelect` callback: update the template field, show a 15-second undo toast.
- `cli/app/src/components/FirstRun.tsx` — at the `dashboard` transition (after `claim_username` step), confirm navigation lands at `/` (the Dashboard). The Dashboard is the post-onboarding home, not Portfolio. If the current code already navigates to `/`, no change; if it was previously changed to `/portfolio`, revert to `/`.
- `cli/app/src/components/PublishReview.tsx` — the wizard Done step navigates to `/portfolio` (as already planned), depositing the user in the workspace with the new project as a draft. This is distinct from the onboarding handoff.
- `cli/app/src/components/Settings.tsx` — add "Local data" section: archive health (session count, last archive timestamp from SQLite), daemon status (running/stopped), local database path.
- `cli/app/src/App.tsx` — keep `/templates` route (the `TemplateBrowser` in `route` mode) alongside the modal entry point.
- **Dashboard enhancements (additive, not a rebuild).** Dashboard is an existing surface and is NOT being redesigned. These are drop-in changes during Phase 6 polish:
  - Add **"Open Portfolio"** as a fourth button in the Dashboard action row alongside the existing Sync / View projects / Search sessions buttons. Navigates to `/portfolio`.
  - Update the **Export** feature callout copy to reflect the local-first multi-target story: "Export your full portfolio as a static site, publish to heyi.am, or push to GitHub Pages." The callout CTA deep-links to `/portfolio` with the target picker sheet pre-opened (query param or store flag consumed by `PortfolioWorkspace` on mount).
  - Wire the **"Enhanced: N"** stat card to be clickable — navigates to Projects filtered to unenhanced projects (the enhancement-status surfacing angle). Hero copy, stat cards, recent projects grid, and Sources are otherwise untouched.

**Key technical decisions:**

The "My data" toggle sends the user's real data to the template preview. If the user has no published projects, the preview pane shows a sparse layout — that is correct and honest. Add a `postMessage` from the iframe to the parent frame when fewer than 3 projects are present; the parent shows a non-blocking "This template expects more data" banner. The "Use this template" button is never disabled.

**Risks:**

`TemplateBrowser.tsx` is currently ~400 lines with complex concurrent iframe loading logic. The mode prop is additive (no existing behavior changes), but the "My data" toggle requires wiring a new iframe src. Run the refactored component in both modes in test before removing the old standalone route.

**Done when:** Template pill in preview pane opens the template browser modal. "Use this template" commits and shows undo toast. `/templates` route still works. "Open in browser" opens the correct URL per target. `FirstRun` ends by navigating to `/portfolio`. Settings has a Local data section.

**Tests:** Snapshot tests for `TemplateBrowser` in `mode='modal'` and `mode='route'`. Test "My data" toggle changes iframe src. Test `onSelect` fires correctly. Test "Open in browser" opens correct URL per target. Test `FirstRun` navigation ends at `/portfolio`.

---

## 4. Cross-Cutting Concerns

**Chart React islands.** `WorkTimeline`, `GrowthChart`, and `DirectoryHeatmap` in `packages/ui/` mount via `data-*` attributes from `heyiam-mount.js`. The mount script is inlined into standalone HTML pages via `getInlineMountJs()` in `export.ts`. For static export this already works. For the Phoenix path, `mount.js` continues to be served via `/heyiam-mount.js`. The render pipeline does not need to change for any phase.

**URL rewriting.** The `sessionBaseUrl` field in `ProjectRenderData` is the single control point for session link generation in Liquid templates. Values by context: Phoenix preview: `/preview/project/:project/session`; Phoenix hosted: unset (templates default to `/:username/:project/:slug`); static export: `./sessions`. This is already correct in `export.ts`. Audit `portfolio.liquid` templates before Phase 1 to confirm project card `href` values are relative (`{{project.slug}}` not `https://heyi.am/...`). Fix any hardcoded URLs before writing the generator.

**Asset deduplication.** Each page in the static export inlines the same ~40KB of CSS and any screenshots as data URIs. For a 10-project portfolio this is ~400KB of duplicated CSS. This is a known tradeoff of the self-contained page approach. Document it in the export UI. Do not add shared `assets/` directory structure in v1 — it complicates the link scheme and is premature optimization.

**Diff state for the draft UI.** The amber dot is driven by comparing `sha256(sortedJson(currentProfile))` against `lastPublishedProfileHash` in `PortfolioPublishState`. This requires no render. The "View changes" popover does a field-by-field diff between `getPortfolioProfile()` and the `lastPublishedProfile` snapshot stored at publish time. Project ordering is part of `lastPublishedProfile` (stored as `projectOrder: string[]`). Template and accent color changes are detected via their fields in the profile.

**Portfolio preview cache.** The `/preview/portfolio` endpoint in `cli/src/routes/preview.ts` calls `ctx.getProjectWithStats()` for every project on every request. Add a 30-second TTL cache for the assembled `PortfolioRenderData`, keyed by `'portfolio'`, using the same `previewDataCache` Map pattern already in use for project previews. Invalidate the cache key on any `POST /api/portfolio` (profile update) or project list change.

**Migration of existing data.** For users who have previously published projects via the old wizard, `rendered_portfolio_html` is null. The `PortfolioController.show` in Phoenix already handles this with a fallback to the legacy template-based view. That fallback stays intact throughout all phases. The first portfolio publish via Phase 3 sets the column for the first time. No migration script needed.

---

## 5. Open Questions Blocking Final Scope

**`/:username` before first publish: 404 or claimed-empty placeholder?** The UX doc recommends 404 to avoid leaking account existence. The current code returns the legacy portfolio view (not a 404) for users with `rendered_portfolio_html = null` because listed projects can exist. Resolving this requires a PM decision on whether the legacy fallback view is the right pre-publish state or whether it should be removed. Trade-off: 404 is cleaner but a prematurely shared link looks broken; legacy fallback is messier but more forgiving.

**Project ordering: auto by recency or user-curated drag-to-reorder?** This is the largest scope variable in Phase 3. Curated ordering requires a drag-to-reorder component in the "Projects on portfolio" section of the edit rail and a `projectOrder: string[]` field in settings. Auto-by-recency requires no new UI. The designer recommended curated. The PM must decide before Phase 3 starts.

**Custom domains on heyi.am in v1?** The UX doc recommends shipping the UI field (collapsed in the heyi.am target config) even if backend support is pending — the UI collects and stores the value, and a "DNS configuration required" helper state shows when backend isn't ready. PM must decide whether to ship the stub or omit the field.

**GitHub token expiry: silent failure vs. targeted re-auth flow?** The UX doc recommends an inline "token expired — reconnect" error with a Reconnect button that retries on success. This is additional engineering in Phase 5. PM must decide whether Phase 5 ships with graceful re-auth or with a simple error pointing to Settings.

**Unlisted / shareable-link state — per-target visibility toggle?** The heyi.am target could offer Public / Unlisted visibility. The existing data model supports it. The question is whether the portfolio workspace surfaces this toggle (on the heyi.am target config) in v1 or defers to v2.

---

## 6. Testing Strategy

**L1 (Renderer):** Unit tests in `cli/src/render/` following the pattern in `cli/src/render/build-render-data.test.ts`. Test `generatePortfolioSite` with fixture data: one profile, two projects, three sessions each. Assert: `index.html` exists, `projects/{slug}/index.html` exists for each project, `projects/{slug}/sessions/{slug}.html` exists for each session. Test that relative links in `index.html` resolve to `projects/` without a server. Test `generatePortfolioHtmlFragment` produces no `<html>` wrapper. Test `safePortfolioExportPath` validation.

**L2 (Phoenix API):** Integration tests in `heyi_am_umbrella/apps/heyi_am_app_web/test/controllers/portfolio_api_controller_test.exs`. Test: valid HTML + valid auth → 200; unauthenticated → 401; XSS payload → HTML sanitized, `data-*` attrs preserved. Unit test `Accounts.update_user_rendered_portfolio_html/2`. CLI side: unit tests for `savePortfolioPublishState` / `getPortfolioPublishState` in `cli/src/routes/settings.test.ts` pattern.

**L3 (Workspace UI):** React Testing Library tests for `PortfolioWorkspace.tsx` at all four state variants (never published, draft, published, publish-failed). Test the 300ms debounce on preview re-render. Test that the publish button calls `publishPortfolio()` and transitions state. Test the "View changes" diff popover field comparison. Test that `Settings.tsx` no longer renders the profile editor sections (negative test).

**L4 (Export target):** Integration test for `POST /api/portfolio/export` writing to a temp directory. Assert directory structure. Unit test `TargetPickerSheet` renders cards in correct order. Test the folder picker button calls the File System Access API and falls back to text input. Test platform-branching for the open-directory command (macOS vs Linux).

**L5 (GitHub Pages):** Unit tests for `cli/src/github.ts` with mocked `keytar` and mocked GitHub API. Test the device auth state machine (start → pending → token received → stored in keychain). Test `pushPortfolioToPages` issues the correct tree/commit/ref GitHub API calls. Test `pollPagesDeployStatus` returns correct states. Integration tests for Express routes in `cli/src/routes/github.ts` against mocked GitHub service.

**L6 (Polish):** Snapshot tests for `TemplateBrowser` in `mode='modal'` vs `mode='route'`. Test "My data" toggle changes iframe src. Test `onSelect` fires with correct template name. Test the Template pill in preview pane opens the modal. Test "Open in browser" opens correct URL per target. Test `FirstRun` navigates to `/portfolio` at sequence end.

---

## 7. What's Deliberately NOT in This Plan

**Per-project template overrides.** Out of scope by design decision. All projects share the portfolio's template.

**Multi-portfolio support.** v2. One portfolio per user in v1; flexibility belongs in which projects are listed, not in how many portfolios exist.

**Project workspace redesign.** `ProjectDetail.tsx` and `ProjectDetailWrapper` in `App.tsx` are untouched. Sessions remain accessible inside project detail.

**The Enhance/Triage/Questions wizard.** `ProjectEnhanceFlow.tsx` and `PublishReview.tsx` are untouched. First-time users still walk through the 7-step wizard.

**Onboarding restructure.** `FirstRun.tsx` gets one line change (navigation destination at end). The 8-step onboarding flow itself is not restructured.

**Offline font bundling.** Static export pages load Google Fonts via CDN. Bundling for offline use is a future enhancement.

**Incremental publish.** Every publish is a full clean re-render. The render pipeline completes in under two seconds; incremental diffing is not worth the state complexity.

**Recruiter analytics, verification badges, monetization features.** Separate work requiring separate product decisions.
