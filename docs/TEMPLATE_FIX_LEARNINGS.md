# Template Fix Shared Learnings

Accumulated knowledge from fixing project/session liquid templates to match their HTML mockups.

## Template Status

| Template   | Status | Notes |
|------------|--------|-------|
| aurora     | TODO   | |
| bauhaus    | TODO   | |
| blueprint  | DONE   | Light template. Hero padding/font-size drift, missing decisions section, source bar, agent bar chart, 480px breakpoint, visited links |
| canvas     | TODO   | |
| carbon     | TODO   | |
| chalk      | TODO   | |
| circuit    | TODO   | |
| cosmos     | TODO   | |
| daylight   | TODO   | Has float division bug in source breakdown |
| ember      | TODO   | |
| glacier    | TODO   | |
| grid       | TODO   | |
| kinetic    | DONE   | Dark template. Title alignment, session card bg, visited links, percentage rounding, chart accent |
| meridian   | TODO   | |
| mono       | TODO   | |
| neon       | TODO   | |
| noir       | DONE   | Dark template. Breadcrumb element, missing sections, CSS gaps, responsive gaps, removed JS charts (mockup uses CSS-only bars), visited links |
| obsidian   | TODO   | Has float division bug in source breakdown |
| paper      | TODO   | |
| parallax   | TODO   | |
| parchment  | TODO   | |
| radar      | DONE   | Dark template. Breadcrumb nav fix, agent table+bar chart added, source percentages, visited links, wrapper bg/color |
| showcase   | TODO   | |
| signal     | TODO   | |
| strata     | DONE   | Light template. Removed JS charts (CSS-only SVGs), nav element fix, agent chart added, session title size, percentage rounding, visited links |
| verdant    | TODO   | |
| zen        | TODO   | |

**Also fixed (cross-cutting):**
- GrowthChart: dark mode colors, accent color for lines/dots/gradients
- WorkTimeline: dark mode colors, accent color passthrough
- ProjectDetail.tsx: removed white bg hack, added dark container bg
- SessionDetailOverlay.tsx: dark bg support via `isDark` prop

## General Process
1. Diff mockup HTML structure against liquid template structure
2. Diff mockup inline CSS against styles.css
3. Fix liquid HTML to match mockup structure (sections, classes, ordering)
4. Fix styles.css to match mockup CSS (missing rules, wrong values, missing responsive)
5. Preserve Liquid template variables/conditionals — don't hardcode mock data

## Critical Checks for ALL Templates
- **Check if mockup has JS charts**: Some mockups use CSS-only visualizations (horizontal bars, static SVGs) instead of `data-work-timeline`/`data-growth-chart` JS components. If the mockup doesn't have them, remove them from the liquid template. Don't add charts the mockup doesn't show.
- **Visited links**: Add `a:visited { color: inherit }` or explicit visited color to prevent browser-default blue
- Check Liquid `divided_by` produces floats — add `| round` on displayed percentages

## Critical Checks for Dark Templates
- Outer wrapper class (`.kinetic`, `.noir`, etc.) MUST have explicit `background: var(--bg); color: var(--text);` — background doesn't inherit
- Add `a { color: inherit; text-decoration: none; } a:visited { color: inherit; }` on the wrapper
- Any card/container with `border-radius` + `overflow: hidden` needs explicit `background`

## Learnings

### Noir
- **Breadcrumb element mismatch**: Both project.liquid and session.liquid used `<div>` for the breadcrumb, but the mockup uses `<nav>` (semantic HTML). Always check element types, not just classes.
- **Missing entire sections**: The session template was missing the agent bar chart (`noir-agent-bars`/`noir-agent-bar-row`) visual, and the project template was missing the Key Decisions section (`noir-decisions`) and the source bar chart (`noir-source-bar-large`). Check mockup sections against liquid sections one by one.
- **CSS property gaps on existing rules**: The `noir-screenshot__chrome` was missing `gap: 6px` and `z-index: 1` -- properties that existed in the mockup but were silently dropped when converting. Also `noir-chips` gap was `0.375rem` instead of `0.5rem`, and `noir-source-breakdown` gap was `1.25rem` instead of `1rem`.
- **Missing CSS classes entirely**: Several class families from the mockups had no corresponding rules in styles.css: `noir-agent-bars`/`noir-agent-bar-row*` (5 classes), `noir-decision*` (4 classes), `noir-phase__dates`, `noir-screenshot__gradient`, `noir-screenshot__label`. When converting mockup CSS, check that every class used in HTML has a rule in styles.css.
- **Responsive and a11y gaps**: The `noir-agent-bar-row` responsive breakpoint at 768px and the `noir-agent-bar-row__fill` reduced-motion rule were missing. Always verify `@media` queries cover all interactive/animated elements.

