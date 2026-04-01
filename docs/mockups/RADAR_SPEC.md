# Radar Template -- Visual Mockup Specification

Template #6 for heyi.am project pages.

---

## 1. Identity and Position in the System

| Property     | Value                                      |
|--------------|--------------------------------------------|
| Name         | `radar`                                    |
| Mode         | `dark`                                     |
| Accent       | Cyan `#22d3ee`                             |
| Background   | Deep navy `#0f172a`                        |
| Concept      | HUD / data-viz cockpit. Thin luminous lines on dark fields. |

### How Radar differs from other dark templates

| Template   | Accent   | Structural metaphor          | Key visual device                  |
|------------|----------|------------------------------|------------------------------------|
| Kinetic    | Orange   | Sports broadcast / stats box | Cards, bold stat numbers, warm     |
| Terminal   | Green    | Unix terminal                | Monospace everything, tree chars   |
| Showcase   | Violet   | Gallery / magazine           | Scroll-triggered entrance anims    |
| **Radar**  | **Cyan** | **Cockpit HUD / data-viz**  | **Thin luminous lines, radial nav, coordinate-grid bg** |

Kinetic is warm and chunky. Terminal is monospace and retro. Showcase is theatrical. Radar is cold, precise, and information-dense -- the visual language of an instrument panel.

---

## 2. Design Tokens (CSS Custom Properties)

These override the base tokens when `data-template="radar"` is set.

```css
.heyiam-project.radar {
  /* Surfaces */
  --surface:          #0f172a;    /* deep navy -- page bg */
  --surface-low:      #131c31;    /* slightly lighter -- section bg */
  --surface-lowest:   #1a2540;    /* card bg */
  --surface-high:     #0b1120;    /* darker -- inset areas */
  --on-surface:       #e2e8f0;    /* primary text -- slate-200 */
  --on-surface-variant: #64748b;  /* secondary text -- slate-500 */

  /* Accent */
  --accent:           #22d3ee;    /* cyan-400 */
  --accent-dim:       rgba(34, 211, 238, 0.15);  /* cyan at 15% -- borders, glows */
  --accent-faint:     rgba(34, 211, 238, 0.06);  /* cyan at 6% -- bg tints */

  /* Structural */
  --outline:          #1e293b;    /* slate-800 -- borders */
  --ghost:            rgba(34, 211, 238, 0.08);  /* cyan-tinted ghost borders */
  --grid-line:        rgba(34, 211, 238, 0.04);  /* coordinate grid lines */

  /* Semantic */
  --primary:          #22d3ee;
  --green:            #34d399;    /* emerald-400 */
  --green-bg:         rgba(52, 211, 153, 0.1);
  --violet:           #a78bfa;    /* violet-400 */
  --violet-bg:        rgba(167, 139, 250, 0.1);
  --error:            #f87171;    /* red-400 */

  /* Typography */
  --font-display:     'Space Grotesk', sans-serif;
  --font-body:        'Inter', sans-serif;
  --font-mono:        'IBM Plex Mono', monospace;

  /* Radii */
  --radius-sm:        2px;        /* sharper than editorial -- HUD precision */
  --radius-md:        4px;
}
```

### Why these values

- Radii are intentionally tight (2px / 4px) to feel instrument-panel precise. Editorial uses 4px / 6px, kinetic uses 6px / 8px. Radar is the sharpest.
- The accent `#22d3ee` (cyan-400) is calibrated for strong contrast on `#0f172a` -- WCAG AA passes at 9.1:1 for text.
- Ghost borders use cyan tinting rather than neutral gray. This is the key difference from kinetic (which uses warm gray ghosts) -- Radar's borders glow faintly cyan.

---

## 3. The Radar Navigation Element

### Concept

A persistent, small (120x120px) radial HUD element fixed to the bottom-right of the viewport. It functions as both a section indicator and a navigational control.

### Structure

