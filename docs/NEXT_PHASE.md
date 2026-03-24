# Next Phase: Dashboard, Mockup, Tests & Cleanup

## Context

The umbrella migration is structurally complete. 4 apps (core, public_web, app_web, vibe_web) compile and serve on 3 ports. 386 tests pass. Auth works (registration, login, GitHub OAuth, sudo mode, session reissuing). But there's no dashboard, the CSS isn't loading on some pages, several docs are stale, and the interactive flow mockup needs a full rewrite for the new architecture.

## Work Items

### 1. Fix CSS loading across all app_web pages
**Files:** `apps/heyi_am_app_web/lib/heyi_am_app_web/components/layouts/app.html.heex`

The `app.html.heex` layout only has `{@inner_content}` with no wrapper. The old app had the AppShell wrapping authenticated pages. Need to verify the root layout loads CSS correctly and the app layout provides proper page structure.

- Verify `root.html.heex` has the CSS link (it does)
- Check if esbuild is building CSS correctly in Docker (the watcher may not be running)
- Ensure `app.html.heex` wraps content in proper layout structure

### 2. Build Dashboard page (`/dashboard`)
**Files to create:**
- `apps/heyi_am_app_web/lib/heyi_am_app_web/controllers/dashboard_controller.ex`
- `apps/heyi_am_app_web/lib/heyi_am_app_web/controllers/dashboard_html.ex`
- `apps/heyi_am_app_web/lib/heyi_am_app_web/controllers/dashboard_html/index.html.heex`
- `apps/heyi_am_app_web/test/heyi_am_app_web/controllers/dashboard_controller_test.exs`

**Files to modify:**
- `apps/heyi_am_app_web/lib/heyi_am_app_web/router.ex` — add `get "/dashboard", DashboardController, :index` in authenticated scope

**Dashboard features (all selected by user):**
- **Project management**: list user's projects with status badges (draft/unlisted/published), toggle visibility, delete
- **Session management**: list sessions per project, toggle transcript visibility, delete
- **Portfolio preview link**: link to `heyi.am/:username` (or `localhost:4000/:username` in dev)
- **CLI connection status**: device auth status, connected tools, last sync

**Context functions needed** (verify these exist in core):
- `HeyiAm.Projects.list_projects_for_user/1`
- `HeyiAm.Shares.list_shares_for_project/1`
- `HeyiAm.Projects.update_project_visibility/2`
- `HeyiAm.Shares.update_transcript_visibility/2`

### ~~3. Create new interactive flow mockup (v2)~~ (done)
**Files created:** `mockups/interactive-flow-v2.html`, `mockups/interactive-flow-v3.html`

Updated for 3-domain architecture. Screens:

**CLI (localhost:17845):**
1. Session browser — empty
2. Project dashboard — project-first view
3. Session detail — raw
4. Settings
5. Enhance — no API key
6. Enhance — unified flow
7. Editor
8. Editor — auth prompt
9. Publish — streaming terminal
10. Publish success — linked
11. Publish success — anonymous

**App web (heyiam.com / localhost:4001):**
12. Landing/Login
13. Sign up
14. Claim username
15. Dashboard — projects overview (NEW)
16. Dashboard — project expanded with sessions (NEW)
17. Settings
18. Device auth

**Public web (heyi.am / localhost:4000):**
19. Portfolio page
20. Project detail
21. Session case study — editorial template
22. Session — terminal template
23. Session — minimal template
24. Session — brutalist template
25. Transcript deep dive
26. Sealed verification
27. Portfolio — empty state
28. 404

**Vibe web (howdoyouvibe.com / localhost:4002):**
29. Vibe picker
30. Vibe result

**Removed from old mockup** (no longer needed):
- Portfolio editor (editing is CLI-only now)
- Project editor (CLI-only)
- Challenge/hiring screens (deferred)

### ~~4. Fix remaining test failures after user_auth.ex changes~~ (done)
Fixed — 434 tests passing across all 4 apps. Session reissuing and tuple behavior verified.

### 5. Security invariant tests
**Files to create:**
- `apps/heyi_am_public_web/test/security_test.exs` (may already exist)
- `apps/heyi_am_app_web/test/security_test.exs` (may already exist)
- `apps/heyi_am_vibe_web/test/security_test.exs` (may already exist)

**Tests:**
- public_web: no Set-Cookie header, no CSRF token, strict CSP, no LiveView socket
- app_web: no `raw()` in any template (grep), no portfolio routes, sets session cookie
- vibe_web: no Set-Cookie header, no CSRF token

### 6. Docs cleanup
**Updated:**
- ~~`docs/UMBRELLA_MIGRATION.md`~~ — rewritten as final architecture doc (done)
- ~~`docs/MANUAL_TEST_PLAN.md`~~ — rewritten for umbrella, 3 ports, 3 domains (done)

**Removed:**
- `docs/project-upload/` — deleted (PRD, screen specs, data model superseded by PRODUCT.md)

**Keep as-is:**
- `docs/CONTENT_LIFECYCLE.md` — still accurate
- `docs/RENDERING_ARCHITECTURE.md` — still accurate
- `docs/COOLIFY_DEPLOY.md` — needs minor update for 3 ports
- `docs/PRODUCT.md`, `docs/MARKET.md`, `docs/MONETIZATION.md` — product docs, still relevant
- `docs/STAT_FRAMEWORK.md`, `docs/STAT_PICKER_UX_SPEC.md` — keep (stats still used in CLI)

### 7. CLI updates for multi-port
- Update `HEYIAM_API_URL` default to point to `heyiam.com` / `localhost:4001`
- Update `cli/src/server.ts` publish flow: API calls go to app domain
- Update CLI auth flow: device auth verification_uri points to app domain
- Test CLI flows still work

## Execution Order
1. ~~Fix CSS loading~~ (done)
2. ~~Fix test failures from user_auth.ex changes~~ (done — 434 tests passing)
3. Build dashboard (biggest new feature — NOT YET STARTED)
4. ~~Create new mockup~~ (done — v2 and v3 in `mockups/`)
5. Security invariant tests (not yet started)
6. ~~Docs cleanup~~ (in progress)
7. CLI updates (not yet started)

## Verification
- `cd heyi_am_umbrella && for app in heyi_am heyi_am_app_web heyi_am_public_web heyi_am_vibe_web; do cd apps/$app && MIX_ENV=test mix test && cd ../..; done`
- `docker compose -f docker-compose.dev.yml up -d` — all 3 endpoints serve
- Visit localhost:4001 → login → redirects to /dashboard
- Visit localhost:4001/dashboard → shows projects, sessions, links
- Visit localhost:4000/:username → public portfolio
- Visit localhost:4002 → vibe gallery
- `grep -r "raw(" apps/heyi_am_app_web/lib/ --include="*.heex"` — must be empty
- `grep -r "Plug.Session" apps/heyi_am_public_web/lib/` — must be empty
