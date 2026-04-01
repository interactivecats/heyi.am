# Blueprint Template -- Visual Mockup Specification

**Template name:** Blueprint
**Mode:** Light
**Accent:** Blue-grey (`#64748b`)
**Layout file:** `blueprint/project.liquid`
**CSS scope:** `[data-template="blueprint"]`

---

## 1. Design Concept

Blueprint is a spatial node-graph layout inspired by architectural drafting and schematic diagrams. Where the editorial template feels like a magazine page and kinetic feels like a dashboard, Blueprint feels like you are reading the engineering schematics for how a project was built.

Three defining characteristics set it apart:

1. **Faint grid background** -- the entire page sits on engineering graph paper
2. **SVG connector lines** -- animated lines draw between sections as they scroll into view, like an architecture diagram showing data flow
3. **Dimension-line annotations** -- small measurement-style annotations (thin lines with perpendicular end-caps) label key values, mimicking technical drawing callouts

The result should feel like a Figma canvas crossed with a CAD document. Developer-focused, precise, restrained.

---

## 2. Color System

All colors are defined as CSS custom properties scoped under `[data-template="blueprint"]`.

```
--bp-surface:           #ffffff        /* Pure white canvas */
--bp-surface-grid:      #e2e8f0        /* Grid line color at 40% opacity */
--bp-surface-low:       #f8fafc        /* Slightly off-white for cards */
--bp-on-surface:        #1e293b        /* Slate 800 -- primary text */
--bp-on-surface-variant:#64748b        /* Slate 500 -- secondary text, labels */
--bp-accent:            #64748b        /* Blue-grey accent */
--bp-accent-light:      #cbd5e1        /* Slate 300 -- connector lines, borders */
--bp-accent-lighter:    #e2e8f0        /* Slate 200 -- ghost borders, grid */
--bp-accent-bg:         #f1f5f9        /* Slate 100 -- chip backgrounds, fills */
--bp-connector:         #94a3b8        /* Slate 400 -- SVG connector stroke */
--bp-node-fill:         #64748b        /* Node dots on connectors */
--bp-crosshatch:        #e2e8f0        /* Crosshatch fill pattern at 60% */
--bp-dimension:         #94a3b8        /* Dimension line color */
--bp-green:             #059669        /* Positive metrics */
--bp-green-bg:          #ecfdf5        /* Positive metrics bg */
--bp-error:             #dc2626        /* Negative metrics / deletions */
```

**Key difference from editorial:** Editorial uses warm neutrals (`#f8f9fb`, `#191c1e`) with Seal Blue (`#084471`) accent. Blueprint uses cool slates (`#f8fafc`, `#1e293b`) with blue-grey (`#64748b`) accent. The temperature shift is subtle but noticeable -- Blueprint reads colder and more technical.

---

## 3. Typography

Blueprint uses the same three-font system but shifts the balance toward monospace.

| Role | Font | Size | Weight | Color | Usage |
|------|------|------|--------|-------|-------|
| Display | Space Grotesk | 2rem (32px) | 700 | `--bp-on-surface` | Project title only |
| Section header | Space Grotesk | 0.875rem (14px) | 600 | `--bp-on-surface` | Section labels |
| Body | Inter | 0.875rem (14px) | 400 | `--bp-on-surface` | Narrative text |
| Label | IBM Plex Mono | 0.6875rem (11px) | 400 | `--bp-on-surface-variant` | All metadata, stats labels, dimension annotations |
| Data value | IBM Plex Mono | 1.25rem (20px) | 600 | `--bp-on-surface` | Stat numbers (mono, not display) |
| Chip | IBM Plex Mono | 0.6875rem (11px) | 500 | `--bp-accent` | Skill chips, source labels |
| Annotation | IBM Plex Mono | 0.5625rem (9px) | 400 | `--bp-dimension` | Dimension-line labels |

**Key difference from editorial:** Stat values use monospace instead of Space Grotesk. This reinforces the "data readout" feel. Section headers are smaller (14px vs 16px) and the page title is larger (32px vs 20px), creating a wider hierarchy spread.

---

## 4. Grid Background

The background is a repeating SVG grid pattern applied to the page container.

```css
[data-template="blueprint"] {
  background-color: var(--bp-surface);
  background-image:
    linear-gradient(var(--bp-surface-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--bp-surface-grid) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: -1px -1px;
  opacity of grid lines: 0.4 (applied via color alpha, not opacity property)
}
```

Actual implementation uses `rgba(226, 232, 240, 0.4)` for the grid color so the lines are barely visible -- like faded graph paper. The 24px grid size aligns with the base spacing unit (1.5rem = 24px at default font size).

Every 5th line (120px) is slightly heavier (`0.55` opacity) to create a major/minor grid rhythm, matching engineering paper. This requires an additional background layer:

