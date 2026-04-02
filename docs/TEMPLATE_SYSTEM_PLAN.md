# Template System Implementation Plan

Branch: `feature/template-system`

---

## Phase 1: Replace React project page with Liquid-rendered editorial template ✅

**Status: COMPLETE** — Commit `de3b0b3`

**What was built:**
- `GET /api/projects/:project/render` JSON endpoint returns `{ html, css, template, screenshotUrl }`
- `fetchProjectRender()` frontend API function in `api.ts`
- `ProjectDetail.tsx` injects Liquid HTML into `#liquid-render` container with CSS scoping
- Chart hydration: WorkTimeline and GrowthChart React components mount into Liquid placeholders
- Source breakdown uses `allSessions` (all sessions) not just featured sessions
- In-memory render cache with 30s TTL for fast reloads

---

## Phase 2: Template picker in Settings with preview ✅

**Status: COMPLETE** — Commits `3022301`, `9c1b52b`

**What was built:**
- 30 templates registered in `templates.ts` with metadata (name, label, accent, mode, tags)
- `TemplateBrowser.tsx` — category filtering (all, minimal, animated, data-dense), sorting, live iframe previews
- `Settings.tsx` — template picker card with scaled-down iframe preview of selected template
- `GET/POST /api/settings/theme` endpoints persist `defaultTemplate` to `~/.config/heyiam/settings.json`
- 27 template mockup HTML files in `docs/mockups/` for preview

---

## Phase 3: Template changes update the project detail page ✅

**Status: COMPLETE** — Included in Phase 1/2 commits

**What was built:**
- Render endpoint reads `?template=` query param, falls back to `getDefaultTemplate()`
- `ProjectDetail.tsx` fetches render with current template, re-renders on template change
- Per-template CSS loaded via `getTemplateCss()` (base + template-specific styles)
- Graceful fallback to 'editorial' if selected template fails to render

---

## Phase 3A: Convert all template mockups to Liquid templates ✅

**Status: COMPLETE** — Commits `56bbac4`, `dafad22`, `66d3dd7`, `0648161`, `55ee316`

**What was built:**
- All 30 templates have `portfolio.liquid`, `project.liquid`, `session.liquid` files
- Each template is fully self-contained (no shared partials except editorial/terminal/minimal legacy)
- Template-specific `styles.css` for all 30 templates
- Mock data system (`mock-data.ts`) for previewing templates without real user data
- Preview fallback: `/preview/template/:name` tries static mockup first, falls back to Liquid + mock data
- Multi-agent data in mock sessions (children arrays with agent roles)
- Google Fonts + `heyiam-mount.js` included in standalone preview HTML
- All custom Liquid filters: formatDuration, formatLoc, formatTokens, formatDate, formatDateShort, localeNumber, stripProtocol, jsonAttr, durationColor

---

## Phase 4: Portfolio page rendering ✅

**Status: COMPLETE** — Commits `9c1b52b`, `66d3dd7`

**What was built:**
- Portfolio Liquid templates for all 30 templates
- Portfolio profile editor in `Settings.tsx` (bio, photo, location, email, phone, social links, resume)
- `GET/POST /api/portfolio` endpoints with validation
- `getPortfolioProfile()` / `savePortfolioProfile()` persistence in settings
- Portfolio preview: `/preview/template/:name?page=portfolio` renders with mock data
- Leverage display (You vs Agents time) with efficiency multiplier

---

## Phase 5: Showcase template (scroll animations) ✅

**Status: COMPLETE** — Commit `66d3dd7`

**What was built:**
- `showcase/project.liquid` with inline IntersectionObserver script
- Scroll-triggered `.visible` class on `.sc-section` elements (threshold: 0.15)
- Animated counters with `easeOutCubic` easing (1200ms duration, staggered starts)
- CSS stagger effects — child elements fade in with cascading 80ms delays
- Respects `prefers-reduced-motion` (skips animations if enabled)
- Self-contained: no external dependencies, works in exported HTML

---

## Phase 6: Wire through publish/export flow

**Status: NOT STARTED**

**Goal:** Publishing and exporting use the selected template. What you see in the CLI is what gets published.

**What needs to happen:**

1. **`export.ts`** — Pass `getDefaultTemplate()` to `renderProjectHtml()` and `renderSessionHtml()`
   - Currently renders with DEFAULT_TEMPLATE ('editorial') regardless of user selection
   - Need to import and call `getDefaultTemplate()`

2. **`routes/publish.ts`** — Pass template to render-preview endpoint
   - `/api/projects/:project/render-preview` currently calls `renderProjectHtml(renderData)` without template
   - Should read template from settings or query param

3. **Verify upload flow** — Ensure the published HTML on heyi.am uses the selected template
   - Server-side `share.ex` already validates template names
   - Need to confirm template name is included in upload payload

**Verification:**
- Export HTML files use selected template (not always editorial)
- Publish preview matches what's shown in project detail
- Published pages on heyi.am render with chosen template

---

## Process
- Branch: `feature/template-system`
- Code review agent runs at end of each phase
- `/clear` context between phases
- Each phase is a separate commit (or small commit sequence)
