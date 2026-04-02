# Template Fix Shared Learnings

Accumulated knowledge from fixing project/session liquid templates to match their HTML mockups.

## Template Status

| Template   | Status | Notes |
|------------|--------|-------|
| aurora     | DONE   | Dark template. JS charts replaced with CSS-only bars, growth chart removed, session card article structure, phase dates, source percentage rounding, wrapper bg/color/visited, agent color tokens, stat size drift for project page, chart responsive breakpoints |
| bauhaus    | TODO   | |
| blueprint  | DONE   | Light template. Hero padding/font-size drift, missing decisions section, source bar, agent bar chart, 480px breakpoint, visited links |
| canvas     | DONE   | Light template. Breadcrumb nav element, JS charts replaced with CSS-only SVG bars, growth chart removed, phase dates, source bar-large + percentages with rounding, visited links, agent color tokens, stat__number size drift (session vs project), section-title margin drift (session), skill-pill--lg for project page, skip-link/nav/footer/source-bar/activity/recent-sessions CSS, responsive nav + portfolio sections, reduced-motion for agent bars |
| carbon     | DONE   | Dark template. Breadcrumb nav fix, JS charts replaced with CSS-only SVG polyline, growth chart removed, phase dates added, source breakdown bar + percentages + dots, portfolio card structure (article with inner a), source bar/legend per card, visited links, wrapper bg/color, project stats 6-column + size overrides, section heading size scoped to project/session, screenshot__url CSS, card__title a styles, reduced-motion for sidebar-card, responsive stats breakpoints |
| chalk      | DONE   | Light template. JS charts replaced with CSS-only SVG bars, growth chart removed, breadcrumb nav element, portfolio card article structure, phase dates, source percentage rounding, visited links, project-name a styles, section-heading size scoping (project/session), hero h1 size scoping (portfolio/project), screenshot height, session sidebar skill-chip/chalk-card size overrides, timeline-chart svg rule, source-bar/legend/dot classes for portfolio, agents column in sessions table, responsive footer/nav, phase-dates CSS |
| circuit    | DONE   | Dark template. JS charts replaced with Liquid session table, growth chart removed, featured cards article structure, phase dates, source percentage rounding, stat chip size scoping (portfolio/project/session), hero h1 size scoping, visited links, screenshot ::before/text, session-table/agent-dots CSS, portfolio source-overview/skill-ic/trace-svg-connector CSS, footer/skip-link/counter CSS, responsive scoping per page type |
| cosmos     | DONE   | Dark template. Breadcrumb nav fix, JS charts replaced with CSS-only SVG bars, growth chart removed, source percentage rounding, session card structure, visited links, wrapper bg/color, orbital timeline CSS, chart SVG CSS, phase-dates, sidebar chip override |
| daylight   | DONE   | Light template. Breadcrumb nav element fix, JS charts replaced with CSS-only bar chart, growth chart removed, session card article structure + agent dots, phase dates, source percentage rounding (times 100.0 + round), visited links, project stat card size overrides (padding/number/label), skip-link/nav/screenshot-bar/chart-bar/chart-legend/phase-dates/project-source/source-bar/agent-dot/activity/all-skills/source-overview CSS added, portfolio source bar per card + all skills section + source overview section, reduced-motion for hover transforms |
| ember      | DONE   | Dark template. JS charts replaced with CSS-only bar chart, growth chart removed, phase dates added, source percentage rounding, visited links (wrapper/breadcrumb/contact/cards/footer/project-links), section-header size scoping (portfolio/project/session), stats-grid 6-column + project stat cell size overrides, skill-chip project size override, screenshot-body CSS, chart-bar CSS classes, portfolio source-bar/legend per card, responsive chart-bars/nav-links, reduced-motion for chart-bar |
| glacier    | DONE   | Light template. Breadcrumb nav fix, JS charts replaced with CSS-only SVG bars, growth chart removed, sessions table added, phase dates, source percentage rounding, portfolio card article structure with source bar/legend, project stat/section-heading/skill-chip size overrides, visited links, featured-name hover/focus, screenshot chrome CSS, agent dots/session-source-badge, sessions-table responsive, reduced-motion for sessions-table |
| grid       | DONE   | Light template. JS charts replaced with static timeline table, growth chart removed, source percentage rounding (times 100.0 + round), visited links, phase dates, session-agents + agent-dots on project session cards, stat size overrides (project 110px/28px, session 100px/28px), session title size override (26px/1.3), session skills span-1, missing CSS classes: skip-link, nav, footer, project-source-bar, cell-all-skills, heatmap, cell-recent, timeline-chart/row/header/num/title/date/duration/loc, session-agents/agent-dot, browser-viewport-label, phase-dates, beat-line last-child hide, a.session-card clickable styles, responsive timeline-row/recent-row/nav-links |
| kinetic    | DONE   | Dark template. Title alignment, session card bg, visited links, percentage rounding, chart accent |
| meridian   | DONE   | Dark template. Breadcrumb nav fix, JS charts replaced with CSS-only SVG elevation chart, growth chart removed, missing Key Decisions section + agent bar chart + agent-dots, source percentages with rounding, visited links, wrapper bg/color + agent color tokens, stat-cell font-size drift, section-heading size drift, skill-chip size drift, featured cards article structure, responsive agent-bar-row, reduced-motion for agent bars |
| mono       | DONE   | Dark template. Breadcrumb nav fix, JS charts replaced with CSS-only ASCII bar chart, growth chart removed, session cards article structure, source bar class fix + percentage rounding, phase dates added, wrapper bg/color/visited links, ascii-label width drift (110->80px), ascii-bar-value font-size drift, project section margin override (3rem), responsive ascii-label fix (60px) |
| neon       | TODO   | |
| noir       | DONE   | Dark template. Breadcrumb element, missing sections, CSS gaps, responsive gaps, removed JS charts (mockup uses CSS-only bars), visited links |
| obsidian   | TODO   | Has float division bug in source breakdown |
| paper      | TODO   | |
| parallax   | DONE   | Dark template. JS charts replaced with CSS-only timeline bars + SVG growth chart, missing Key Decisions section, source ring SVG + percentages, phase dates, tool usage chart sidebar card, wrapper bg/color, visited links, section padding/margin drift, reveal animation values |
| parchment  | TODO   | |
| radar      | DONE   | Dark template. Breadcrumb nav fix, agent table+bar chart added, source percentages, visited links, wrapper bg/color |
| showcase   | DONE   | Dark template. Visited links, percentage rounding, SVG width override removed, leverage bar color drift, screenshot ::before pseudo, phase-dates CSS |
| signal     | TODO   | |
| strata     | DONE   | Light template. Removed JS charts (CSS-only SVGs), nav element fix, agent chart added, session title size, percentage rounding, visited links |
| verdant    | TODO   | |
| zen        | DONE   | Light template. JS charts replaced with CSS-only bars, growth chart removed, breadcrumb nav element fix, beat number zero-padding, source percentages with rounding, phase dates, visited links, missing chart/nav/footer-nav/skip-link/screenshot-body CSS, stats line-height drift, subheading margin drift, print styles |

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

