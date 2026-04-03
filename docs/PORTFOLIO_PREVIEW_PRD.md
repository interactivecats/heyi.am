# Portfolio Preview in CLI -- Product Requirements

**Author:** Product
**Date:** 2026-04-02
**Branch:** `feature/template-system`
**Status:** Draft

---

## Problem Statement

Users edit their profile (bio, photo, links) in Settings and choose a template in the Template Browser, but they have no way to see what their portfolio landing page (heyi.am/@username) will actually look like before publishing. The portfolio page is the first thing hiring managers see. Users are publishing blind.

**Evidence of the problem:**
- The Settings page has a complete profile editor (bio, photo, email, phone, location, LinkedIn, resume, social links) with no visual feedback
- The Template Browser shows portfolio previews using mock data (fake name, fake projects), not the user's real profile and projects
- There is no `/portfolio` route in the React app -- the route simply does not exist
- The publish flow hardcodes `template: 'editorial'` regardless of what template the user selected (publish.ts lines 339, 373)
- Session pages linked from project templates navigate to `/preview/project/:project/session/:sessionId` which opens a full-page preview outside the React app, breaking navigation

**Who is affected and how badly:**
Every user who publishes. The portfolio page is the entry point for all visitors. Publishing without previewing means users discover layout problems, missing fields, or template mismatches only after their portfolio is live. For a product that promises developers control over how they present their work, this is a credibility problem.

---

## Answers to Scoping Questions

### 1. What is the MVP for portfolio preview?

**Must include (MVP):** A way to see your real portfolio page -- your actual bio, your actual projects, your chosen template -- before publishing. One route, one render, real data.

**Can wait:** Editing profile fields inline on the preview page (Settings already handles editing). Interactive project card clicks from the portfolio preview. Per-project template overrides. Side-by-side template comparison on the portfolio view.

### 2. Should portfolio preview live in template selection, profile editing, or both?

**Both, but differently.**

- **Settings (profile editing):** Add a "Preview portfolio" button that opens the portfolio preview. This is the natural moment -- you just edited your bio and want to see how it looks.
- **Template Browser:** Change portfolio preview iframes from mock data to real user data (when available). This is where you are choosing how your portfolio looks.
- **Standalone route:** `/portfolio` as a first-class route in the React app. Accessible from the sidebar/nav. This is where you go to see the whole picture.

### 3. User journey: profile setup to preview to publish

```
Settings (edit profile)
    |
    v
"Preview portfolio" button --> /portfolio route
    |                              |
    |                     Renders portfolio with:
    |                     - Real profile data
    |                     - Real project list
    |                     - Selected template
    |                              |
    v                              v
Template Browser  <---  "Change template" link
    |
    v
Portfolio preview updates with new template
    |
    v
User publishes (individual projects via project detail flow)
    |
Portfolio page on heyi.am uses selected template
```

### 4. How important is real data vs mock data?

**Critical for the portfolio preview route itself.** The entire point is to answer "what will MY portfolio look like?" Mock data answers a different question ("what does this template look like in general?"). The Template Browser can continue using mock data as a reasonable default for template comparison, but the portfolio preview must use real data or it provides no value.

**Fallback rule:** If a user has zero published/enhanced projects, show an empty state with a clear message ("Add projects to see your portfolio preview") rather than mock data. Mock data in a "preview" context creates false confidence.

### 5. Should session pages be viewable in the CLI?

**Out of scope for this work.** Session pages already render via `/preview/project/:project/session/:sessionId` as full-page HTML. The issue is that clicking a session link from a project template navigates away from the React app. This is a navigation/UX problem, not a rendering problem, and it can be addressed separately (likely by opening session previews in a modal or new tab rather than in-app navigation).

### 6. Priority order for the identified gaps

See the requirements below. The ordering reflects a dependency chain: you cannot verify your portfolio looks right if the template you selected is not the template that renders, and you cannot preview at all if the route does not exist.

---

## Requirements

### P0 -- Blocks the core value proposition

These must ship together. A portfolio preview that renders the wrong template, or a template that renders blank, defeats the purpose.

#### P0-1: Portfolio preview route with real data

**What:** Add `/portfolio` route to the React app that renders the user's portfolio page using their real profile data, real project list, and selected template.

