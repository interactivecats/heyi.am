# Template System Implementation Plan

Branch: `feature/template-system`

---

## Phase 1: Replace React project page with Liquid-rendered editorial template

**Goal:** Project detail main content renders via Liquid instead of React components. Same data, same look. No template switching yet.

**Key Principle:** The render endpoint calls `buildProjectDetail(ctx.db, proj)` — the EXACT same function the React page uses. No separate data pipeline.

**Steps:**

1. **Add render endpoint** (`cli/src/routes/preview.ts`)
   - `GET /api/projects/:project/render`
   - Call `buildProjectDetail(ctx.db, proj)` to get `{ project, sessions, enhanceCache }`
   - Map sessions through `buildSessionCard()` to get `SessionCard[]`
   - Call `buildProjectRenderData()` then `renderProjectHtml(data, extras, 'editorial')`
   - Load `styles.css` once at startup (not per request)
   - In-memory cache keyed by `dirName + fingerprint` — cache hit <10ms
   - Return `{ html, css }`

2. **Add frontend API** (`cli/app/src/api.ts`)
   - `fetchProjectRender(dirName): Promise<{ html: string; css: string } | null>`

3. **Replace main content** (`cli/app/src/components/ProjectDetail.tsx`)
   - Fetch rendered HTML alongside existing project detail
   - Main content area: inject Liquid HTML into `#liquid-render` container
   - CSS isolation: `@layer template { #liquid-render { ...css... } }` — lower specificity than Tailwind
   - Remap `:root` and `body` selectors to `#liquid-render`
   - Strip universal reset (Tailwind preflight handles it)
   - Chart hydration: after innerHTML injection, query `[data-work-timeline]` and `[data-growth-chart]` elements, call `createRoot()` with WorkTimeline/GrowthChart components directly
   - Clean up chart roots before re-injection and on unmount
   - Sidebar stays React (editing controls unchanged)

4. **Source breakdown fix** (`cli/src/render/liquid.ts`)
   - Compute `sourceCounts` from `data.allSessions` (all sessions), not `data.sessions` (featured only)

**Code review criteria:** Same visual output as current React page. Charts render. Source breakdown shows all sessions. Page loads fast (<500ms cached).

---

## Phase 2: Template picker in Settings with preview

**Goal:** Ghost/WordPress-style template picker. Each template has a preview. Saves globally.

**Steps:**
1. Settings page: template cards with preview for each of 5 templates (Classic, Kinetic, Terminal, Typography, Showcase)
2. "Preview" button per template opens full-page rendered preview in new tab
3. `GET/POST /api/settings/theme` saves `defaultTemplate` to settings.json
4. Already partially built: Settings.tsx has theme picker card, settings.ts has `defaultTemplate` field

**Code review criteria:** Can select a template in settings. Selection persists across page reloads. Preview opens in new tab with correct template.

---

## Phase 3: Template changes update the project detail page

**Goal:** Changing template in Settings changes how the project detail page renders.

**Steps:**
1. Per-template CSS overrides in `styles.css` scoped under `[data-template="kinetic"]` etc.
2. Render endpoint reads `getSettings().defaultTemplate` and passes to `renderProjectHtml()`
3. Different Liquid templates produce different HTML structure (layouts already exist)
4. Project page picks up template change on navigation

**Code review criteria:** Switching between editorial/kinetic/terminal/minimal shows visually distinct pages. CSS doesn't leak. Charts work in all templates.

---

## Phase 4: Portfolio page rendering

**Goal:** CLI renders the portfolio page (heyi.am/@username) using Liquid. Template applies consistently across portfolio + project + session pages.

**Steps:**
1. Portfolio Liquid template (new)
2. Portfolio render endpoint
3. Portfolio editing in CLI (bio, project ordering, display name)
4. Template applies to portfolio page too

**Code review criteria:** Portfolio page renders with chosen template. Editing bio/ordering works.

---

## Phase 5: Showcase template (scroll animations)

**Goal:** Fifth template with IntersectionObserver entrance animations.

**Steps:**
1. `showcase/project.liquid` and `showcase/session.liquid`
2. CSS animations triggered by `.visible` class added via IntersectionObserver
3. Inline `<script>` in the template for the observer (no external dependencies)

**Code review criteria:** Sections fade/slide in on scroll. Works in exported HTML too.

---

## Phase 6: Wire through publish/export flow

**Goal:** Publishing uses the selected template. What you see in the CLI is what gets published.

**Steps:**
1. `publish.ts` reads `getSettings().defaultTemplate`, passes to render functions
2. `export.ts` does the same for HTML export
3. Server-side `share.ex` already validates template names

**Code review criteria:** Published pages on heyi.am use the chosen template. Exported HTML uses it too.

---

## Process
- Branch: `feature/template-system`
- Code review agent runs at end of each phase
- `/clear` context between phases
- Each phase is a separate commit (or small commit sequence)