### Showcase
- **Template already well-structured**: Unlike other templates, showcase's liquid templates closely matched their mockups structurally. The main issues were CSS property value drift and missing small rules rather than missing sections.
- **SVG `width: 100%` on chart containers**: The `sc-chart-container svg { width: 100%; }` override prevents horizontal scrolling on chart SVGs. Removed `width: 100%` to just `display: block`. This is a recurring issue across templates.
- **Leverage bar color drift**: `.sc-leverage__human` background was `rgba(255,255,255,0.25)` instead of mockup's `rgba(255,255,255,0.35)`. Small opacity differences are easy to miss.
- **Missing `::before` pseudo-element**: `.sc-screenshot-body::before` with radial gradients was in the mockup but missing from styles.css. Pseudo-elements are easy to drop during extraction.
- **Percentage rounding in both templates**: Source breakdown `divided_by` in project.liquid and agent bar `divided_by` in session.liquid both needed `| times: 100.0` (float) and `| round`.
- **Missing `--red`/`--red-dim` tokens**: The mockup had these in `:root` but they were dropped from the `.showcase` token block. Always cross-check the full token list.

### Cosmos
- **JS charts replaced with CSS-only SVG**: The project mockup has a static SVG bar chart for Work Timeline, not `data-work-timeline` JS mount. Built with Liquid loop computing `maxLoc` and scaling bar heights proportionally. The mockup has NO growth chart at all -- removed `data-growth-chart` entirely.
- **Session card structure mismatch**: Template wrapped each session card in `<a class="session-card"><article>`, but mockup uses `<article>` with inner `<a>` on the h3 only. The wrapper `<a>` approach changes hover semantics and can break keyboard navigation.
- **Missing CSS class families from mockup**: Orbital timeline (`cos-orbit-*` -- 7 classes), chart SVG (`cos-chart-*` -- 5 classes), screenshot body/placeholder, phase-dates, and sidebar skill chip size override were all missing from styles.css. The orbital timeline is decorative and only appears in the mockup with hardcoded data, but the CSS must exist for when it's used.
- **Agent role color tokens missing**: The mockup `:root` had `--color-frontend`, `--color-backend`, etc. but they were dropped during extraction to styles.css. Agent dots use these via `style="background: var(--color-backend)"` in session template.
- **Dark wrapper pattern confirmed again**: Like kinetic, noir, and radar -- the `.cosmos` wrapper needs explicit `background`, `color`, `font-family`, and `a:visited` rules since `body` styles are scoped to `#liquid-render` via `@scope` and don't inherit into the template wrapper.