```css
background-image:
  /* minor grid */
  linear-gradient(rgba(226,232,240,0.35) 1px, transparent 1px),
  linear-gradient(90deg, rgba(226,232,240,0.35) 1px, transparent 1px),
  /* major grid */
  linear-gradient(rgba(226,232,240,0.55) 1px, transparent 1px),
  linear-gradient(90deg, rgba(226,232,240,0.55) 1px, transparent 1px);
background-size: 24px 24px, 24px 24px, 120px 120px, 120px 120px;
```

---

## 5. SVG Connector Lines

This is the signature visual element of Blueprint. An SVG overlay spans the full page height. As sections scroll into view, connector lines animate between them.

### 5.1 Architecture

A single `<svg>` element is positioned absolutely behind all content, spanning the full page height and width. It uses `pointer-events: none` so it does not interfere with clicks.

```html
<svg class="bp-connectors" aria-hidden="true">
  <defs>
    <marker id="bp-node" viewBox="0 0 8 8" refX="4" refY="4"
            markerWidth="8" markerHeight="8">
      <circle cx="4" cy="4" r="3" fill="var(--bp-node-fill)" />
    </marker>
  </defs>
  <!-- paths injected by JS -->
</svg>
```

### 5.2 Connection Map

Lines connect these section pairs (top-to-bottom reading order):

| From | To | Path shape | Meaning |
|------|----|------------|---------|
| Title (bottom-center) | Stats grid (top-center) | Vertical straight | "Project produced these metrics" |
| Stats grid (bottom-right) | Work Timeline (top-left) | L-shaped elbow | "Metrics break down over time" |
| Work Timeline (bottom-right) | Growth Chart (top-right) | Short vertical | "Activity drove growth" |
| Growth Chart (bottom-left) | Two-column section (top-center) | L-shaped elbow | "Growth came from these decisions" |
| Two-column (bottom-center) | Phase Timeline (top-center) | Vertical straight | "Decisions mapped to phases" |
| Phase Timeline (bottom-center) | Skills (top-center) | Vertical straight | "Phases used these skills" |
| Skills (bottom-center) | Session Cards (top-center) | L-shaped elbow | "Skills demonstrated in sessions" |

Each line has a **node dot** (filled circle, 6px diameter, `--bp-node-fill`) at both its start and end points, placed via SVG markers.

### 5.3 Path Rendering

Connector paths use `<path>` elements with cubic bezier curves for elbows. All paths have:

```css
.bp-connector-path {
  fill: none;
  stroke: var(--bp-connector);
  stroke-width: 1.5px;
  stroke-dasharray: 6 4;        /* dashed line like technical drawings */
  stroke-linecap: round;
}
```

Elbow paths follow a consistent pattern: exit the source section downward for 24px, turn 90 degrees with a 12px radius curve, travel horizontally to align with the target, turn 90 degrees down again, enter the target section.

### 5.4 Draw Animation

Each path has a `stroke-dashoffset` animation that "draws" the line as the target section enters the viewport.

```css
.bp-connector-path {
  stroke-dasharray: 1000;       /* large enough to cover full path */
  stroke-dashoffset: 1000;      /* fully hidden initially */
  transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.bp-connector-path.bp-drawn {
  stroke-dashoffset: 0;         /* fully visible */
}
```

**Trigger:** IntersectionObserver watches each target section. When a section crosses 20% visibility threshold, the connector leading TO that section gets the `.bp-drawn` class. Lines draw in sequence top-to-bottom as the user scrolls.