**Backend:** Add `GET /api/portfolio/render` endpoint that:
- Reads the user's saved portfolio profile (bio, photo, links) from settings
- Reads the user's project list (with stats: session count, LOC, duration)
- Reads the user's selected template from settings
- Calls `renderPortfolioHtml()` with real `PortfolioRenderData`
- Returns `{ html, css, template }` (same pattern as `/api/projects/:project/render`)

**Frontend:** New `PortfolioPreview.tsx` component that:
- Fetches `/api/portfolio/render`
- Injects the HTML into a container with scoped CSS (same pattern as `ProjectDetail.tsx`)
- Shows a banner: "PREVIEW -- this is how your portfolio will appear at heyi.am/@username"
- Has a "Change template" link to `/templates`
- Has an "Edit profile" link to `/settings`
- Supports `?template=` query param for template override (for use from Template Browser)

**Acceptance criteria:**
- Visiting `/portfolio` in the CLI shows the user's portfolio with their real bio, real project names, and real aggregate stats
- If the user has no profile data, the page renders with empty/default fields (not mock data)
- If the user has no projects, the page shows an empty state message
- Changing the template in Settings and returning to `/portfolio` shows the new template

#### P0-2: Publish flow uses selected template

**What:** The upload endpoint must use the user's selected template, not hardcoded `'editorial'`.

**Changes:**
- `publish.ts` line 339: Replace `template: 'editorial'` with `getDefaultTemplate()` for session upload payloads
- `publish.ts` line 373: Same replacement for session data payloads
- `publish.ts` ~line 536: Pass selected template to `renderProjectHtml()` when generating `rendered_html`
- `publish.ts` render-preview endpoint (line 65): Pass template to `renderProjectHtml()`

**Acceptance criteria:**
- Publishing a project with template set to "kinetic" sends `template: 'kinetic'` in the upload payload
- The `rendered_html` in the upload payload is rendered using the selected template, not editorial
- Changing template and re-publishing updates the rendered HTML on the server

#### P0-3: Fix blank template rendering

**What:** Identify and fix templates that render blank when applied to real project data. This is likely caused by Liquid templates referencing data fields that exist in mock data but not in real render data, or by CSS that hides content by default expecting JavaScript initialization that does not run.

**Investigation needed:** Systematically render each of the 30 templates with real project data and identify which ones produce empty/broken output. Fix the Liquid templates or the data pipeline as needed.

**Acceptance criteria:**
- All 30 templates produce visible, non-blank output when rendered with real project data that has at least a title, one session, and basic stats
- Templates that require optional fields (screenshot, narrative, timeline) degrade gracefully -- they hide the section rather than rendering a blank page

---

### P1 -- Significantly improves the experience

These make the preview workflow feel complete. Ship within the same release if possible, but they do not block initial usability.

#### P1-1: Portfolio preview link from Settings

**What:** Add a "Preview your portfolio" button/link in the Settings page, in or near the Profile section, that navigates to `/portfolio`.

**Rationale:** Settings is where users edit their profile. The natural next action after editing is "let me see how it looks." This link closes the feedback loop.

**Acceptance criteria:**
- The Settings page has a visible link/button to `/portfolio` near the profile editing section
- The link is always visible (not conditional on having projects)

#### P1-2: Template Browser uses real data for portfolio previews when available

**What:** When a user has saved profile data and has at least one project, the Template Browser's portfolio preview iframes should render with real data instead of mock data.

**Backend:** Add `GET /preview/portfolio` endpoint (or modify `/preview/template/:name?page=portfolio`) that:
- If the user has saved portfolio profile data AND at least one project: render with real data
- Otherwise: fall back to mock data (current behavior)

**Rationale:** The Template Browser is where users compare templates. Seeing their own data in the comparison makes the choice more informed. But mock data is an acceptable fallback for new users who have not set anything up yet.

**Acceptance criteria:**
- User with profile + projects sees their real name/bio/projects in template portfolio previews
- User without profile data sees mock data (no broken/empty previews)
- Template comparison is still fast (cache the portfolio render data, re-render per template)

#### P1-3: Nav entry for portfolio preview

**What:** Add "Portfolio" to the CLI dashboard sidebar/navigation so users can reach it without going through Settings first.

**Acceptance criteria:**
- "Portfolio" appears in the main navigation
- It links to `/portfolio`

#### P1-4: Charts and graphs match mockup designs

**What:** The work timeline and growth chart React components (hydrated into Liquid placeholders) need to match the visual design established in the template mockups.