### Parallax
- **JS charts replaced with CSS-only equivalents**: Both `data-work-timeline` (JS mount) and `data-growth-chart` (JS mount) replaced. Work Timeline uses CSS-only horizontal bars with `timeline-chart__row` grid layout, bar widths computed from `maxLoc` in Liquid. Growth Chart uses an inline SVG with `growth-line`/`growth-area`/`growth-dot` classes and a small script to build polyline points from Liquid-rendered `<circle>` data attributes.
- **Missing entire sections**: Key Decisions section (`decisions-list`) was absent from project.liquid. Source ring SVG (`source-ring`) was missing -- just had a flat legend. Tool Usage Chart sidebar card (`tool-chart`) was missing from session.liquid. Phase dates (`phase-item__dates`) were missing from the phase loop.
- **Source legend percentages**: Mockup shows "62.5% (5 sessions)" format but liquid had just count. Added `| times: 100.0 | divided_by: project.totalSessions | round` for percentage display.
- **CSS value drift pattern continues**: `.section` padding was `5rem 2rem` vs mockup's `4rem 2rem`, `.section__label` margin-bottom was `2.5rem` vs `1.5rem`, `.reveal` translateY was `24px` vs `30px` with `0.7s` vs `0.8s` duration. Every value must be compared.
- **Dark wrapper confirmed again**: `.parallax` wrapper needed explicit `background: var(--px-bg)`, `color: var(--px-text)`, `a:visited { color: inherit }`, and `-webkit-font-smoothing: antialiased`. Same pattern as kinetic, noir, radar, cosmos.

### Meridian
- **JS charts replaced with CSS-only SVG elevation chart**: The project mockup has a static SVG elevation profile (polyline + area fill + waypoint dots) for Work Timeline, not `data-work-timeline` JS mount. Built with Liquid loops computing `maxLoc` for Y-axis scaling and spacing points across the X-axis. Growth chart (`data-growth-chart`) removed entirely -- mockup has no growth section.
- **Missing sections from mockup**: Key Decisions section (`decisions-section` with counter-styled `decision-item` list) was missing from project.liquid. Agent bar chart (`agent-bars`/`agent-bar-row`) was missing from session.liquid below the agent table. Agent dots column in session table was not present in the liquid template (mockup had `agent-dots` column).
- **Featured card structure mismatch**: Template used `<a class="featured-card">` wrapper, but mockup uses `<article class="featured-card">` with inner `<a>` only on the `h3`. The `<a>` wrapper approach changes hover/focus semantics.
- **CSS property value drift across multiple rules**: `section-heading` font-size was `1.75rem` vs mockup's `1.5rem`, `stat-cell__value` was `1.625rem` vs `1.375rem`, `stat-cell__coord` margin was `0.375rem` vs `0.25rem`, `stat-cell__label` was `0.8125rem` vs `0.75rem`, `skill-chip` was `0.6875rem` vs `0.75rem` with different padding. Session-scoped overrides needed for `stat-cell__value` (`1.25rem`) and `stat-cell__label` (`0.6875rem`).
- **Agent color tokens missing**: Mockup `:root` had `--agent-frontend`, `--agent-backend`, etc. but they were dropped from `.meridian` token block. Agent dots and bar fills use these.
- **Dark wrapper pattern confirmed again**: `.meridian` needed explicit `background: var(--mer-bg)` and `a:visited { color: var(--mer-accent) }` plus breadcrumb/card-specific visited rules.

### Zen
- **Light template, minimal design**: Zen is a light template so no wrapper bg/color needed, but still needs `a:visited` to prevent browser default purple. Added `a:visited { color: var(--zen-text) }` globally.
- **JS charts replaced with CSS-only bars**: Project mockup uses CSS-only horizontal bars (`zen-chart-row` with `zen-chart-bar` spans) for Work Timeline, not `data-work-timeline` JS mount. Bar widths computed from `maxDuration` in Liquid. No growth chart at all in the mockup -- removed entirely.
- **Many CSS class families missing from styles.css**: Chart classes (`zen-chart`, `zen-chart-row`, `zen-chart-label`, `zen-chart-bar-track`, `zen-chart-bar`, `zen-chart-value`), navigation classes (`zen-nav`, `zen-nav-inner`, `zen-nav-sep`), `zen-footer-nav`, `zen-skip-link`, and `zen-screenshot-body` were all in the mockup CSS but absent from styles.css. These are structural layout classes, not just decorative.
- **Beat number zero-padding**: Mockup shows `01`, `02` for beat numbers. The Liquid template used `beat.stepNumber | at_least: 1 | prepend: ""` which doesn't zero-pad. Fixed with `{% if forloop.index < 10 %}0{% endif %}{{ forloop.index }}`.
- **CSS value drift in small places**: `.zen-stats` line-height was `2` vs mockup's `2.2`, `.zen-subheading` margin-block-end was `0.5rem` vs mockup's `1rem`. Print `.zen-display` font-size was `20pt` vs project mockup's `24pt`.