**Duration:** 800ms per line. Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (Material's standard easing -- starts fast, decelerates to rest).

### 5.5 Position Calculation

Connector positions are computed in the inline `<script>` at page load and on resize. For each connection pair:

1. Query source and target elements by `data-bp-node="stats"`, `data-bp-node="timeline"`, etc.
2. Get `getBoundingClientRect()` relative to the SVG container
3. Calculate start point (bottom-center of source) and end point (top-center of target)
4. Generate the `d` attribute for the `<path>` element

Recalculate on window resize (debounced 200ms).

---

## 6. Dimension-Line Annotations

Small measurement-style annotations appear alongside key data values, mimicking technical drawing callouts.

### Visual Structure

```
         |--- 14h 32m ---|
         ^               ^
    end-cap          end-cap
    (perpendicular   (perpendicular
     2px line)        2px line)
```

A dimension line is an SVG group containing:
- A horizontal thin line (1px, `--bp-dimension`)
- Two perpendicular end-caps (6px tall, 1px wide)
- A centered label in IBM Plex Mono 9px, `--bp-dimension` color

### Where They Appear

| Location | What it annotates |
|----------|-------------------|
| Stats: Duration card | Total duration value gets a dimension line above it |
| Stats: LOC card | Lines changed value gets a dimension line above it |
| Growth Chart | Final cumulative value gets a horizontal dimension line at the chart's right edge |
| Phase Timeline | Duration span between first and last phase gets a vertical dimension line on the left margin |

Implementation: These are inline SVGs within each component, not part of the main connector SVG. They are purely decorative (`aria-hidden="true"`).

---

## 7. Section-by-Section Layout Specification

Page container: `max-width: 960px` (narrower than editorial's 1200px -- tighter frame reinforces the "document" feel). `margin: 0 auto`. `padding: 3rem 2rem`.

Each section receives a `data-bp-node` attribute for connector line targeting.

---

### 7.1 Title

```
+--------------------------------------------------------------+
|                                                              |
|  [node-dot]                                                  |
|                                                              |
|  heyi.am CLI                                                 |
|                                                              |
|  |- github.com/user/repo      |- project.example.com        |
|                                                              |
+--------------------------------------------------------------+
         |
         | (connector to stats)
         v
```

- **h1**: Space Grotesk, 2rem, weight 700, color `--bp-on-surface`, letter-spacing `-0.02em`
- **No card wrapper** -- title sits directly on the grid background
- **Links row**: flexbox, gap 1.5rem. Each link: IBM Plex Mono, 0.75rem, color `--bp-accent`. Prefix with a thin vertical pipe `|` character (styled as `border-left: 1px solid var(--bp-accent-light); padding-left: 0.75rem`)
- **Node dot**: 6px circle, `--bp-node-fill`, positioned at top-left of title via `::before` pseudo-element, offset `-16px` left. This is the origin point for the first connector.
- **Margin bottom**: 2rem

---

### 7.2 Screenshot

```
+--------------------------------------------------------------+
|  .--- browser chrome (dots + url bar) -----------------.     |
|  |                                                      |    |
|  |  [ screenshot image ]                                |    |
|  |                                                      |    |
|  '------------------------------------------------------'    |
|                                                              |
|  |- VIEWPORT: 1200 x 800 -|   <- dimension annotation       |
+--------------------------------------------------------------+
```

- **Browser chrome frame**: identical to editorial (reuse `.browser-chrome` partial)
- **Border**: `1px solid var(--bp-accent-lighter)` instead of `--ghost`
- **Corner radius**: `3px` (smaller than editorial's `--radius-md`, more technical)
- **Dimension annotation**: Below the screenshot, a small dimension line shows "VIEWPORT: {width} x {height}" in 9px mono. This is decorative -- uses fixed text.
- **Margin bottom**: 2rem

---

### 7.3 Narrative

```
+--------------------------------------------------------------+
|  NARRATIVE SUMMARY          ---- REF: 001                    |
|  ----------------------------------------------------------  |
|                                                              |
|  The project started as an experiment in CLI-first developer |
|  tooling. We wanted to prove that a terminal interface could |
|  match the quality of a web editor while maintaining the     |
|  speed advantages of local-first architecture.               |
|                                                              |
+--------------------------------------------------------------+
```

- **Card background**: `--bp-surface-low` (`#f8fafc`)
- **Card border**: `1px solid var(--bp-accent-lighter)`
- **Card padding**: `1.5rem`
- **Card radius**: `3px`
- **Section header**: "NARRATIVE SUMMARY" in IBM Plex Mono, 11px, uppercase, tracking `0.08em`, color `--bp-on-surface-variant`. Right-aligned: "REF: 001" in same style (sequential reference numbers for each section, mimicking drawing sheet references)
- **Divider below header**: `1px solid var(--bp-accent-lighter)`, margin `0.75rem 0`
- **Body text**: Inter, 0.875rem, line-height 1.7, color `--bp-on-surface`
- **No left border accent** -- unlike editorial's blue left-border. Blueprint uses the card + header pattern instead.
- **Margin bottom**: 2rem

---

### 7.4 Stats Grid

```
+--------------------------------------------------------------+
|  METRICS                    ---- REF: 002                    |
|  ----------------------------------------------------------  |
|                                                              |
|  +------------+  +----------+  +----------+  +----------+    |
|  | DURATION   |  | SESSIONS |  | LOC      |  | FILES    |   |
|  |            |  |          |  |          |  |          |    |
|  | |--14h32--|  |    47    |  | 12,847  |  |   234   |    |
|  |            |  |          |  |          |  |          |    |
|  +------------+  +----------+  +----------+  +----------+    |
|                                                              |
|  +--------------------------------------------------+        |
|  | TOKENS           | EFFICIENCY MULTIPLIER          |       |
|  | 2.4M             | 3.2x                           |       |
|  +--------------------------------------------------+        |
|                                                              |
+--------------------------------------------------------------+
```

- **Outer card**: same as narrative (surface-low bg, accent-lighter border, 3px radius)
- **Stat cells**: 4-column grid on first row, 2-column grid on second row
- **Each stat cell**:
  - Background: `transparent` (no nested card -- sits on the section card)
  - Border: `1px dashed var(--bp-accent-lighter)` -- dashed border is key differentiator, evokes technical drawing
  - Padding: `1rem`
  - Radius: `2px`
  - Label: IBM Plex Mono, 9px, uppercase, tracking `0.05em`, color `--bp-on-surface-variant`
  - Value: IBM Plex Mono, 1.25rem, weight 600, color `--bp-on-surface`
- **Duration stat** gets a dimension-line annotation above its value (see Section 6)
- **Grid gap**: `0.75rem`
- **Margin bottom**: 2rem

---

### 7.5 Work Timeline (React hydrated)

```
+--------------------------------------------------------------+
|  WORK TIMELINE              ---- REF: 003                    |
|  ----------------------------------------------------------  |
|                                                              |
|  [  |||  ||||||  |||  |  ||||||||||  ||||  ||  ]             |
|  Jan 12      Jan 19      Jan 26      Feb 02                 |
|                                                              |
+--------------------------------------------------------------+
```

- **Card**: same pattern as above
- **Chart container**: `data-work-timeline` attribute (React hydration target, same as editorial)
- **Chart theming**: The React component reads CSS custom properties. Blueprint overrides:
  - Bar fill: `var(--bp-accent)` (`#64748b`) instead of Seal Blue
  - Bar hover: `var(--bp-on-surface)` (`#1e293b`)
  - Grid lines: `var(--bp-accent-lighter)` -- matches the page grid
  - Axis labels: IBM Plex Mono, 9px, `--bp-on-surface-variant`
- **Crosshatch fill**: Bars use an SVG `<pattern>` fill with 45-degree crosshatch lines (2px spacing, 1px stroke, `--bp-crosshatch` color) instead of solid fill. This is the signature Blueprint chart style.
- **Margin bottom**: 2rem

---

### 7.6 Growth Chart (React hydrated)

```
+--------------------------------------------------------------+
|  CUMULATIVE GROWTH          ---- REF: 004                    |
|  ----------------------------------------------------------  |
|                                                              |
|        .----.                                                |
|      .'      '-.    .-----.                                  |
|  .-.'           '--'      '------.                           |
|  LOC ------   FILES - - - -                                  |
|                                                              |
|                               |-- 12,847 LOC --|  <- dim    |
+--------------------------------------------------------------+
```

- **Card**: same pattern
- **Chart theming**:
  - LOC line: `var(--bp-accent)` solid, 1.5px stroke
  - Files line: `var(--bp-accent)` dashed (`stroke-dasharray: 4 3`), 1.5px stroke -- differentiated by dash pattern, not color
  - Fill under LOC line: `var(--bp-accent-bg)` at 30% opacity with crosshatch overlay
  - Grid: same as Work Timeline
- **Legend**: Below chart, inline. Two items: "LOC" with solid line swatch, "FILES" with dashed line swatch. IBM Plex Mono, 9px.
- **Dimension annotation**: At the right edge of the chart, a vertical dimension line shows the final LOC value
- **Margin bottom**: 2rem

---

### 7.7 Two-Column: Key Decisions + Source Breakdown

```
+------------------------------+  +------------------------------+
|  KEY DECISIONS  ---- REF:005 |  |  SOURCE BREAKDOWN  -- REF:006|
|  --------------------------- |  |  ---------------------------- |
|                              |  |                              |
|  [1] Title of decision       |  |  EXT       COUNT      %     |
|      Description text that   |  |  .ts         47     38%     |
|      explains the rationale  |  |  .tsx        31     25%     |
|                              |  |  .css        18     15%     |
|  [2] Another decision        |  |  .json       12     10%     |
|      More description here   |  |  .liquid      8      6%     |
|                              |  |  other        8      6%     |
|  [3] Third decision          |  |                              |
|      Final description       |  |                              |
|                              |  |                              |
+------------------------------+  +------------------------------+
```

- **Layout**: CSS grid, `grid-template-columns: 1fr 1fr`, gap `1rem`
- **Each column**: independent card with the standard Blueprint card pattern

**Key Decisions (left)**:
- Decisions numbered with `[1]`, `[2]`, `[3]` prefixes in IBM Plex Mono, color `--bp-accent`
- Decision title: Inter, 0.875rem, weight 600, color `--bp-on-surface`
- Decision description: Inter, 0.8125rem, color `--bp-on-surface-variant`, line-height 1.6
- Decisions separated by `1px dashed var(--bp-accent-lighter)` horizontal rule
- Spacing between decisions: `1rem`

**Source Breakdown (right)**:
- Table with no vertical borders (consistent with DESIGN.md rules)
- Header row: IBM Plex Mono, 9px, uppercase, tracking `0.05em`, color `--bp-on-surface-variant`. Bottom border: `1px solid var(--bp-accent-lighter)`
- Data rows: IBM Plex Mono, 0.8125rem. Extension column left-aligned, count center-aligned, percentage right-aligned
- Row separators: `1px dashed var(--bp-accent-lighter)` (dashed, not solid -- Blueprint motif)
- Percentage column: color `--bp-accent` for visual weight
- **Margin bottom**: 2rem

---

### 7.8 Phase Timeline

```
+--------------------------------------------------------------+
|  PROJECT PHASES             ---- REF: 007                    |
|  ----------------------------------------------------------  |
|                                                              |
|  |  (1)---- Phase 1: Foundation ----                         |
|  |          Set up project structure, CLI framework,         |
|  |          and initial data model.                          |
|  |                                                          |
|  |  (2)---- Phase 2: Core Features ----                      |
|  |          Implemented session recording, file tracking,    |
|  |          and enhancement pipeline.                        |
|  |                                                          |
|  |  (3)---- Phase 3: Templates ----                          |
|  |          Built Liquid rendering with multiple templates.  |
|  |                                                          |
|                                                              |
+--------------------------------------------------------------+
```

- **Card**: standard Blueprint card
- **Timeline line**: 1.5px solid `--bp-accent-light`, positioned 12px from left edge
- **Phase nodes**: Numbered circles instead of plain dots. Each node:
  - Circle: 20px diameter, `1px solid var(--bp-accent)`, background `--bp-surface`, centered on the timeline line
  - Number inside: IBM Plex Mono, 9px, weight 600, color `--bp-accent`, centered
- **Phase title**: Preceded by a 24px horizontal line (1px, `--bp-accent-light`) extending from the node to the text. Space Grotesk, 0.8125rem, weight 600, color `--bp-on-surface`
- **Phase description**: Inter, 0.8125rem, color `--bp-on-surface-variant`, line-height 1.6, left margin aligned with title (to the right of the node + connector)
- **Vertical dimension annotation**: On the far left margin (-32px offset from card edge), a vertical dimension line spans from the first node to the last node, labeled with the total project duration. Visible only on viewports wider than 1100px.
- **Margin bottom**: 2rem

---

### 7.9 Skills

```
+--------------------------------------------------------------+
|  SKILLS                     ---- REF: 008                    |
|  ----------------------------------------------------------  |
|                                                              |
|  +- TypeScript -+  +- React -+  +- Node.js -+  +- CSS -+   |
|  +- Liquid -+  +- SQLite -+  +- Vitest -+                   |
|                                                              |
+--------------------------------------------------------------+
```

- **Card**: standard Blueprint card
- **Chip layout**: flexbox wrap, gap `0.5rem`
- **Each chip**:
  - Background: `transparent`
  - Border: `1px solid var(--bp-accent-light)` (not dashed here -- solid thin border)
  - Padding: `0.25rem 0.625rem`
  - Radius: `2px` (very tight, almost rectangular -- technical label feel)
  - Font: IBM Plex Mono, 0.6875rem, weight 500, color `--bp-accent`
  - No background fill -- just outlined. This is a deliberate departure from editorial's filled violet chips. Blueprint chips look like component labels on a schematic.
- **Hover**: background fills to `--bp-accent-bg`, transition 150ms
- **Margin bottom**: 2rem

---

### 7.10 Featured Session Cards

```
+--------------------------------------------------------------+
|  SESSIONS                   ---- REF: 009   47 total        |
|  ----------------------------------------------------------  |
|                                                              |
|  +--[01]---------------------+  +--[02]---------------------+|
|  |  Set up CLI framework     |  |  Implement session parser |+|
|  |                           |  |                           ||
|  |  2h 14m . 34 turns . 847L |  |  1h 52m . 28 turns . 612L||
|  |  +- TypeScript -+         |  |  +- Node.js -+           ||
|  +---------------------------+  +---------------------------+|
|                                                              |
|  +--[03]---------------------+  +--[04]---------------------+|
|  |  Build Liquid renderer    |  |  Add template switching   ||
|  |                           |  |                           ||
|  |  3h 07m . 41 turns . 1.2K |  |  1h 19m . 22 turns . 423L||
|  |  +- Liquid -+             |  |  +- CSS -+               ||
|  +---------------------------+  +---------------------------+|
|                                                              |
+--------------------------------------------------------------+
```

- **Card**: standard Blueprint card wrapper
- **Session grid**: `grid-template-columns: repeat(2, 1fr)`, gap `0.75rem`
- **Each session card**:
  - Background: `--bp-surface` (pure white, contrasts against section's surface-low)
  - Border: `1px solid var(--bp-accent-lighter)`
  - Radius: `3px`
  - Padding: `1rem`
  - **Index badge** (replaces editorial's colored top bar): Top-left corner label `[01]`, `[02]`, etc. IBM Plex Mono, 9px, weight 600, color `--bp-accent`, positioned as `::before` pseudo-element with absolute positioning, offset `-0.5rem` top, `0.5rem` left, background `--bp-surface`, padding `0 0.25rem`. The index sits on the card's top border, breaking it visually.
  - **Title**: Space Grotesk, 0.8125rem, weight 600, color `--bp-on-surface`. Clamp to 2 lines.
  - **Meta**: IBM Plex Mono, 0.75rem, color `--bp-on-surface-variant`. Separator: ` . ` (space-dot-space, not middot)
  - **Skill chip**: Outlined style matching Section 7.9
  - **Hover**: `box-shadow: 0 2px 8px rgba(100, 116, 139, 0.12)` -- blue-grey tinted shadow instead of neutral black. Transition 150ms.
- **Margin bottom**: 2rem

---

### 7.11 Footer

```
+--------------------------------------------------------------+
|                                                              |
|  ----------------------------------------------------------  |
|  BUILT WITH HEYI.AM        DWG NO: {slug}    REV: {date}    |
|                                                              |
+--------------------------------------------------------------+
```

- **Top border**: `1px solid var(--bp-accent-lighter)`
- **Padding top**: `1.5rem`
- **Layout**: flexbox, `justify-content: space-between`
- **Left text**: "BUILT WITH HEYI.AM" -- IBM Plex Mono, 9px, uppercase, tracking `0.08em`, color `--bp-on-surface-variant`
- **Right text**: "DWG NO: {project.slug} REV: {date}" -- same style. Mimics drawing sheet title block.
- **No card wrapper** -- sits directly on grid background

---

## 8. Animation Specifications

### 8.1 Connector Draw Animation
- **Trigger**: IntersectionObserver, threshold `0.2`
- **Method**: `stroke-dashoffset` transition
- **Duration**: 800ms
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)`
- **Stagger**: Each connector animates when its target section enters viewport. Natural scroll-driven stagger -- no artificial delay.
- **Reduced motion**: Respect `prefers-reduced-motion: reduce`. When active, all connectors render immediately with no animation (set `stroke-dashoffset: 0` in CSS, remove transition).

### 8.2 Section Entrance
- **Trigger**: Same IntersectionObserver as connectors
- **Effect**: Sections start at `opacity: 0; transform: translateY(12px)` and transition to `opacity: 1; transform: translateY(0)`
- **Duration**: 400ms
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)`
- **Stagger**: None -- each section animates independently when it enters viewport
- **Reduced motion**: Instant visibility, no transform

### 8.3 Dimension Line Draw
- **Trigger**: When parent section enters viewport
- **Effect**: The horizontal/vertical line of each dimension annotation scales from 0 to full length (`transform: scaleX(0)` to `scaleX(1)`, origin center)
- **Duration**: 600ms
- **Delay**: 200ms after section entrance begins (so the section fades in first, then the annotation draws)
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)`
- **Reduced motion**: Instant visibility

### 8.4 Hover Micro-interactions
- **Session cards**: `box-shadow` transition, 150ms, `ease`
- **Skill chips**: `background-color` transition, 150ms, `ease`
- **Links**: `color` transition, 150ms, `ease`

---

## 9. Responsive Behavior

### Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| > 960px | Full layout as specified above |
| 768-960px | Page padding reduces to `2rem 1.5rem`. Two-column and session grid stay 2-col. |
| < 768px | Two-column stacks to single column. Session grid stacks to single column. Stats grid becomes 2x2. SVG connectors hidden (too complex for narrow layouts -- `display: none`). Dimension annotations hidden. |

### Connector Lines on Mobile
SVG connectors are hidden below 768px. The sections stand on their own at mobile widths -- the connectors are a desktop enhancement, not structural. Hiding them is clean: `@media (max-width: 767px) { .bp-connectors { display: none; } }`.

---

## 10. Crosshatch Pattern Definition

Used in chart bar fills and optionally as card background accent.

```svg
<pattern id="bp-crosshatch" width="4" height="4"
         patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <line x1="0" y1="0" x2="0" y2="4"
        stroke="var(--bp-crosshatch)" stroke-width="1" />
</pattern>
```

This creates 45-degree parallel lines at 4px spacing. For chart bars, the fill is `url(#bp-crosshatch)` with a `--bp-accent-bg` solid background behind it. The result: a light blue-grey bar with visible diagonal hatching, like a shaded region on a technical drawing.

---

## 11. Full Page Wireframe (ASCII)

```
+=================================================================+
|  . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  |
|  . . . . . . . . GRID BACKGROUND (24px) . . . . . . . . . . .  |
|  . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  |
|                                                                 |
|     (o) heyi.am CLI                           <- h1, 2rem      |
|         |- github.com/user/repo  |- live site                   |
|                                                                 |
|         |                                                       |
|         | <-- SVG connector (dashed, animates on scroll)        |
|         v                                                       |
|                                                                 |
|     +--- browser chrome (three dots + url) ---------------+     |
|     |                                                      |    |
|     |              [ screenshot ]                          |    |
|     |                                                      |    |
|     +------------------------------------------------------+    |
|     |- VIEWPORT: 1200 x 800 -|                                  |
|                                                                 |
|     +-- NARRATIVE SUMMARY --------- REF: 001 --------+         |
|     |  ------------------------------------------------|        |
|     |                                                  |        |
|     |  Project description text in Inter 14px.         |        |
|     |  Multiple lines, line-height 1.7.                |        |
|     |                                                  |        |
|     +--------------------------------------------------+        |
|                                                                 |
|         |                                                       |
|         v                                                       |
|                                                                 |
|     +-- METRICS -------------------- REF: 002 --------+        |
|     |  ------------------------------------------------|        |
|     |                                                  |        |
|     |  +----------+ +--------+ +--------+ +--------+   |        |
|     |  | DURATION | |SESSIONS| |  LOC   | | FILES  |   |        |
|     |  ||--14h--|  |   47   | | 12,847 | |  234  |   |        |
|     |  +----------+ +--------+ +--------+ +--------+   |        |
|     |                                                  |        |
|     |  +---------------------+ +--------------------+  |        |
|     |  | TOKENS              | | EFFICIENCY         |  |        |
|     |  | 2.4M                | | 3.2x               |  |        |
|     |  +---------------------+ +--------------------+  |        |
|     |                                                  |        |
|     +--------------------------------------------------+        |
|                                                                 |
|         |                    .                                   |
|         '-----------.       . <-- L-shaped elbow connector      |
|                      '-----'                                    |
|                                                                 |
|     +-- WORK TIMELINE --------------- REF: 003 -------+        |
|     |  ------------------------------------------------|        |
|     |                                                  |        |
|     |  [  |||  ||||||  |||  |  ||||||||||  ||||  ||  ]  |        |
|     |  Jan 12      Jan 19      Jan 26      Feb 02      |        |
|     |  (bars have crosshatch fill pattern)              |        |
|     |                                                  |        |
|     +--------------------------------------------------+        |
|                                                                 |
|         |                                                       |
|         v                                                       |
|                                                                 |
|     +-- CUMULATIVE GROWTH ----------- REF: 004 -------+        |
|     |  ------------------------------------------------|        |
|     |                                                  |        |
|     |        .----.                                    |        |
|     |      .'      '-.    .-----.                      |        |
|     |  .-.'           '--'      '------. |--12,847--|  |        |
|     |                                                  |        |
|     |  -- LOC (solid)   - - FILES (dashed)             |        |
|     |                                                  |        |
|     +--------------------------------------------------+        |
|                                                                 |
|         |                                                       |
|         v                                                       |
|                                                                 |
|     +-- KEY DECISIONS -- REF:005-+  +-- SOURCE BKD -- REF:006-+|
|     |  ------------------------- |  |  ----------------------- ||
|     |                            |  |                          ||
|     |  [1] Decision title        |  |  EXT     COUNT     %    ||
|     |      Description text      |  |  .ts       47    38%    ||
|     |  - - - - - - - - - - - -   |  |  .tsx      31    25%    ||
|     |  [2] Another decision      |  |  .css      18    15%    ||
|     |      Description text      |  |  .json     12    10%    ||
|     |  - - - - - - - - - - - -   |  |  .liquid    8     6%    ||
|     |  [3] Third decision        |  |  other      8     6%    ||
|     |      Description text      |  |                          ||
|     |                            |  |                          ||
|     +----------------------------+  +--------------------------+|
|                                                                 |
|         |                                                       |
|         v                                                       |
|                                                                 |
|     +-- PROJECT PHASES ------------- REF: 007 --------+        |
|  |  |  ------------------------------------------------|        |
|  |  |                                                  |        |
|  d  |  |  (1)---- Phase 1: Foundation ----              |        |
|  i  |  |          Description text here.                |        |
|  m  |  |                                                |        |
|  .  |  |  (2)---- Phase 2: Core Features ----           |        |
|     |  |          Description text here.                |        |
|  l  |  |                                                |        |
|  i  |  |  (3)---- Phase 3: Templates ----               |        |
|  n  |  |          Description text here.                |        |
|  e  |                                                  |        |
|     +--------------------------------------------------+        |
|                                                                 |
|         |                                                       |
|         v                                                       |
|                                                                 |
|     +-- SKILLS --------------------- REF: 008 --------+        |
|     |  ------------------------------------------------|        |
|     |                                                  |        |
|     |  +- TypeScript -+  +- React -+  +- Node.js -+   |        |
|     |  +- Liquid -+  +- SQLite -+  +- Vitest -+       |        |
|     |                                                  |        |
|     +--------------------------------------------------+        |
|                                                                 |
|         |                                                       |
|         v                                                       |
|                                                                 |
|     +-- SESSIONS ------ REF: 009 ------ 47 total -----+        |
|     |  ------------------------------------------------|        |
|     |                                                  |        |
|     |  +--[01]----------------+  +--[02]-------------+ |        |
|     |  | Set up CLI framework |  | Session parser    | |        |
|     |  | 2h 14m . 34t . 847L |  | 1h 52m . 28t . 612| |        |
|     |  | +- TypeScript -+     |  | +- Node.js -+     | |        |
|     |  +----------------------+  +-------------------+ |        |
|     |                                                  |        |
|     |  +--[03]----------------+  +--[04]-------------+ |        |
|     |  | Liquid renderer      |  | Template switch   | |        |
|     |  | 3h 07m . 41t . 1.2K |  | 1h 19m . 22t . 423| |        |
|     |  | +- Liquid -+         |  | +- CSS -+         | |        |
|     |  +----------------------+  +-------------------+ |        |
|     |                                                  |        |
|     +--------------------------------------------------+        |
|                                                                 |
|     --------------------------------------------------------    |
|     BUILT WITH HEYI.AM       DWG NO: heyi-cli  REV: 2026-04    |
|                                                                 |
|  . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  |
+=================================================================+
```

---

## 12. Implementation Notes

### Liquid Template Structure

The Blueprint template reuses all existing partials (`_stats.liquid`, `_narrative.liquid`, etc.) -- the visual differentiation comes entirely from CSS scoped under `[data-template="blueprint"]` plus the connector SVG injected by the layout file.

```liquid
{%- comment -%} blueprint/project.liquid {%- endcomment -%}
<div class="heyiam-project" data-render-version="2" data-template="blueprint"
     {% if sessionBaseUrl %} data-session-base-url="{{ sessionBaseUrl }}"{% endif %}
     data-username="{{ user.username }}" data-project-slug="{{ project.slug }}">

  <svg class="bp-connectors" aria-hidden="true">
    <defs>
      <marker id="bp-node" ...>...</marker>
      <pattern id="bp-crosshatch" ...>...</pattern>
    </defs>
  </svg>

  <div data-bp-node="title">
    <h1 class="project-title" data-editable="title">{{ project.title }}</h1>
    {% render 'partials/_links', project: project %}
  </div>

  {% render 'partials/_screenshot', project: project %}

  <div data-bp-node="narrative">
    {% render 'partials/_narrative', narrative: project.narrative %}
  </div>

  <div data-bp-node="stats">
    {% render 'partials/_stats', project: project, durationLabel: durationLabel,
              efficiencyMultiplier: efficiencyMultiplier %}
  </div>

  <div data-bp-node="timeline">
    {% render 'partials/_work-timeline', sessionsJson: sessionsJson %}
  </div>

  <div data-bp-node="growth">
    {% render 'partials/_growth-chart', project: project, growthJson: growthJson %}
  </div>

  <div class="two-col" data-bp-node="details">
    {% render 'partials/_key-decisions', arc: arc %}
    {% render 'partials/_source-breakdown', sourceCounts: sourceCounts %}
  </div>

  <div data-bp-node="phases">
    {% render 'partials/_phases', arc: arc %}
  </div>

  <div data-bp-node="skills">
    {% render 'partials/_skills', skills: project.skills %}
  </div>

  <div data-bp-node="sessions">
    {% render 'partials/_session-cards', featuredSessions: featuredSessions,
              sessionBaseUrl: sessionBaseUrl, totalSessionCount: sessions.size %}
  </div>

  {% render 'partials/_footer', sessionBaseUrl: sessionBaseUrl %}

  <script>
    /* IntersectionObserver for connector draw + section entrance */
    /* Position calculation for connector paths */
    /* Debounced resize handler */
  </script>
</div>
```

### CSS Scoping Strategy

All Blueprint styles are scoped under `[data-template="blueprint"]` in `styles.css`. This overrides the base styles without modifying them:

```css
/* ── Blueprint Template ── */
[data-template="blueprint"] {
  --surface: var(--bp-surface);
  --surface-low: var(--bp-surface-low);
  /* ... remap all base tokens to blueprint values ... */
}
```

This means the shared partials (stats, skills, etc.) automatically pick up Blueprint colors through the CSS custom property cascade. Additional Blueprint-specific styles (grid background, connector SVG, dashed borders, crosshatch fills, dimension annotations, numbered nodes) are additive rules that only exist under the `[data-template="blueprint"]` scope.

### Accessibility

- SVG connectors: `aria-hidden="true"`, `pointer-events: none`
- Dimension annotations: `aria-hidden="true"` (decorative)
- Grid background: CSS only, no accessibility impact
- Section reference numbers (REF: 001): included in visible text for screen readers, serving as landmarks
- All interactive elements (links, session cards) maintain standard focus indicators
- Color contrast: `--bp-on-surface` (#1e293b) on `--bp-surface` (#ffffff) = 14.5:1 ratio. `--bp-on-surface-variant` (#64748b) on white = 4.6:1 (passes AA for normal text)
- `prefers-reduced-motion` fully supported (see Section 8)

---

## 13. Visual Differentiation Summary

| Aspect | Editorial (baseline) | Blueprint |
|--------|---------------------|-----------|
| Background | Solid `#f8f9fb` | White with 24px grid pattern |
| Accent color | Seal Blue `#084471` | Blue-grey `#64748b` |
| Card borders | Ghost border 15% opacity | `1px solid` slate 200 |
| Stat borders | Ghost border | Dashed border |
| Stat values | Space Grotesk (display) | IBM Plex Mono (data) |
| Chart fills | Solid color | Crosshatch pattern |
| Skill chips | Filled violet background | Outlined, no fill |
| Session cards | Colored top bar | Numbered index badge |
| Section headers | Display font, no ref number | Mono uppercase + REF number |
| Narrative | Blue left-border accent | Card with header + divider |
| Phase nodes | Plain dots | Numbered circles |
| Unique element | None | SVG connector lines between sections |
| Unique element | None | Dimension-line annotations |
| Page width | 1200px | 960px (tighter) |
| Temperature | Warm neutral | Cool slate |
| Footer | Centered text | Drawing title block (left/right) |