```
           Stats
          .
    Title  .   Timeline
      .   /---|   .
       . / . . \  .
  Links --  +  -- Growth
       . \ . . /  .
      .   \---|   .
   Screenshot    Decisions
          .
        Skills
```

The element is a circle (120px diameter) with:
- A 1px cyan border at 30% opacity
- A faint radial gradient from `--accent-faint` at center to transparent at edge
- 12 section dots arranged at clock positions around the circumference (spaced evenly for the 12 sections)
- A rotating sweep line (like a radar sweep) that slowly rotates (12s full rotation, linear, infinite) at very low opacity (8%)
- The sweep line is a conic gradient from `--accent` at 0% to transparent at 15%

### Section Dots

Each dot is 6px diameter, positioned at the circle perimeter:
- **Inactive:** `--outline` (slate-800) fill
- **In viewport:** `--accent` fill with a 4px box-shadow glow (`0 0 8px var(--accent-dim)`)
- **Active (clicked):** `--accent` fill, solid, with a 2px ring

When a section enters the viewport (IntersectionObserver, threshold 0.3), its corresponding dot "lights up." This is the only animation on the page besides the sweep.

### Dot positions (clock positions, starting from 12 o'clock going clockwise)

| Clock | Section               |
|-------|-----------------------|
| 12    | Title                 |
| 1     | Links                 |
| 2     | Screenshot            |
| 3     | Narrative             |
| 4     | Stats                 |
| 5     | Work Timeline         |
| 6     | Growth Chart          |
| 7     | Key Decisions + Source |
| 8     | Phase Timeline        |
| 9     | Skills                |
| 10    | Session Cards         |
| 11    | Footer                |

### Click behavior

Clicking a dot scrolls the page to that section using `scrollIntoView({ behavior: 'smooth', block: 'start' })`.

### Responsive

On viewports below 768px, the radar element is hidden entirely. It is a desktop-only affordance.

### Implementation