### Aurora
- **JS charts replaced with CSS-only bars**: Project mockup has a CSS-only Work Timeline (`aurora-chart-bars` with `aurora-chart-row` grid layout), not `data-work-timeline` JS mount. Bar widths computed from `maxDuration` in Liquid. No growth chart in the mockup at all -- removed `data-growth-chart` entirely.
- **Entire CSS class families missing**: `aurora-chart-bars`, `aurora-chart-row`, `aurora-chart-label`, `aurora-chart-bar-track`, `aurora-chart-bar-fill`, `aurora-chart-bar-fill--cursor`, `aurora-chart-bar-agents`, `aurora-chart-agent-dot`, `aurora-chart-value`, `aurora-phase-dates` -- 10 classes from the mockup had no rules in styles.css.
- **Dark wrapper confirmed again**: `.aurora` wrapper needed explicit `background: var(--aurora-bg)`, `color: var(--aurora-text)`, `font-family`, `-webkit-font-smoothing`, and `a:visited { color: var(--aurora-accent) }` plus breadcrumb/session-card/footer-specific visited rules.
- **Agent color tokens missing from `:root`**: Mockup defined `--agent-frontend`, `--agent-backend`, `--agent-qa`, `--agent-security`, `--agent-reviewer`, `--agent-ux` in `:root` but they were absent from styles.css.
- **Session card structure mismatch**: Template wrapped each card in `<a class="aurora-session-card">`, but mockup uses `<article class="aurora-session-card">` with inner `<a>` only on the h3. Same pattern as cosmos, meridian.
- **Stat size drift between portfolio and project pages**: Portfolio stats use larger values (`padding: 1.5rem`, `font-size: 2rem`, `border-radius-lg`), while project mockup uses smaller values (`padding: 1rem`, `font-size: 1.375rem`, `border-radius`). Added `.aurora-stats--project` scoped overrides.
- **Source percentage rounding**: `divided_by` without `| round` produces floats like `62.5012987%`. Added `| times: 100.0 | divided_by: X | round` on both bar width and display values.

### Mono
- **JS charts replaced with CSS-only ASCII bar chart**: The project mockup uses a text-based ASCII bar chart with `ascii-chart`/`ascii-row`/`ascii-bar-fill` classes (using block characters like `&#9619;`), not `data-work-timeline` JS mount. No growth chart in the mockup at all -- removed `data-growth-chart` entirely. Built with Liquid loop computing `maxLoc` for proportional fill counts.
- **Session card structure mismatch (again)**: Template wrapped each session card in `<a class="session-card">`, but mockup uses `<article class="session-card">` with inner `<a>` only on the h3. Same pattern as cosmos, meridian, aurora.
- **Source bar class name mismatch**: Template used `source-bar--project` but mockup uses just `source-bar`. Added a project-scoped height override `.mono.heyiam-project .source-bar { height: 8px; }` since portfolio bar is 6px.
- **CSS property value drift**: `ascii-label` width was `110px` in styles.css vs mockup's `80px`, `ascii-bar-value` font-size was `0.75rem` vs `0.6875rem`. Project `mono-section` margin-bottom was `2.5rem` vs mockup's `3rem` (session mockup uses `2.5rem` -- needed project-scoped override).
- **Missing phase dates**: Mockup shows `git-log-date` with date ranges (e.g., "Feb 3 -- Feb 14") below each phase entry. Template was missing `item.dates` rendering.
- **Dark wrapper pattern confirmed**: `.mono` needed explicit `background`, `color`, `font-family`, `line-height`, `-webkit-font-smoothing`, `a:visited`, and `a:focus-visible` rules. Also added specific visited rules on breadcrumb, session-card-title, project-name, and hero-contact links.
- **Responsive ascii-label drift**: Mockup 768px breakpoint has `width: 60px; font-size: 0.625rem` but styles.css had `80px`/`0.6875rem`.