**Investigation needed:** Compare current `WorkTimeline.tsx` and `GrowthChart.tsx` output against the mockup designs. Identify specific discrepancies (colors, sizing, axis labels, bar styles, responsive behavior).

**Acceptance criteria:**
- Charts rendered in the CLI project preview visually match the corresponding template mockup designs
- Charts respect the template's color scheme (dark templates get light-on-dark charts, etc.)

---

### P2 -- Nice to have, not blocking

#### P2-1: Session preview opens in overlay instead of navigating away

**What:** When a user clicks a session link from within a project template preview, instead of navigating to `/preview/project/:project/session/:sessionId` (which leaves the React app), open the session preview in a modal/overlay or a new browser tab.

**Rationale:** The current behavior is disorienting -- clicking a session link takes you to a full-page server-rendered HTML page with no way back to the dashboard except the browser back button. This is a UX paper cut, not a blocker.

**Acceptance criteria:**
- Clicking a session link from a project preview does not navigate the main React app away
- The user can return to the project detail page without using browser back

#### P2-2: Portfolio preview with real data accessible as standalone page

**What:** Add `GET /preview/portfolio` endpoint that serves a full standalone HTML page (like the existing `/preview/project/:project` endpoint) showing the portfolio with real data. This is the page-level equivalent of the project preview -- useful for sharing the preview URL or opening in a new tab.

**Acceptance criteria:**
- `/preview/portfolio` renders a full HTML page with the user's real portfolio
- The page includes the same "PREVIEW" banner as project previews
- Uses the selected template

---

## Out of Scope

- **Per-project template selection.** All projects use the same template for now. Per-project overrides add UI complexity without clear user demand.
- **Inline profile editing on the preview page.** Settings handles editing. The preview page is read-only.
- **Portfolio publish button.** Portfolio publishing (uploading the portfolio page HTML to the server) is a separate feature. This PRD covers preview only. The publish flow already handles individual project uploads; portfolio-level publish is future work.
- **Custom user themes.** The data model should not block this, but building the custom theme editor is not part of this work.
- **Mobile-responsive preview.** Templates should be responsive by design, but adding a "preview at different screen sizes" feature is out of scope.

---

## Technical Notes

**Existing infrastructure that makes this feasible:**

1. `renderPortfolioHtml()` already exists and works (used in template mock previews)
2. `PortfolioRenderData` type is defined with `user`, `projects`, and aggregate stats
3. `fetchPortfolio()` API function already exists on the frontend
4. `GET/POST /api/portfolio` endpoints exist for profile CRUD
5. The project list with stats is already available via `fetchProjects()`
6. `getDefaultTemplate()` already reads the user's template selection from settings
7. The pattern for injecting server-rendered HTML into React (used in `ProjectDetail.tsx`) is established

**What needs to be built:**

1. A `buildPortfolioPreviewData()` function that assembles real `PortfolioRenderData` from the user's settings and project list (analogous to `buildProjectPreviewData()` in preview.ts)
2. A `/api/portfolio/render` endpoint that calls it
3. A `PortfolioPreview.tsx` React component
4. A `/portfolio` route in `App.tsx`
5. Template references in `publish.ts` changed from `'editorial'` to `getDefaultTemplate()`

**Estimated scope:** P0 items are roughly one focused work session. The render infrastructure exists; this is mostly wiring and a new React component. P1 items are incremental additions on top of P0.

---

## Success Metrics

- **Primary:** Users who preview their portfolio before first publish (target: >80% of publishing users). Measurable by adding a simple analytics event when `/portfolio` is visited.
- **Secondary:** Reduction in "publish, check live site, re-publish" cycles. If users preview first, they should need fewer publish iterations to get their portfolio looking right.
- **Proxy signal during development:** All 30 templates render non-blank output with real project data.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-02 | Portfolio preview uses real data, not mock | Mock data answers the wrong question for a "preview" |
| 2026-04-02 | P0 includes fixing publish template hardcoding | Preview is meaningless if publish ignores the template |
| 2026-04-02 | Session preview in-app navigation is P2 | Functional (sessions render), just awkward UX |
| 2026-04-02 | No inline editing on preview page | Settings already handles it; keep preview read-only |
| 2026-04-02 | Template Browser keeps mock data as fallback | New users need to see something; real data is P1 enhancement |