This requires a small inline `<script>` in the Liquid template (same pattern as showcase's IntersectionObserver). Approximately 40 lines of JS:
1. Query all `[data-radar-section]` elements
2. Create IntersectionObserver
3. On intersection, toggle `.radar-dot--active` class on corresponding dot
4. Attach click handlers to dots

---

## 4. Coordinate Grid Background

The page background has a faint coordinate grid that reinforces the HUD metaphor.

```css
.heyiam-project.radar {
  background-color: var(--surface);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

This produces a 40px square grid in cyan at 4% opacity -- barely visible, but it grounds the page in a coordinate-system feel. It is CSS-only, no image files, no performance cost.

---

## 5. Luminous Line Aesthetic

The "thin luminous lines on dark fields" concept is implemented through a consistent visual treatment applied to all structural borders and separators.

### The rule

Every border on the page uses one of two treatments:

1. **Structural lines:** `1px solid var(--ghost)` (cyan at 8%). Used for card borders, table row separators, the phase timeline line.
2. **Emphasis lines:** `1px solid var(--accent-dim)` (cyan at 15%). Used for active states, the narrative left border, section headers that need emphasis.

No borders use opaque colors. No borders use neutral gray. Every line on the page has a cyan tint, which creates the luminous quality without resorting to `box-shadow` glows or CSS filters.

### The single exception

The radar nav element itself gets a `box-shadow: 0 0 20px var(--accent-faint)` to make it float slightly. This is the only glow on the entire page.

---

## 6. Full Page Layout -- ASCII Wireframe

The page is single-column, max-width 900px (narrower than editorial's 1200px to increase information density and reduce eye travel).

```
+-----------------------------------------------------------------------+
|  [coordinate grid bg, 40px squares, cyan at 4% opacity]               |
|                                                                       |
|  .radar-container (max-width: 900px, margin: 0 auto, padding: 3rem)  |
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 1: TITLE                              data-radar-section=0 |
|  |                                                                   |
|  |  [h1] Project Name                                                |
|  |  font: Space Grotesk, 2.25rem, 700                                |
|  |  color: var(--on-surface) (#e2e8f0)                               |
|  |  letter-spacing: -0.03em                                          |
|  |  margin-bottom: 0.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 2: LINKS                              data-radar-section=1 |
|  |                                                                   |
|  |  [mono 0.75rem] github.com/user/repo   [mono 0.75rem] project.com |
|  |  color: var(--accent) (#22d3ee)                                   |
|  |  gap: 1.5rem, flex row                                            |
|  |  underline on hover (text-decoration-color: var(--accent-dim))    |
|  |  margin-bottom: 2rem                                              |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 3: SCREENSHOT                         data-radar-section=2 |
|  |                                                                   |
|  |  +---------------------------------------------------------------+|
|  |  | Browser chrome bar                                            ||
|  |  | bg: var(--surface-high) (#0b1120)                             ||
|  |  | dots: #ff5f57, #febc2e, #28c840 (same as base)               ||
|  |  | border-bottom: 1px solid var(--ghost)                         ||
|  |  +---------------------------------------------------------------+|
|  |  |                                                               ||
|  |  |                    [screenshot image]                          ||
|  |  |                    max-height: 24rem                           ||
|  |  |                                                               ||
|  |  +---------------------------------------------------------------+|
|  |  border: 1px solid var(--ghost)                                   |
|  |  border-radius: var(--radius-md) (4px)                            |
|  |  margin-bottom: 2rem                                              |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 4: NARRATIVE                          data-radar-section=3 |
|  |                                                                   |
|  |  border-left: 2px solid var(--accent) (#22d3ee)                   |
|  |  padding-left: 1rem                                               |
|  |                                                                   |
|  |  "Project description text flows here. It uses the body font      |
|  |   at 1rem with 1.7 line-height for comfortable reading on dark    |
|  |   backgrounds."                                                   |
|  |                                                                   |
|  |  font: Inter, 1rem, 400                                           |
|  |  color: var(--on-surface) (#e2e8f0)                               |
|  |  max-width: 65ch (for readability)                                |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 5: STATS GRID                         data-radar-section=4 |
|  |                                                                   |
|  |  [section label] METRICS                                          |
|  |  font: IBM Plex Mono, 9px, uppercase, tracking 0.1em              |
|  |  color: var(--accent) (#22d3ee)                                   |
|  |  margin-bottom: 0.75rem                                           |
|  |                                                                   |
|  |  +----------+ +----------+ +----------+ +----------+ +----------+ |
|  |  | DURATION | | SESSIONS | | LOC      | | FILES    | | TOKENS   | |
|  |  |          | |          | |          | |          | |          | |
|  |  | 12.4h    | | 8        | | 4.2k     | | 47       | | 1.2M     | |
|  |  +----------+ +----------+ +----------+ +----------+ +----------+ |
|  |                                                                   |
|  |  Grid: repeat(auto-fit, minmax(140px, 1fr))                       |
|  |  Each card:                                                       |
|  |    bg: var(--surface-lowest) (#1a2540)                            |
|  |    border: 1px solid var(--ghost) (cyan at 8%)                    |
|  |    border-radius: var(--radius-sm) (2px)                          |
|  |    padding: 1rem                                                  |
|  |    Label: mono 9px, uppercase, var(--on-surface-variant)          |
|  |    Value: Space Grotesk, 1.5rem, 700, var(--on-surface)           |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 6: WORK TIMELINE                      data-radar-section=5 |
|  |                                                                   |
|  |  [section label] WORK TIMELINE                                    |
|  |  (same mono/cyan label treatment)                                 |
|  |                                                                   |
|  |  +---------------------------------------------------------------+|
|  |  |  [React hydrated bar chart]                                   ||
|  |  |  data-work-timeline='{{ sessionsJson }}'                      ||
|  |  |                                                               ||
|  |  |  Chart colors:                                                ||
|  |  |    bar fill: var(--accent) (#22d3ee)                          ||
|  |  |    bar fill (agent): var(--accent-dim)                        ||
|  |  |    axis text: var(--on-surface-variant)                       ||
|  |  |    grid lines: var(--ghost)                                   ||
|  |  |    background: transparent                                    ||
|  |  |                                                               ||
|  |  +---------------------------------------------------------------+|
|  |  bg: var(--surface-lowest)                                        |
|  |  border: 1px solid var(--ghost)                                   |
|  |  border-radius: var(--radius-sm)                                  |
|  |  padding: 1rem                                                    |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 7: GROWTH CHART                       data-radar-section=6 |
|  |                                                                   |
|  |  [section label] GROWTH                                           |
|  |                                                                   |
|  |  +---------------------------------------------------------------+|
|  |  |  [React hydrated line chart]                                  ||
|  |  |  data-growth-chart='{{ growthJson }}'                         ||
|  |  |                                                               ||
|  |  |  Chart colors:                                                ||
|  |  |    LOC line: var(--accent) (#22d3ee), 2px stroke              ||
|  |  |    Files line: var(--green) (#34d399), 2px stroke             ||
|  |  |    Fill under line: respective color at 5% opacity            ||
|  |  |    Axis: var(--on-surface-variant)                            ||
|  |  |    Grid: var(--ghost)                                         ||
|  |  |                                                               ||
|  |  +---------------------------------------------------------------+|
|  |  Same card treatment as work timeline                             |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 8: TWO-COLUMN                         data-radar-section=7 |
|  |                                                                   |
|  |  +-----------------------------+ +-------------------------------+|
|  |  | KEY DECISIONS               | | SOURCE BREAKDOWN              ||
|  |  | [section label, cyan]       | | [section label, cyan]         ||
|  |  |                             | |                               ||
|  |  | * Decision title            | | Tool        Sessions          ||
|  |  |   Description text...       | | ─────────── ────────          ||
|  |  |                             | | cursor       5                ||
|  |  | * Decision title            | | windsurf     2                ||
|  |  |   Description text...       | | claude-code  1                ||
|  |  |                             | |                               ||
|  |  | * Decision title            | | Table header:                 ||
|  |  |   Description text...       | |   mono 9px, var(--accent)     ||
|  |  |                             | | Row separator:                ||
|  |  | Bullet: var(--accent)       | |   1px solid var(--ghost)      ||
|  |  | Title: 600, --on-surface    | | Value: mono, --on-surface     ||
|  |  | Desc: 400, --on-surface-var | |                               ||
|  |  +-----------------------------+ +-------------------------------+|
|  |                                                                   |
|  |  Grid: 1fr 1fr, gap: 1.5rem                                      |
|  |  On mobile: stacks to single column                               |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 9: PHASE TIMELINE                     data-radar-section=8 |
|  |                                                                   |
|  |  [section label] PHASES                                           |
|  |                                                                   |
|  |  |                                                                |
|  |  o-- Phase 1: Foundation                                          |
|  |  |   Set up project scaffolding and core data model               |
|  |  |                                                                |
|  |  o-- Phase 2: Core Features                                       |
|  |  |   Implemented parsing, rendering, and preview                  |
|  |  |                                                                |
|  |  o-- Phase 3: Polish                                              |
|  |      Final bug fixes and performance tuning                       |
|  |                                                                   |
|  |  Timeline line: 2px solid var(--ghost)                            |
|  |  Dot: 8px circle, var(--accent) fill                              |
|  |  Dot glow: box-shadow: 0 0 0 3px var(--accent-dim)               |
|  |  Phase title: Space Grotesk, 0.875rem, 600, --on-surface         |
|  |  Phase desc: Inter, 0.8125rem, 400, --on-surface-variant         |
|  |  padding-left: 1.25rem                                            |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 10: SKILLS                            data-radar-section=9 |
|  |                                                                   |
|  |  [section label] TECHNOLOGIES                                     |
|  |                                                                   |
|  |  [React] [TypeScript] [Liquid] [CSS] [PostgreSQL] [Phoenix]       |
|  |                                                                   |
|  |  Chip style:                                                      |
|  |    bg: var(--accent-faint) (cyan at 6%)                           |
|  |    color: var(--accent) (#22d3ee)                                 |
|  |    font: IBM Plex Mono, 11px                                      |
|  |    border: 1px solid var(--ghost)                                 |
|  |    border-radius: var(--radius-sm) (2px)                          |
|  |    padding: 0.125rem 0.5rem                                       |
|  |  gap: 0.375rem                                                    |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 11: FEATURED SESSIONS                data-radar-section=10 |
|  |                                                                   |
|  |  [section label] SESSIONS                                         |
|  |  [meta] 8 total                                                   |
|  |                                                                   |
|  |  +-----------------------------+ +-------------------------------+|
|  |  | [2px top bar, cyan]         | | [2px top bar, green]          ||
|  |  |                             | |                               ||
|  |  | Session Title Here          | | Another Session Title         ||
|  |  | 1.2h / 24 turns / 340 loc  | | 0.8h / 12 turns / 180 loc    ||
|  |  |                             | |                               ||
|  |  | [React] [CSS]               | | [TypeScript] [SQL]            ||
|  |  +-----------------------------+ +-------------------------------+|
|  |  +-----------------------------+ +-------------------------------+|
|  |  | [2px top bar, violet]       | | [2px top bar, cyan]           ||
|  |  |                             | |                               ||
|  |  | Third Session Title         | | Fourth Session Title          ||
|  |  | 2.1h / 42 turns / 890 loc  | | 0.5h / 8 turns / 60 loc      ||
|  |  |                             | |                               ||
|  |  | [Elixir] [Phoenix]          | | [Docker]                      ||
|  |  +-----------------------------+ +-------------------------------+|
|  |                                                                   |
|  |  Grid: repeat(2, 1fr), gap: 0.75rem                              |
|  |  Card:                                                            |
|  |    bg: var(--surface-lowest) (#1a2540)                            |
|  |    border: 1px solid var(--ghost)                                 |
|  |    border-radius: var(--radius-sm) (2px)                          |
|  |    padding: 1rem                                                  |
|  |  Top bar: 2px height, cycling cyan/green/violet                   |
|  |  Title: Space Grotesk, 0.8125rem, 600, --on-surface              |
|  |  Meta: mono 0.75rem, --on-surface-variant                        |
|  |  Hover: border-color transitions to var(--accent-dim) (150ms)     |
|  |  margin-bottom: 2.5rem                                            |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  +-------------------------------------------------------------------+
|  | SECTION 12: FOOTER                           data-radar-section=11 |
|  |                                                                   |
|  |  ─────────────────────────── (1px var(--ghost))                   |
|  |                                                                   |
|  |  [center] BUILT WITH HEYI.AM                                      |
|  |  font: IBM Plex Mono, 10px, uppercase, tracking 0.05em           |
|  |  color: var(--on-surface-variant)                                 |
|  |  padding-top: 1.5rem                                              |
|  |                                                                   |
|  +-------------------------------------------------------------------+
|                                                                       |
|  (bottom padding: 3rem)                                              |
|                                                                       |
+-----------------------------------------------------------------------+
|                                                                       |
|                                              +-------------------+    |
|                                              |  RADAR NAV        |    |
|                                              |  (fixed,          |    |
|                                              |   bottom: 2rem,   |    |
|                                              |   right: 2rem)    |    |
|                                              |  120x120px circle |    |
|                                              |  12 dots around   |    |
|                                              |  edge, sweep line |    |
|                                              +-------------------+    |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## 7. Section Label Treatment

Every section (except title, links, and footer) gets a consistent label above it. This is a key Radar differentiator -- sections are labeled like instrument readouts.

```css
.radar .radar-label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.radar .radar-label::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 1px;  /* square-ish, not circular */
}
```

The small square dot before each label reinforces the "instrument indicator" metaphor. It is a filled cyan square, not a circle -- circles are reserved for the radar nav dots.

---

## 8. Typography Specification

| Role                   | Font            | Size     | Weight | Color                  | Tracking   |
|------------------------|-----------------|----------|--------|------------------------|------------|
| Project title (h1)     | Space Grotesk   | 2.25rem  | 700    | --on-surface           | -0.03em    |
| Section label          | IBM Plex Mono   | 9px      | 500    | --accent               | 0.1em      |
| Section header meta    | IBM Plex Mono   | 9px      | 400    | --on-surface-variant   | 0.05em     |
| Narrative body         | Inter           | 1rem     | 400    | --on-surface           | 0          |
| Stat value             | Space Grotesk   | 1.5rem   | 700    | --on-surface           | 0          |
| Stat label             | IBM Plex Mono   | 9px      | 400    | --on-surface-variant   | 0.05em     |
| Phase title            | Space Grotesk   | 0.875rem | 600    | --on-surface           | 0          |
| Phase description      | Inter           | 0.8125rem| 400    | --on-surface-variant   | 0          |
| Chip text              | IBM Plex Mono   | 11px     | 400    | --accent               | 0          |
| Session card title     | Space Grotesk   | 0.8125rem| 600    | --on-surface           | 0          |
| Session card meta      | Inter           | 0.75rem  | 400    | --on-surface-variant   | 0          |
| Link text              | IBM Plex Mono   | 0.75rem  | 400    | --accent               | 0          |
| Footer text            | IBM Plex Mono   | 10px     | 400    | --on-surface-variant   | 0.05em     |
| Source table header    | IBM Plex Mono   | 9px      | 400    | --accent               | 0.05em     |
| Source table cell      | IBM Plex Mono   | 0.8125rem| 400    | --on-surface           | 0          |
| Decision bullet title  | Space Grotesk   | 0.875rem | 600    | --on-surface           | 0          |
| Decision body          | Inter           | 0.8125rem| 400    | --on-surface-variant   | 0          |

### Dark-mode readability rules

- Body text uses `#e2e8f0` (slate-200) not pure white. Pure white on `#0f172a` creates too much contrast for sustained reading.
- Line-height for body text is 1.7 (not 1.5 as in light templates). Dark backgrounds need more vertical breathing room.
- Secondary text at `#64748b` (slate-500) passes WCAG AA on `#0f172a` at 4.6:1.

---

## 9. Animation Specification

Radar uses minimal, purposeful animation. No entrance animations. No hover lifts. No shimmer.

| Element               | Property        | Duration | Easing         | Trigger           |
|-----------------------|-----------------|----------|----------------|-------------------|
| Radar sweep line      | transform:rotate| 12s      | linear         | Infinite, on load |
| Radar dot activation  | background-color, box-shadow | 200ms | ease-out | IntersectionObserver |
| Session card hover    | border-color    | 150ms    | ease            | :hover            |
| Link hover            | text-decoration-color | 150ms | ease       | :hover            |

### The sweep line

```css
.radar-nav__sweep {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    var(--accent) 0%,
    transparent 12%
  );
  opacity: 0.08;
  animation: radar-spin 12s linear infinite;
}

@keyframes radar-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

The sweep is extremely subtle -- 8% opacity. It is there to reward close observation, not to demand attention. At a glance it looks like a static radial gradient. Only on sustained viewing does the rotation become apparent.

### What does NOT animate

- No section entrance animations (that is Showcase's territory)
- No stat counter animations
- No parallax scrolling
- No hover translateY on cards
- No pulse/glow keyframes on any element

---

## 10. Responsive Behavior

### Breakpoints

| Viewport    | Changes                                                          |
|-------------|------------------------------------------------------------------|
| > 900px     | Full layout as specified, radar nav visible                      |
| 768-900px   | Max-width becomes 100%, padding becomes 1.5rem                   |
| < 768px     | Two-col stacks to one-col, session grid to one-col, radar hidden |

### Mobile-specific

```css
@media (max-width: 768px) {
  .radar .two-col { grid-template-columns: 1fr; }
  .radar .session-grid { grid-template-columns: 1fr; }
  .radar .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .radar-nav { display: none; }
  .heyiam-project.radar { padding: 1.5rem 1rem; }
}
```

---

## 11. Liquid Template Structure

The template follows the same partial-reuse pattern as kinetic/terminal. Section order matches the wireframe above.

```liquid
<div class="heyiam-project radar"
     data-render-version="2"
     data-template="radar"
     {% if sessionBaseUrl %} data-session-base-url="{{ sessionBaseUrl }}"{% endif %}
     data-username="{{ user.username }}"
     data-project-slug="{{ project.slug }}">

  {%- comment -%} Title {%- endcomment -%}
  <div data-radar-section="0">
    <h1 class="radar-title" data-editable="title">{{ project.title }}</h1>
  </div>

  {%- comment -%} Links {%- endcomment -%}
  <div data-radar-section="1">
    {% render 'partials/_links', project: project %}
  </div>

  {%- comment -%} Screenshot {%- endcomment -%}
  <div data-radar-section="2">
    {% render 'partials/_screenshot', project: project %}
  </div>

  {%- comment -%} Narrative {%- endcomment -%}
  <div data-radar-section="3" class="radar-narrative">
    {% render 'partials/_narrative', narrative: project.narrative %}
  </div>

  {%- comment -%} Stats {%- endcomment -%}
  <div data-radar-section="4">
    <div class="radar-label">Metrics</div>
    {% render 'partials/_stats', project: project, durationLabel: durationLabel, efficiencyMultiplier: efficiencyMultiplier %}
  </div>

  {%- comment -%} Work Timeline {%- endcomment -%}
  <div data-radar-section="5">
    <div class="radar-label">Work Timeline</div>
    {% render 'partials/_work-timeline', sessionsJson: sessionsJson %}
  </div>

  {%- comment -%} Growth Chart {%- endcomment -%}
  <div data-radar-section="6">
    <div class="radar-label">Growth</div>
    {% render 'partials/_growth-chart', project: project, growthJson: growthJson %}
  </div>

  {%- comment -%} Two-column: decisions + sources {%- endcomment -%}
  <div data-radar-section="7" class="two-col">
    <div>
      <div class="radar-label">Key Decisions</div>
      {% render 'partials/_key-decisions', arc: arc %}
    </div>
    <div>
      <div class="radar-label">Source Breakdown</div>
      {% render 'partials/_source-breakdown', sourceCounts: sourceCounts %}
    </div>
  </div>

  {%- comment -%} Phase timeline {%- endcomment -%}
  <div data-radar-section="8">
    <div class="radar-label">Phases</div>
    {% render 'partials/_phases', arc: arc %}
  </div>

  {%- comment -%} Skills {%- endcomment -%}
  <div data-radar-section="9">
    <div class="radar-label">Technologies</div>
    {% render 'partials/_skills', skills: project.skills %}
  </div>

  {%- comment -%} Session cards {%- endcomment -%}
  <div data-radar-section="10">
    {% render 'partials/_session-cards', featuredSessions: featuredSessions, sessionBaseUrl: sessionBaseUrl, totalSessionCount: sessions.size %}
  </div>

  {%- comment -%} Footer {%- endcomment -%}
  <div data-radar-section="11">
    {% render 'partials/_footer', sessionBaseUrl: sessionBaseUrl %}
  </div>

  {%- comment -%} Radar navigation element {%- endcomment -%}
  <nav class="radar-nav" aria-label="Section navigation">
    <div class="radar-nav__ring"></div>
    <div class="radar-nav__sweep"></div>
    <div class="radar-nav__center"></div>
    {% for i in (0..11) %}
    <button class="radar-nav__dot" data-radar-dot="{{ i }}"
            aria-label="Navigate to section {{ i | plus: 1 }}"></button>
    {% endfor %}
  </nav>

</div>

<script>
(function() {
  var nav = document.querySelector('.radar-nav');
  if (!nav) return;
  var sections = document.querySelectorAll('[data-radar-section]');
  var dots = document.querySelectorAll('[data-radar-dot]');

  // Position dots around the circle
  dots.forEach(function(dot, i) {
    var angle = (i / 12) * 2 * Math.PI - Math.PI / 2; // start at 12 o'clock
    var r = 54; // radius from center (120/2 - 6 padding)
    dot.style.left = (60 + r * Math.cos(angle) - 3) + 'px';
    dot.style.top  = (60 + r * Math.sin(angle) - 3) + 'px';
  });

  // IntersectionObserver for dot activation
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      var idx = entry.target.getAttribute('data-radar-section');
      var dot = nav.querySelector('[data-radar-dot="' + idx + '"]');
      if (dot) {
        dot.classList.toggle('radar-nav__dot--active', entry.isIntersecting);
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(function(s) { observer.observe(s); });

  // Click to scroll
  dots.forEach(function(dot) {
    dot.addEventListener('click', function() {
      var idx = this.getAttribute('data-radar-dot');
      var target = document.querySelector('[data-radar-section="' + idx + '"]');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
</script>
```

---

## 12. CSS for the Radar Nav Element

```css
.radar-nav {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  z-index: 100;
  box-shadow: 0 0 20px var(--accent-faint);
}

.radar-nav__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(34, 211, 238, 0.3);
  background: radial-gradient(
    circle at center,
    var(--accent-faint) 0%,
    transparent 70%
  );
}

.radar-nav__sweep {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(34, 211, 238, 0.25) 0%,
    transparent 12%
  );
  opacity: 0.08;
  animation: radar-spin 12s linear infinite;
}

.radar-nav__center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: var(--accent);
}

.radar-nav__dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--outline);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background-color 200ms ease-out, box-shadow 200ms ease-out;
}

.radar-nav__dot--active {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-dim);
}

.radar-nav__dot:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@keyframes radar-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .radar-nav { display: none; }
}
```

---

## 13. Template Registration

Add to `BUILT_IN_TEMPLATES` in `cli/src/render/templates.ts`:

```typescript
{ name: 'radar', description: 'Dark HUD theme with cyan accents and radial navigation', accent: '#22d3ee', mode: 'dark' },
```

---

## 14. Accessibility Notes

- All radar nav dots have `aria-label` attributes describing their target section.
- The radar nav uses `<nav>` with `aria-label="Section navigation"`.
- Dots are `<button>` elements (not divs), so they are keyboard-focusable.
- `:focus-visible` outlines are provided for keyboard navigation.
- The sweep animation respects `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .radar-nav__sweep { animation: none; }
}
```

- Color contrast ratios:
  - Primary text (#e2e8f0 on #0f172a): 12.1:1 (AAA)
  - Secondary text (#64748b on #0f172a): 4.6:1 (AA)
  - Accent text (#22d3ee on #0f172a): 9.1:1 (AAA)
  - Accent text (#22d3ee on #1a2540): 7.2:1 (AAA)

---

## 15. Implementation Checklist

1. Create `cli/src/render/templates/radar/project.liquid` (from section 11)
2. Create `cli/src/render/templates/radar/session.liquid` (mirror terminal session structure with radar tokens)
3. Add radar CSS block to `styles.css` scoped under `.heyiam-project.radar`
4. Add radar nav CSS (section 12)
5. Register template in `templates.ts` (section 13)
6. Add `prefers-reduced-motion` media query
7. Test chart hydration works with dark tokens (charts read CSS custom properties)
8. Test responsive breakpoints (768px collapse, radar nav hide)
9. Verify WCAG contrast ratios match spec