### Canvas
- **Light template, well-structured mockups**: Canvas is a light template so no wrapper bg/color needed (inherits from body), but still needs `a:visited` to prevent browser default purple visited links. Added `a:visited { color: var(--canvas-accent-dark) }`.
- **JS charts replaced with CSS-only SVG bars**: Project mockup uses a static SVG bar chart for Work Timeline, not `data-work-timeline` JS mount. Built with Liquid loop computing `maxLoc` for proportional bar heights. No growth chart in the mockup at all -- removed `data-growth-chart` entirely.
- **Breadcrumb element mismatch**: Both project.liquid and session.liquid used `<div>` for the breadcrumb, but the mockup uses `<nav>` (semantic HTML). Same recurring pattern.
- **Many CSS class families missing from styles.css**: Navigation (`nav`, `nav__logo`, `nav__links`), skip-link, page-footer, source-bar (portfolio project cards), source-bar-large (project page), activity-chart, recent-sessions/session-row, skills-overview/skills-cloud, source-overview/source-donut, phase-card__dates, chart-container svg were all in the mockups but absent from styles.css.
- **Stat and section-title size drift between pages**: Session mockup has `stat__number` at `clamp(1.5rem, 3vw, 2.25rem)` and `section-title` `margin-block-end: 2rem`. Project mockup has `stat__number` at `clamp(1.75rem, 4vw, 2.75rem)` and section-title at `2.5rem`. Used page-scoped overrides via `.canvas.heyiam-project` and `.canvas.heyiam-session` selectors.
- **Skill pill size differs on project page**: Portfolio project cards use base `skill-pill` (0.6875rem), but the project page skills section uses `skill-pill--lg` (0.8125rem). Template was missing the `--lg` modifier class.
- **Agent color tokens missing**: Mockup `:root` had `--agent-frontend` through `--agent-ux` but they were absent from the `.canvas` token block.
- **Source breakdown missing bar and percentages**: Project mockup has a `source-bar-large` visual bar above the legend, with "Claude Code 62.5%" format. Added bar element and `| times: 100.0 | divided_by: X | round` for percentage display.

### Carbon
- **JS charts replaced with CSS-only SVG polyline**: Project mockup uses a static SVG with polyline + circles for Work Timeline, not `data-work-timeline` JS mount. No growth chart in the mockup at all -- removed `data-growth-chart` entirely. Built with Liquid loops computing `maxDur` for Y-axis scaling and spacing points across X-axis.
- **Breadcrumb element mismatch**: Both project.liquid and session.liquid used `<div>` for the breadcrumb, but the mockup uses `<nav>` (semantic HTML). Same pattern as noir, strata, radar, cosmos.
- **Portfolio card structure mismatch**: Template wrapped each project card in `<a class="project-card"><article>`, but mockup uses `<article class="card">` with inner `<a>` only on the h3 title. Same pattern as cosmos, meridian, aurora, mono.
- **Missing source bar + legend per portfolio card**: Mockup shows a thin `source-bar` (4px) and `source-legend` with dots + percentages below each project card's stats. Template was completely missing these elements.
- **Missing source-bar-lg in project page**: Source breakdown had labels but no bar visual. Mockup shows an 8px bar (`source-bar-lg`) with colored segments above the labels, plus dot indicators (`source-labels__dot`) before each label. Also needed percentage display in the label format "Claude Code 62.5% (5 sessions)".
- **Stats bar column count differs between portfolio and project**: Portfolio uses `repeat(4, 1fr)` grid but project uses `repeat(6, 1fr)` with smaller stat cells (`padding: 1rem 0.75rem`, `font-size: 1.375rem` value, `0.625rem` label). Added `.stats-bar--project` modifier class and `.heyiam-project` scoped overrides.
- **Section heading font-size scoped by page type**: Portfolio mockup uses `1.25rem`, but project and session mockups use `1.125rem`. Added `.carbon.heyiam-project .section-heading` and `.carbon.heyiam-session .section-heading` overrides.
- **Phase dates missing**: Mockup shows `phase-item__dates` (e.g., "Feb 3 -- 14") below each phase title. Template had no `item.dates` rendering. Same pattern as mono, aurora, zen.
- **Dark wrapper a:visited**: `.carbon` wrapper already had explicit `background`, `color`, `font-family`, `-webkit-font-smoothing` on the class definition, but was missing `a:visited` rules. Added visited rules on wrapper, breadcrumb, card__title, session-row, and footer links.
- **Section order drift**: Template had Narrative before Stats Bar, but mockup has Stats Bar before Narrative. Also Skills and Source Breakdown were swapped vs mockup order (mockup: Skills then Source Breakdown).