### Noir (additional fixes)
- **JS charts don't belong in every template**: The noir mockup has NO `data-work-timeline` or `data-growth-chart` — its "timeline" is CSS-only session rows with proportional bar widths (`noir-session-timeline`). The JS chart sections were incorrectly added to the liquid template and had to be removed. Always check what the mockup actually shows before assuming JS charts are needed.
- **Visited link color on dark templates**: Even though noir already had `a { color: var(--noir-text) }`, it was missing `a:visited`. Browser default purple/blue visited links are unreadable on dark backgrounds.

### Kinetic
- **CSS property values silently drifted**: `narrative-card` padding was `1rem 1.25rem` instead of mockup's `1.25rem 1.5rem`, `split-panel` padding was `3rem` instead of `2.5rem`, `split-panel h3` margin-bottom was `0.375rem` instead of `1.5rem`. Every property value must be compared, not just rule existence.
- **Body styles incomplete**: `body` rule was missing `-webkit-font-smoothing: antialiased`, `overflow-x: hidden`, and `line-height: 1.6` from the mockup. Base styles tend to get truncated during extraction.
- **Session vs project section-title size mismatch**: Session mockup uses `clamp(1.5rem, 3vw, 2rem)` for section-title while project uses `clamp(2rem, 4vw, 3rem)`. Added `.content-layout .section-title` override to scope the smaller size to session pages without affecting project sections.
- **Class name drift between mockup and template**: Mockup used `session-title` but template had `session-card-title`. When the template wraps session cards differently (e.g., `<a>` wrapper vs `<article>` with inner `<a>`), class names can diverge. Always check that CSS class names match between mockup and template.
- **Missing structural CSS rules**: `focus-visible`, `footer`, and `session-title a:hover` rules were absent from styles.css. Hero variant `hero--session` was missing `min-height: auto` override to cancel the portfolio hero's `min-height: 80vh`.

### Kinetic (additional fixes)
- **`background-color` does NOT inherit**: When `body { background: var(--bg) }` is scoped to `#liquid-render` via `@scope`, child elements remain `transparent`. Dark templates MUST set `background` explicitly on their outer wrapper class (`.kinetic`, `.noir`, etc.) — every dark template needs this.
- **Session cards need explicit background**: Cards with `border-radius` + `overflow: hidden` show white seams if their background is transparent. Always set `background: var(--surface)` on card wrappers in dark templates.
- **Visited link color**: Browser default `:visited` turns links blue. Dark templates need `a:visited { color: inherit }` on the template wrapper to prevent this.
- **Hero content centering**: `hero-content` had `max-width: 900px; margin: 0 auto` (centering the title) but mockup just has `position: relative; z-index: 1` — title should be left-aligned.
- **Source breakdown float division**: Liquid `divided_by` produces floats, causing `98.7012987%`. Use `| round` on display values. Same bug exists in obsidian and daylight templates.
- **Growth chart accent color**: `GrowthChart` computed `colors.accent` but still used hardcoded `GREEN` for lines/dots/gradients. Replace all `GREEN` references with `colors.accent` so the chart uses the template's accent color.
- **App shell dark background**: `ProjectDetail.tsx` wrapper and `SessionDetailOverlay` need dark backgrounds when `templateMode === 'dark'` — otherwise the app shell's white bleeds through.