### Chalk
- **Light template with hand-drawn aesthetic**: Chalk is a light template so no wrapper bg/color needed, but still needs `a:visited { color: inherit }` to prevent browser default purple visited links. Added global rule.
- **JS charts replaced with CSS-only SVG bar chart**: Project mockup uses a static inline SVG with `<rect>` bars (hand-drawn `stroke-dasharray`) for Work Timeline, not `data-work-timeline` JS mount. No growth chart in the mockup at all -- removed `data-growth-chart` entirely. Bar colors vary by source tool (Claude = `#334155`, Cursor = `#94a3b8`). Chart width computed dynamically from session count.
- **Breadcrumb element mismatch (again)**: Session template used `<div>` for breadcrumb but mockup uses `<nav>`. Same recurring pattern across all templates.
- **Portfolio card structure mismatch**: Template wrapped each project card in `<a class="chalk-card project-card">`, but mockup uses `<article class="chalk-card">` with inner `<a>` only on the project-name h3. Same pattern as cosmos, meridian, aurora, mono, carbon.
- **Hero h1 font-size varies by page type**: Portfolio mockup uses `clamp(40px, 7vw, 64px)`, project uses `clamp(36px, 6vw, 56px)`, session uses base `clamp(32px, 5vw, 48px)`. Added `.heyiam-portfolio .hero h1` and `.heyiam-project .hero h1` overrides.
- **Section heading size scoped by page type**: Portfolio uses `font-size: 32px; margin-bottom: 24px`, project uses `32px/20px`, session uses `28px/16px`. Added `.heyiam-project .section-heading` and `.heyiam-session .section-heading` overrides.
- **Missing project-name link styles**: Portfolio mockup styles `project-name a` (inherit color, no underline), `a:hover` (wavy underline), and `a:focus-visible` (outline). These were absent from styles.css since the old template used `<a>` wrappers instead.
- **Session sidebar uses smaller values**: Session mockup skill chips are `11px/3px 10px` vs portfolio/project `12px/4px 12px`. Chalk-card sidebar cards are `20px` padding vs portfolio's `28px`. Added scoped overrides.
- **Phase dates missing**: Project mockup shows `phase-dates` with date ranges below each phase name. Template was missing `item.dates` rendering. Same pattern as all other templates.
- **Source percentage rounding**: `divided_by` without `| round` produces floats. Added `| times: 100.0 | divided_by: X | round` on both bar width and display values.
- **Sessions table agents column**: Project mockup has an "Agents" column showing sub-session count per session. Template was missing this column.

### Circuit
- **JS charts replaced with Liquid session table**: The project mockup has NO `data-work-timeline` or `data-growth-chart`. Instead it renders a static HTML `<table class="session-table">` with columns for #, Title, Date, Duration, LOC, Source, and Agents (shown as colored dots). Built with Liquid loop over `featuredSessions`. No growth chart at all in the mockup.
- **Three different stat chip sizes per page type**: Portfolio, project, and session mockups each use different stat chip sizes -- portfolio is largest (`min-width: 140px`, `padding: 16px 24px`, value `28px`, label `11px`), project is medium (`min-width: 100px`, `padding: 12px 20px`, value `20px`, label `10px`), session is smallest (`min-width: 80px`, `padding: 10px 16px`, value `18px`, label `10px`). Even the `::before` notch and `::after` dot dimensions differ per page type. Used `.circuit.heyiam-project` and `.circuit.heyiam-session` scoped overrides.
- **Hero h1 font-size differs per page type**: Portfolio uses `clamp(32px, 5vw, 48px)`, project uses `clamp(28px, 5vw, 40px)`, session uses `clamp(24px, 4vw, 36px)`. The session h1 also has `max-width: 640px` and `line-height: 1.2` while portfolio uses `1.15`.
- **Portfolio-specific section-header and trace-connector**: Portfolio mockup uses `font-size: 22px` for `.section-header` and `height: 40px` for `.trace-connector`, while project/session use `20px` and `32px` respectively.
- **Many portfolio-only CSS class families**: Source overview (`source-overview`, `source-overview-row`, etc.), aggregate skills (`all-skills-section`, `skill-ic`, etc.), trace SVG connector (`trace-svg-connector`), counter animation, footer, skip-link. All were in mockup CSS but not in styles.css.
- **Featured card article pattern confirmed**: Same as cosmos, meridian, aurora, mono -- mockup uses `<article class="featured-card">` with inner `<a>` on h4, not `<a class="featured-card">` wrapper.
- **Dark wrapper already mostly correct**: Circuit's `.circuit` wrapper already had `background-color`, `background-image`, `color`, `font-family`, `-webkit-font-smoothing`. Just needed `a { color: inherit; text-decoration: none; }` and `a:visited { color: inherit; }` added.

### Ember
- **JS charts replaced with CSS-only bar chart**: Project mockup uses a CSS-only bar chart (`chart-bars`/`chart-bar-group`/`chart-bar`) for Work Timeline, not `data-work-timeline` JS mount. No growth chart in the mockup at all -- removed `data-growth-chart` entirely. Built with Liquid loop computing `maxDur` and scaling bar heights proportionally. Condition changed from `sessionsJson`/`growthJson` to `featuredSessions.size > 0`.
- **Section-header size varies by page type**: Portfolio mockup uses `1.25rem`/`margin-bottom: 1.5rem`, project uses `1.125rem`/`1.25rem`, session uses `1.0625rem`/`1rem`. Added `.heyiam-project .section-header` and `.heyiam-session .section-header` overrides.
- **Stats grid 6-column for project**: Project mockup uses `repeat(6, 1fr)` with smaller cells (`padding: 1rem 0.75rem`, `font-size: clamp(1rem, 2.5vw, 1.35rem)`, label `10px`). Portfolio uses default 4-column with larger cells.
- **Visited link rules needed everywhere**: Dark template means every link type needs explicit visited color. Added rules on wrapper, breadcrumb, hero-contact, session-card, project-card, project-links, and footer links.
- **Missing CSS class families**: `chart-bars`/`chart-bar-group`/`chart-bar`/`chart-bar-label`/`chart-bar-value` (5 classes for work timeline), `screenshot-body`, `phase-dates`, `source-bar`/`source-legend` on project cards were all in mockup but absent from styles.css.
- **Project `ember-section` margin differs**: Project mockup uses `margin-bottom: 2.5rem` vs session/portfolio's `2rem`. Added `.heyiam-project .ember-section` override.
- **Portfolio source bar per card**: Mockup shows 4px `source-bar` + `source-legend` with per-tool percentages inside each project card. Template was missing these entirely.
- **Skill chip size on project page**: Project skills section uses `12px`/`4px 10px` vs sidebar's `11px`/`3px 8px`. Added `.heyiam-project .skills-list .skill-chip` override.
- **Dark wrapper already had bg/color**: Unlike some other dark templates, ember's `.ember` wrapper already had explicit `background-color: var(--bg)`, `color: var(--text)`, `font-family`, `-webkit-font-smoothing`, and `line-height`. Only `a:visited` was missing.

### Daylight
- **Light template, extensive mockups**: Daylight is a light template with well-detailed mockups for all three page types. No wrapper bg/color needed, but `a:visited` still required to prevent browser default purple.
- **JS charts replaced with CSS-only bar chart**: Project mockup uses a CSS-only bar chart (`dl-chart`/`dl-chart-bar-group`/`dl-chart-bar-loc`) for Work Timeline, not `data-work-timeline` JS mount. No growth chart in the mockup at all -- removed `data-growth-chart` entirely. Built with Liquid loop computing `maxLoc` for proportional bar heights. Condition changed from `sessionsJson`/`growthJson` to `featuredSessions.size > 0`.
- **Many CSS class families missing from styles.css**: Skip link (`dl-skip-link`), navigation (`dl-nav`, `dl-nav-inner`, `dl-nav-brand`, `dl-nav-sep`, `dl-nav-link`), screenshot bar/dots/body, chart bar classes (8 classes), chart legend, phase dates, project source bar (portfolio cards), agent dots, activity chart (8 classes), all skills, source overview (7 classes) -- all present in mockups but absent from styles.css.
- **Stat card size drift between portfolio and project**: Portfolio stat cards use `padding: 1.5rem`, number `2rem`, label `0.8125rem`. Project stat cards use `padding: 1.25rem`, number `1.75rem`, label `0.75rem`. Added `.daylight.heyiam-project` scoped overrides.
- **Session card article pattern**: Template wrapped session cards in `<a>` but mockup uses `<article>` with inner `<a>` on h3. Also missing agent dots row. Same pattern as all other templates.
- **Portfolio missing major sections**: All Skills section (`dl-all-skills-section`) and Source Overview section (`dl-source-overview`) were absent from portfolio.liquid. Also missing source bar per project card (`dl-project-source`/`dl-source-bar`/`dl-source-fill`).
- **Source breakdown float division bug**: Known issue from status table. Fixed with `| times: 100.0 | divided_by: X | round` on both bar width and display values. Same fix as other templates.
- **Breadcrumb element mismatch**: Session template used `<div>` for breadcrumb but mockup uses `<nav>`. Same recurring pattern.