### Chart Dark Mode
- **Props accepted but unused**: Both `GrowthChart` and `WorkTimeline` had `isDark` and `accentColor` in their interface but the GrowthChart destructuring dropped them entirely. WorkTimeline partially used them but missed layout-level colors and button/gradient backgrounds.
- **Color map pattern**: The cleanest approach is computing a `colors` object at the top of the component based on `isDark`, then referencing `colors.xxx` throughout. This keeps the theme logic in one place rather than scattered across 20+ inline style objects.
- **Layout functions need color injection**: `layoutSegments` bakes colors into node/track data structures at compute time (inside `useMemo`). Module-level constants won't react to prop changes -- the color must be passed as a parameter and included in the memo dependency array.
- **Don't force backgrounds on chart containers**: The original hack set `background: #ffffff` on dark-template chart wrappers from ProjectDetail. This breaks the template's visual continuity. Instead, make charts render with theme-appropriate colors natively so the template's own container styling works.
- **Safe colors for both modes**: GREEN (#16a34a) and RED (#dc2626) work on both light and dark backgrounds without modification. Agent role colors (AGENT_COLORS map) are also bright enough for dark backgrounds. Only text, grid, thread, and primary/accent colors need dark-mode variants.

### Blueprint
- **Hero padding and font-size silently drifted**: Hero padding was `64px 0 48px` instead of mockup's `32px 0 40px`, and h1 font-size was `clamp(28px, 5vw, 40px)` instead of `clamp(26px, 4.5vw, 36px)`. Every value must be compared, not just rule existence.
- **Stat cell values cascaded wrong**: Base `bp-stat-cell` had `padding: 20px 16px` and `font-size: 11px` for labels, but mockup uses `14px 12px` padding and `10px` labels. The project grid override was masking the base mismatch.
- **Missing entire sections from mockup**: Key Decisions (`decisions-section`) and source bar (`source-bar-large`) were absent from both liquid and CSS. Agent bar chart (`agent-bar-chart`) was missing from session template. Always cross-check every mockup section against the liquid template.
- **Growth chart removed**: The mockup has no `data-growth-chart` section -- it only has a CSS-only timeline table. Removed the JS chart mount. Same pattern as noir: check what the mockup actually renders before assuming JS charts are needed.
- **Responsive breakpoints incomplete**: Mockup had a 480px breakpoint for stats-grid (`repeat(2, 1fr)`) and 768px rules for timeline table and agent bar labels that were missing from styles.css.
- **Work Timeline was JS mount, not Liquid table**: The `data-work-timeline` div relied on client-side JS, but the mockup renders a static HTML `<table>` with crosshatch SVG bars. Replaced with Liquid loop over `featuredSessions`, computing `maxLoc` for bar width percentages. Also fixed source legend to show percentages (e.g. "62.5% (5 sessions)") instead of just session counts.

### Strata
- **JS charts removed**: Like noir and blueprint, the strata mockup uses CSS-only SVGs for Work Timeline and Growth Chart -- not `data-work-timeline`/`data-growth-chart` JS components. Removed both JS chart mounts from project.liquid.
- **Links element mismatch**: Project links used `<div class="strata-links">` but mockup uses `<nav>` (semantic HTML for a list of links). Always check element types.
- **Missing agent chart in session**: Session mockup has a `strata-agent-chart` with horizontal stacked bars below the agent table. The liquid template had no equivalent. Added CSS-only bar chart with dynamic widths from Liquid data.
- **Session title font-size drift**: Session mockup has `font-size: 2rem` with `animation-delay: 100ms` on `.strata-title`, but the shared class was `2.25rem`. Added `.strata-session .strata-title` override. Same pattern for responsive: project uses `1.75rem` at 767px, session uses `1.5rem`.
- **Percentage rounding**: Source breakdown and tool bar percentages needed `| times: 100.0 | divided_by: X | round` to avoid float display issues. Same pattern as other templates.

### Radar
- **JS chart mounts REPLACED with Liquid SVGs**: The `data-work-timeline` and `data-growth-chart` JS mounts have been replaced with Liquid-rendered inline SVGs that match the mockup's visual style. The Work Timeline uses bars (height = duration, width = LOC) with `wt-bar` animation class. The Growth Chart builds polyline points strings in Liquid loops, with area fill paths constructed at runtime via a small script that reads the polyline `points` attribute. Both charts auto-scale Y-axis based on data. Animation uses IntersectionObserver to add `is-animated` classes. Condition changed from `sessionsJson`/`growthJson` to `featuredSessions.size > 0`.
- **Breadcrumb element mismatch**: Both templates used `<div>` but mockup uses `<nav>` for breadcrumbs. Same pattern as noir and strata.
- **Missing agent table + bar chart in session**: Session mockup has a two-column agent layout with `agent-table` (role dots, duration, LOC) on the left and `agent-bar-chart` (horizontal bars) on the right. The liquid template only had a plain narrative. Added full agent section with Liquid data loops.
- **Source breakdown missing percentages**: Mockup shows `"5 (62.5%)"` format but liquid had just `{{ src.count }}`. Added `| times: 100.0 | divided_by: project.totalSessions | round` for percentage display.
- **Dark template wrapper**: Added `background-color`, `background-image` (grid pattern), `color`, `line-height`, `-webkit-font-smoothing` on `.radar` wrapper. Also added `a:visited` rules on wrapper, breadcrumb, links, and session cards to prevent browser-default blue.