### Glacier
- **Light template, frosted glass aesthetic**: Glacier is a light template (bg: #f0f9ff) with glassmorphism frost cards, so no dark wrapper bg/color needed. Still needs `a:visited` to prevent browser default purple visited links.
- **JS charts replaced with CSS-only SVG bar chart**: Project mockup uses a static SVG bar chart for Work Timeline, not `data-work-timeline` JS mount. No growth chart in the mockup at all -- removed `data-growth-chart` entirely. Built with Liquid loop computing `maxLoc` for proportional bar heights.
- **Sessions table added**: Project mockup has a `sessions-table` with columns for #, Title, Date, Duration, LOC, Source (badge), and Agents (colored dots). This was completely absent from the liquid template. Added full table with Liquid data loops including `agent-dots` and `session-source-badge` styling.
- **Stat size drift between portfolio and project**: Portfolio stats use `repeat(4, 1fr)`, `padding: 24px 16px`, `font-size: 32px`. Project uses `repeat(3, 1fr)` default / `repeat(6, 1fr)` at `min-width: 769px`, `padding: 20px 12px`, `font-size: 24px`, with stat-label having `text-transform: uppercase; letter-spacing: 0.04em`. Section heading: portfolio `22px`/`24px margin`, project/session `20px`/`20px margin`. Skill chip: portfolio `12px`/`4px 12px`, project `13px`/`6px 16px`.
- **Portfolio card structure mismatch**: Template wrapped each project card in `<a class="project-card">`, but mockup uses `<article class="project-card">` with inner `<a class="project-name">`. Also missing source bar + legend per portfolio card. Portfolio source bar is 6px/3px radius vs project's 8px/4px.
- **Filter name matters**: Used `formatShortDate` but the actual filter is `formatDateShort`. Always verify filter names against `liquid.ts` registrations.
- **Missing CSS class families**: Sessions table (6 classes), screenshot chrome (4 classes), `phase-dates`, `project-source`, `skip-link`, `footer`, `featured-name` hover/focus were all in mockup CSS but absent from styles.css.

### Grid
- **Light template, bento grid layout**: Grid is a light template (bg: #fafafa) with a modular bento grid system. No dark wrapper bg/color needed, but `a:visited { color: inherit }` still required to prevent browser default purple visited links.
- **JS charts replaced with static timeline table**: Project mockup uses a static HTML `timeline-chart` table with `timeline-row` grid layout (columns: #, Session, Date, Time, LOC), not `data-work-timeline` JS mount. No growth chart at all in the mockup -- removed `data-growth-chart` entirely. Built with Liquid loop over `featuredSessions`.
- **Stat size drift across all three page types**: Portfolio uses `min-height: 120px`, `stat-number: 36px`, `stat-unit: 16px`. Project uses `110px`/`28px`/`14px`. Session uses `100px`/`28px`/`14px`. Used `.grid.heyiam-project` and `.grid.heyiam-session` scoped overrides.
- **Session title cell has unique sizing**: Session mockup uses `gap: 10px` (vs default `12px`), `h1 font-size: 26px` (vs `32px`), and `line-height: 1.3` (vs `1.2`). Added `.grid.heyiam-session .cell-title` override.
- **Session skills cell is 1-wide**: Session mockup uses `grid-column: span 1` for skills (only shows a few), while portfolio and project use `span 2`. Added `.grid.heyiam-session .cell-skills` override.
- **Many portfolio-only CSS class families missing**: Skip link, nav (8 classes), footer (3 classes), project source bar (2 classes), aggregate skills (3 classes), activity heatmap (6 classes), recent sessions (5 classes) -- all in mockup CSS but absent from styles.css.
- **Many project/session CSS classes missing**: Timeline chart (7 classes), session agents + agent dots, browser viewport label, phase dates, beat-item:last-child .beat-line hide, a.session-card clickable styles -- all in mockup CSS but absent from styles.css.
- **Source percentage rounding**: `divided_by` without float produces integers. Used `| times: 100.0 | divided_by: X | round: 1` for bar width and display values. Also `| round` for portfolio display values.
- **Skill chip padding differs by page type**: Portfolio uses `3px 10px`, project/session use `4px 12px`. Added `.grid.heyiam-project .skill-chip` and `.grid.heyiam-session .skill-chip` overrides.
- **Portfolio source-pct width differs**: Portfolio mockup uses `width: 36px` for `.source-pct`, while project uses `40px`. Added `.grid.heyiam-portfolio .source-pct` override.
- **Project bento has no top padding**: The project/session mockups have the breadcrumb above the bento grid, so `.bento` only needs `padding-bottom: 64px` (no top). Portfolio has `padding: 32px 0 64px` because there's no breadcrumb.
- **Responsive rules for new elements**: Added 768px breakpoints for timeline-row (3-column), recent-row (2-column with hidden date/project), and nav-links (tighter spacing). Project title responsive is 24px, session is 20px.
