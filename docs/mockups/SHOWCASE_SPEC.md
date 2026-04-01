# Showcase Template -- Visual Mockup Specification

Template: **Showcase** | Mode: **Dark** | Accent: **Violet/Indigo (#818cf8)**
Reference: Vercel/Linear dark mode -- cinematic, scroll-driven reveals, restrained motion

---

## Design Tokens

```css
[data-template="showcase"] {
  /* Backgrounds */
  --bg:             #09090b;          /* page background (zinc-950) */
  --surface:        #111113;          /* card surface */
  --surface-2:      #18181b;          /* elevated surface (zinc-900) */
  --surface-3:      #27272a;          /* hover state surface */

  /* Borders */
  --border:         rgba(255,255,255,0.06);
  --border-accent:  rgba(129,140,248,0.2);

  /* Text */
  --text:           #fafafa;          /* primary text */
  --text-2:         rgba(255,255,255,0.65);  /* secondary */
  --text-3:         rgba(255,255,255,0.4);   /* tertiary */
  --text-muted:     rgba(255,255,255,0.25);  /* ghost text */

  /* Accent (violet/indigo-400) */
  --accent:         #818cf8;
  --accent-dim:     rgba(129,140,248,0.1);
  --accent-mid:     rgba(129,140,248,0.15);
  --accent-glow:    rgba(129,140,248,0.06);  /* subtle card hover glow */

  /* Semantic */
  --green:          #4ade80;
  --green-dim:      rgba(74,222,128,0.1);

  /* Typography */
  --font-display:   'Space Grotesk', sans-serif;
  --font-body:      'Inter', sans-serif;
  --font-mono:      'JetBrains Mono', monospace;

  /* Radii */
  --radius-sm:      4px;
  --radius-md:      8px;
  --radius-lg:      12px;

  /* Motion -- the showcase motion scale */
  --ease-out:       cubic-bezier(0.16, 1, 0.3, 1);  /* dramatic deceleration */
  --ease-in-out:    cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro:      150ms;   /* hovers, color shifts */
  --dur-section:    600ms;   /* section entrance */
  --dur-chart:      800ms;   /* chart animations */
  --dur-slow:       1200ms;  /* line draw, counter */
}
```

---

## Typography Scale

| Element              | Font             | Size              | Weight | Color      | Letter-spacing |
|----------------------|------------------|-------------------|--------|------------|----------------|
| Project title (h1)   | --font-display   | 2.25rem (36px)    | 700    | --text     | -0.02em        |
| Section header (h3)  | --font-display   | 1rem (16px)       | 600    | --text     | 0              |
| Section meta label   | --font-mono      | 9px               | 400    | --text-3   | 0.08em (caps)  |
| Body text            | --font-body      | 0.9375rem (15px)  | 400    | --text-2   | 0              |
| Narrative text       | --font-body      | 1.0625rem (17px)  | 400    | --text-2   | 0              |
| Stat value           | --font-display   | 2rem (32px)       | 700    | --text     | -0.02em        |
| Stat label           | --font-mono      | 9px               | 400    | --text-3   | 0.08em (caps)  |
| Chip text            | --font-mono      | 11px              | 500    | --accent   | 0.02em         |
| Link text            | --font-mono      | 0.8125rem (13px)  | 400    | --accent   | 0              |
| Footer text          | --font-mono      | 11px              | 400    | --text-3   | 0.04em         |
| Card title           | --font-display   | 0.875rem (14px)   | 600    | --text     | 0              |
| Card meta            | --font-mono      | 11px              | 400    | --text-3   | 0              |

---

## Page Container

```
max-width: 800px
margin: 0 auto
padding: 3rem 1.5rem 4rem
```

Narrower than kinetic (which uses 1200px) -- showcase is a single-column reading experience.
The narrower column creates more whitespace and a more cinematic, editorial feel.

---

## IntersectionObserver System

### Script (inline, at end of template)

```html
<script>
(function() {
  var sections = document.querySelectorAll('.sc-section');
  if (!sections.length) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  sections.forEach(function(s) { observer.observe(s); });
})();
</script>
```

### How `.visible` works

Every section wrapper gets class `sc-section`. In CSS:

```css
.sc-section {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity var(--dur-section) var(--ease-out),
              transform var(--dur-section) var(--ease-out);
}
.sc-section.visible {
  opacity: 1;
  transform: translateY(0);
}
```

The first section (title) starts visible (no animation -- it is above the fold).
Each subsequent section fades up as 15% of it enters the viewport (minus 60px bottom margin to trigger slightly early).

### Stagger system for child elements

Some sections contain multiple children that should stagger. Use `transition-delay` on direct children:

```css
.sc-section.visible > .sc-stagger:nth-child(1) { transition-delay: 0ms; }
.sc-section.visible > .sc-stagger:nth-child(2) { transition-delay: 80ms; }
.sc-section.visible > .sc-stagger:nth-child(3) { transition-delay: 160ms; }
.sc-section.visible > .sc-stagger:nth-child(4) { transition-delay: 240ms; }
.sc-section.visible > .sc-stagger:nth-child(5) { transition-delay: 320ms; }
.sc-section.visible > .sc-stagger:nth-child(6) { transition-delay: 400ms; }

.sc-stagger {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 400ms var(--ease-out), transform 400ms var(--ease-out);
}
.sc-section.visible > .sc-stagger {
  opacity: 1;
  transform: translateY(0);
}
```

### prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  .sc-section,
  .sc-stagger {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
```

---

## Full Page Wireframe

```
+------------------------------------------------------------------------+
| --bg: #09090b                                                          |
|                                                                        |
|   +------------------------------------------------------------------+ |
|   |  max-width: 800px, centered                                     | |
|   |                                                                  | |
|   |  SECTION 1: TITLE  (no scroll animation -- above the fold)      | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  heyi.am CLI                                                     | |
|   |  ^^^^^^^^^^^^^^^^^^^                                             | |
|   |  h1, Space Grotesk, 2.25rem, 700, --text                        | |
|   |  margin-bottom: 0.5rem                                           | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 2: LINKS  (.sc-section, fade-up)                       | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  [GH icon] github.com/user/repo   [link icon] heyiam.com        | |
|   |  JetBrains Mono, 13px, --accent                                 | |
|   |  gap: 1rem between links                                        | |
|   |  margin-bottom: 2rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 3: SCREENSHOT  (.sc-section, fade-up)                   | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  +------------------------------------------------------------+ | |
|   |  | [*] [*] [*]   browser chrome bar                           | | |
|   |  | bg: --surface-2, border-bottom: --border                   | | |
|   |  +------------------------------------------------------------+ | |
|   |  |                                                            | | |
|   |  |             screenshot image                               | | |
|   |  |             max-height: 28rem                              | | |
|   |  |                                                            | | |
|   |  +------------------------------------------------------------+ | |
|   |  border: 1px solid --border                                      | |
|   |  border-radius: --radius-lg (12px)                               | |
|   |  overflow: hidden                                                | |
|   |  margin-bottom: 2.5rem                                           | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 4: NARRATIVE  (.sc-section, fade-up)                    | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  |  "Project description text goes here. Multiple              | |
|   |  |   sentences forming the narrative summary of                | |
|   |  |   what was built and why."                                  | |
|   |  ^                                                               | |
|   |  3px left border in --accent (#818cf8)                           | |
|   |  padding-left: 1rem                                              | |
|   |  font: Inter, 17px, 400, --text-2                                | |
|   |  line-height: 1.7                                                | |
|   |  margin-bottom: 3rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 5: STATS GRID  (.sc-section, stagger children)          | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  No section header -- stats speak for themselves.                | |
|   |                                                                  | |
|   |  +------------+  +------------+  +------------+                  | |
|   |  | DURATION   |  | SESSIONS   |  | LINES      |                 | |
|   |  | 14h 32m    |  | 23         |  | 8,421      |                 | |
|   |  +------------+  +------------+  +------------+                  | |
|   |  +------------+  +------------+  +------------+                  | |
|   |  | FILES      |  | TOKENS     |  | EFFICIENCY |                 | |
|   |  | 156        |  | 1.2M       |  | 3.2x       |                 | |
|   |  +------------+  +------------+  +------------+                  | |
|   |                                                                  | |
|   |  Grid: 3 columns, gap: 0.75rem                                  | |
|   |  Each stat card:                                                 | |
|   |    bg: --surface                                                 | |
|   |    border: 1px solid --border                                    | |
|   |    border-radius: --radius-md                                    | |
|   |    padding: 1.25rem                                              | |
|   |    label: JetBrains Mono, 9px, uppercase, --text-3               | |
|   |    value: Space Grotesk, 2rem, 700, --text                       | |
|   |  Stagger: each card is .sc-stagger, 80ms apart                   | |
|   |                                                                  | |
|   |  COUNTER ANIMATION:                                              | |
|   |    When .visible is added, stat values count up from 0            | |
|   |    Duration: 1200ms (--dur-slow)                                 | |
|   |    Easing: --ease-out (fast start, slow finish)                  | |
|   |    Implementation: data-count-to="8421" attribute on each        | |
|   |    .stat-card__value. Script reads the target, animates          | |
|   |    using requestAnimationFrame. Integers use Math.round,         | |
|   |    durations format as "Xh Ym", tokens format with suffix.       | |
|   |  margin-bottom: 3rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 6: WORK TIMELINE  (.sc-section, fade-up)                | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  +------------------------------------------------------------+ | |
|   |  | bg: --surface, border: --border, radius: --radius-md       | | |
|   |  | padding: 1.5rem                                            | | |
|   |  |                                                            | | |
|   |  | "Work timeline"        "sessions over time"                | | |
|   |  |  ^ h3, display, 1rem    ^ mono, 9px, --text-3             | | |
|   |  |                                                            | | |
|   |  | [React-hydrated bar chart]                                 | | |
|   |  |                                                            | | |
|   |  |  |         ___                                             | | |
|   |  |  |    ___ |   |      ___                                   | | |
|   |  |  |   |   ||   | ___ |   | ___                              | | |
|   |  |  |   |   ||   ||   ||   ||   |                             | | |
|   |  |  +---+---++---++---++---++---+--                           | | |
|   |  |    Jan   Feb   Mar   Apr  May                              | | |
|   |  |                                                            | | |
|   |  | Bar colors: --accent (#818cf8), opacity 0.8                | | |
|   |  | Bar hover: opacity 1.0, slight scale(1.02)                | | |
|   |  | Axis labels: --font-mono, 10px, --text-3                  | | |
|   |  | Grid lines: --border (subtle horizontal dashes)            | | |
|   |  +------------------------------------------------------------+ | |
|   |                                                                  | |
|   |  BAR GROWTH ANIMATION:                                           | |
|   |    Triggered when .visible is added to parent .sc-section        | |
|   |    Each bar starts at height: 0, scaleY(0) from bottom          | |
|   |    Transition: transform 800ms var(--ease-out)                   | |
|   |    Stagger: each bar delays 50ms after the previous             | |
|   |    transform-origin: bottom center                               | |
|   |    CSS approach: bars have .sc-bar class                         | |
|   |      .sc-bar { transform: scaleY(0); transform-origin: bottom; } | |
|   |      .visible .sc-bar { transform: scaleY(1);                   | |
|   |        transition: transform 800ms var(--ease-out); }            | |
|   |      .visible .sc-bar:nth-child(1) { transition-delay: 0ms; }   | |
|   |      .visible .sc-bar:nth-child(2) { transition-delay: 50ms; }  | |
|   |      ... (up to 20 bars)                                        | |
|   |    React component reads .visible from closest .sc-section       | |
|   |  margin-bottom: 2rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 7: GROWTH CHART  (.sc-section, fade-up)                 | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  +------------------------------------------------------------+ | |
|   |  | bg: --surface, border: --border, radius: --radius-md       | | |
|   |  | padding: 1.5rem                                            | | |
|   |  |                                                            | | |
|   |  | "Project growth"       "cumulative LOC"                    | | |
|   |  |  ^ h3, display, 1rem    ^ mono, 9px, --text-3             | | |
|   |  |                                                            | | |
|   |  | [React-hydrated line chart]                                | | |
|   |  |                                                            | | |
|   |  |           ___..---''''                                     | | |
|   |  |       .--'                                                 | | |
|   |  |     .'                                                     | | |
|   |  |   .'                                                       | | |
|   |  |  /                                                         | | |
|   |  | +------+------+------+------+                              | | |
|   |  |   Jan    Feb    Mar    Apr                                 | | |
|   |  |                                                            | | |
|   |  | Line color: --accent (#818cf8), stroke-width: 2            | | |
|   |  | Fill area: --accent-dim (10% opacity) below line           | | |
|   |  | Axis labels: --font-mono, 10px, --text-3                  | | |
|   |  +------------------------------------------------------------+ | |
|   |                                                                  | |
|   |  LINE DRAW ANIMATION:                                            | |
|   |    Triggered when .visible is added to parent .sc-section        | |
|   |    Uses SVG stroke-dasharray + stroke-dashoffset technique       | |
|   |    1. Set stroke-dasharray to path total length                  | |
|   |    2. Set stroke-dashoffset to path total length (hidden)        | |
|   |    3. On .visible, transition stroke-dashoffset to 0             | |
|   |    Duration: 1200ms (--dur-slow)                                 | |
|   |    Easing: --ease-in-out                                         | |
|   |    The fill area fades in AFTER line completes:                   | |
|   |      opacity 0 -> 1, delay: 1000ms, duration: 400ms             | |
|   |    React component implementation:                               | |
|   |      - useEffect watches for .visible on ancestor               | |
|   |      - Sets CSS custom property --dash-offset on the path        | |
|   |      - Or uses class toggle internally                           | |
|   |  margin-bottom: 3rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 8: TWO-COLUMN  (.sc-section, fade-up)                   | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  grid: 2 columns, gap: 1rem                                     | |
|   |                                                                  | |
|   |  +---------------------------+ +---------------------------+     | |
|   |  | KEY DECISIONS             | | SOURCE BREAKDOWN          |     | |
|   |  | bg: --surface             | | bg: --surface             |     | |
|   |  | border: --border          | | border: --border          |     | |
|   |  | radius: --radius-md       | | radius: --radius-md       |     | |
|   |  | padding: 1.25rem          | | padding: 1.25rem          |     | |
|   |  |                           | |                           |     | |
|   |  | "Key decisions"  "signal" | | "Source breakdown" "prov" |     | |
|   |  |                           | |                           |     | |
|   |  | +- - - - - - - - - - -+  | | Source       Count        |     | |
|   |  | | Decision title       |  | | ----------  ------       |     | |
|   |  | | Description text     |  | | Claude Code   14         |     | |
|   |  | +- - - - - - - - - - -+  | | Cursor         8         |     | |
|   |  | | Decision title       |  | | Manual         3         |     | |
|   |  | | Description text     |  | |                           |     | |
|   |  | +- - - - - - - - - - -+  | | table text: --font-mono   |     | |
|   |  | | Decision title       |  | | 13px, --text-2            |     | |
|   |  | +- - - - - - - - - - -+  | | header: 9px, --text-3     |     | |
|   |  |                           | | row border: --border      |     | |
|   |  | Decision title:           | |                           |     | |
|   |  |   display, 14px, 600,     | |                           |     | |
|   |  |   --text, mb: 0.25rem     | |                           |     | |
|   |  | Description:              | |                           |     | |
|   |  |   body, 13px, 400,        | |                           |     | |
|   |  |   --text-2                | |                           |     | |
|   |  | Divider between items:    | |                           |     | |
|   |  |   1px solid --border      | |                           |     | |
|   |  |   margin: 0.75rem 0       | |                           |     | |
|   |  +---------------------------+ +---------------------------+     | |
|   |                                                                  | |
|   |  Both columns are .sc-stagger children (left=0ms, right=80ms)    | |
|   |  margin-bottom: 3rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 9: PHASE TIMELINE  (.sc-section, stagger children)      | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  +------------------------------------------------------------+ | |
|   |  | bg: --surface, border: --border, radius: --radius-md       | | |
|   |  | padding: 1.5rem                                            | | |
|   |  |                                                            | | |
|   |  | "Project phases"         "timeline"                        | | |
|   |  |                                                            | | |
|   |  |  [o]--- Phase 1: Foundation                                | | |
|   |  |  |      "Set up the project structure and..."              | | |
|   |  |  |                                                         | | |
|   |  |  [o]--- Phase 2: Core Features                             | | |
|   |  |  |      "Implemented the main feature set..."              | | |
|   |  |  |                                                         | | |
|   |  |  [o]--- Phase 3: Polish                                    | | |
|   |  |         "Final refinements and bug fixes..."               | | |
|   |  |                                                            | | |
|   |  | Timeline line: 2px solid --border, left: 7px               | | |
|   |  | Dot: 8px circle, bg: --accent, border: 2px solid --bg      | | |
|   |  | Phase title: display, 14px, 600, --text                    | | |
|   |  | Phase desc: body, 13px, 400, --text-2                      | | |
|   |  | Each phase item is .sc-stagger (80ms apart)                | | |
|   |  +------------------------------------------------------------+ | |
|   |  margin-bottom: 3rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 10: SKILLS  (.sc-section, fade-up)                      | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  +------------------------------------------------------------+ | |
|   |  | bg: --surface, border: --border, radius: --radius-md       | | |
|   |  | padding: 1.25rem                                           | | |
|   |  |                                                            | | |
|   |  | "Skills"                                                   | | |
|   |  |                                                            | | |
|   |  | [TypeScript] [React] [Liquid] [CSS] [Node.js] [SQLite]     | | |
|   |  |                                                            | | |
|   |  | Chip style:                                                | | |
|   |  |   bg: --accent-dim (violet 10%)                            | | |
|   |  |   color: --accent                                          | | |
|   |  |   font: --font-mono, 11px, 500                             | | |
|   |  |   padding: 0.25rem 0.625rem                                | | |
|   |  |   border-radius: --radius-sm (4px)                         | | |
|   |  |   border: 1px solid --border-accent                        | | |
|   |  | Chips are each .sc-stagger (stagger 40ms apart)            | | |
|   |  +------------------------------------------------------------+ | |
|   |  margin-bottom: 3rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 11: FEATURED SESSIONS  (.sc-section, stagger cards)     | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  "Featured sessions"          "23 total"                         | |
|   |  ^ display, 1rem, 600         ^ mono, 9px, --text-3             | |
|   |                                                                  | |
|   |  +---------------------------+ +---------------------------+     | |
|   |  | SESSION CARD              | | SESSION CARD              |     | |
|   |  |                           | |                           |     | |
|   |  | [2px top accent bar]      | | [2px top accent bar]      |     | |
|   |  |                           | |                           |     | |
|   |  | Session Title Here        | | Another Session           |     | |
|   |  | 45m . 12 turns . 342 LOC  | | 1h 20m . 28 turns         |     | |
|   |  | [TypeScript]              | | [React]                   |     | |
|   |  |                           | |                           |     | |
|   |  | bg: --surface             | | bg: --surface             |     | |
|   |  | border: --border          | | border: --border          |     | |
|   |  | radius: --radius-md       | | radius: --radius-md       |     | |
|   |  | padding: 1rem             | | padding: 1rem             |     | |
|   |  +---------------------------+ +---------------------------+     | |
|   |  +---------------------------+ +---------------------------+     | |
|   |  | SESSION CARD              | | SESSION CARD              |     | |
|   |  | ...                       | | ...                       |     | |
|   |  +---------------------------+ +---------------------------+     | |
|   |                                                                  | |
|   |  Grid: 2 columns, gap: 0.75rem                                  | |
|   |  Top bar: 2px height, colors cycle:                              | |
|   |    card 0: --accent (#818cf8)                                    | |
|   |    card 1: #a78bfa (violet-400)                                  | |
|   |    card 2: #c084fc (purple-400)                                  | |
|   |    card 3+: cycle back                                           | |
|   |  Card title: display, 14px, 600, --text                          | |
|   |  Card meta: mono, 11px, --text-3                                 | |
|   |  Card chip: same as skills chip style                            | |
|   |  Hover: border-color -> --border-accent,                        | |
|   |         bg -> --surface-2, transition 150ms                      | |
|   |  Each card is .sc-stagger (80ms apart)                           | |
|   |  margin-bottom: 3rem                                             | |
|   |                                                                  | |
|   |                                                                  | |
|   |  SECTION 12: FOOTER  (no scroll animation)                       | |
|   |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    | |
|   |                                                                  | |
|   |  -------- 1px solid --border, full width --------                | |
|   |                                                                  | |
|   |     built with heyiam.com                                        | |
|   |     ^ mono, 11px, --text-3, center-aligned                      | |
|   |     padding: 2rem 0                                              | |
|   |                                                                  | |
|   +------------------------------------------------------------------+ |
+------------------------------------------------------------------------+
```

---

## Section-by-Section Animation Specifications

### Section 1: Title

| Property    | Value                              |
|-------------|-------------------------------------|
| Animation   | **None** -- above the fold, visible immediately |
| Class       | No `.sc-section` class              |

### Section 2: Links

| Property    | Value                              |
|-------------|-------------------------------------|
| Animation   | Fade up                            |
| Trigger     | `.sc-section.visible`              |
| Transform   | translateY(24px) -> translateY(0)   |
| Opacity     | 0 -> 1                            |
| Duration    | 600ms                              |
| Easing      | cubic-bezier(0.16, 1, 0.3, 1)     |

### Section 3: Screenshot

| Property    | Value                              |
|-------------|-------------------------------------|
| Animation   | Fade up (slightly more dramatic)   |
| Trigger     | `.sc-section.visible`              |
| Transform   | translateY(32px) -> translateY(0)   |
| Opacity     | 0 -> 1                            |
| Duration    | 700ms                              |
| Easing      | cubic-bezier(0.16, 1, 0.3, 1)     |
| Note        | Larger translateY for bigger element -- feels weightier |

### Section 4: Narrative

| Property    | Value                              |
|-------------|-------------------------------------|
| Animation   | Fade up                            |
| Trigger     | `.sc-section.visible`              |
| Transform   | translateY(24px) -> translateY(0)   |
| Opacity     | 0 -> 1                            |
| Duration    | 600ms                              |
| Easing      | cubic-bezier(0.16, 1, 0.3, 1)     |
| Extra       | Left border color fades from transparent to --accent over 400ms, delay 300ms |

### Section 5: Stats Grid

| Property         | Value                              |
|------------------|-------------------------------------|
| Section anim     | Fade up (standard)                 |
| Child anim       | Each stat card is `.sc-stagger`    |
| Stagger delay    | 80ms per card                      |
| Child duration   | 400ms                              |
| **Counter anim** | See below                          |

**Stat counter animation:**
```
Trigger: parent .sc-section gets .visible
Duration: 1200ms
Easing: cubic-bezier(0.16, 1, 0.3, 1)
Start: 0
End: data-count-to attribute value

Implementation (inline script):
  - Query all [data-count-to] inside .sc-section.visible
  - On intersection, start requestAnimationFrame loop
  - Progress = easeOut(elapsed / 1200)
  - Display = Math.round(target * progress)
  - Format integers with commas (toLocaleString)
  - Duration values: animate minutes, format as "Xh Ym"
  - Token values: animate raw number, format with K/M suffix
  - Start delay: 200ms (let fade-in begin first)
```

### Section 6: Work Timeline

| Property         | Value                              |
|------------------|-------------------------------------|
| Section anim     | Fade up (standard)                 |
| **Bar growth**   | See below                          |

**Bar growth animation:**
```
Trigger: .sc-section.visible (React component watches via MutationObserver or
         checks ancestor on mount/interval)
Method: CSS transform scaleY
  - Initial: transform: scaleY(0); transform-origin: bottom center;
  - Animated: transform: scaleY(1);
  - Duration: 800ms per bar
  - Easing: cubic-bezier(0.16, 1, 0.3, 1)
  - Stagger: 50ms between bars (bar 0 = 0ms, bar 1 = 50ms, bar 2 = 100ms...)
  - Max stagger cap: bar delay capped at 1000ms (20 bars max before no more delay)

React implementation detail:
  - Component renders bars with inline style: transform: scaleY(0)
  - useEffect with IntersectionObserver on the chart container
  - On intersect, set state to "animate"
  - Bars transition via CSS transition property
  - Each bar gets transition-delay: calc(index * 50ms)
```

### Section 7: Growth Chart

| Property         | Value                              |
|------------------|-------------------------------------|
| Section anim     | Fade up (standard)                 |
| **Line draw**    | See below                          |

**Line draw animation:**
```
Trigger: .sc-section.visible
Method: SVG stroke-dasharray/stroke-dashoffset

Steps:
  1. On mount, calculate path.getTotalLength()
  2. Set stroke-dasharray: totalLength
  3. Set stroke-dashoffset: totalLength (line is hidden)
  4. On .visible trigger:
     - Transition stroke-dashoffset to 0
     - Duration: 1200ms
     - Easing: cubic-bezier(0.65, 0, 0.35, 1)  (ease-in-out for smooth draw)
  5. Fill area (the shaded region below the line):
     - opacity: 0 initially
     - On .visible: opacity: 1
     - Delay: 1000ms (starts near end of line draw)
     - Duration: 400ms
     - Easing: ease-out

React implementation detail:
  - useRef for SVG path element
  - useEffect to compute total length and set initial dashoffset
  - IntersectionObserver triggers class/state change
  - CSS handles the transition (not JS animation frame)
```

### Section 8: Two-Column (Decisions + Sources)

| Property         | Value                              |
|------------------|-------------------------------------|
| Section anim     | Fade up (standard)                 |
| Left col delay   | 0ms (`.sc-stagger:nth-child(1)`)   |
| Right col delay  | 80ms (`.sc-stagger:nth-child(2)`)  |

### Section 9: Phase Timeline

| Property         | Value                              |
|------------------|-------------------------------------|
| Section anim     | Fade up (standard)                 |
| Phase items      | Each `.phase-timeline__item` is `.sc-stagger` |
| Stagger delay    | 80ms per phase                     |
| Dot accent       | Dot fades from --border to --accent on appear |
| Timeline line    | Draws downward (height 0 -> 100%)  |
| Line duration    | 600ms, easing: --ease-out          |
| Line trigger     | Same .visible class                |

### Section 10: Skills

| Property         | Value                              |
|------------------|-------------------------------------|
| Section anim     | Fade up (standard)                 |
| Chip stagger     | Each chip is `.sc-stagger`, 40ms apart |
| Note             | Faster stagger (40ms vs 80ms) because chips are small |

### Section 11: Featured Sessions

| Property         | Value                              |
|------------------|-------------------------------------|
| Section anim     | Fade up (standard, on header only) |
| Card stagger     | Each card is `.sc-stagger`, 80ms apart |
| Card hover       | border-color -> --border-accent, bg -> --surface-2 |
| Hover duration   | 150ms ease                         |

### Section 12: Footer

| Property    | Value                              |
|-------------|-------------------------------------|
| Animation   | **None** -- footer is always visible, no scroll trigger |

---

## Showcase vs. Kinetic: Key Differences

| Aspect              | Kinetic                           | Showcase                          |
|---------------------|-----------------------------------|-----------------------------------|
| **Accent**          | Orange (#f97316)                  | Violet (#818cf8)                  |
| **Layout width**    | 1200px max                        | 800px max (narrower, cinematic)   |
| **Hero**            | Stats-forward: title + stats side by side in hero row | Title alone, large, breathing room |
| **Section flow**    | Dense, no spacing between sections | 3rem gaps between sections, generous vertical rhythm |
| **Stats placement** | Hero position (top, prominent)    | Mid-page, after narrative (context first, numbers second) |
| **Section order**   | Title+Stats > Screenshot > Narrative > Charts > Phases+Sources > Skills > Sessions | Title > Links > Screenshot > Narrative > Stats > Charts > Decisions+Sources > Phases > Skills > Sessions |
| **Scroll animation**| None                              | Every section fades/slides up on scroll |
| **Chart animation** | Instant render                    | Bars grow up, lines draw, stats count up |
| **Card layout**     | Default card style                | Elevated hover states, accent top bars, 2-col grid |
| **Typography feel** | Bold, stats-heavy                 | Cinematic, narrative-forward      |
| **Narrative**       | Full-width block                  | Left-border accent, generous line-height (1.7) |
| **Two-column**      | Phases + Sources                  | Key Decisions + Sources (phases get own section) |
| **Vibe**            | Dashboard / data war room         | Portfolio showcase / case study presentation |
| **Border radii**    | Same system tokens                | Same system tokens                |
| **Interactivity**   | Static once rendered              | Scroll-driven reveals, hover states |

---

## Liquid Template Structure

File: `cli/src/render/templates/showcase/project.liquid`

```liquid
<div class="heyiam-project showcase"
     data-render-version="2"
     data-template="showcase"
     {% if sessionBaseUrl %} data-session-base-url="{{ sessionBaseUrl }}"{% endif %}
     data-username="{{ user.username }}"
     data-project-slug="{{ project.slug }}">

  {%- comment -%} S1: Title -- no scroll animation {%- endcomment -%}
  <div class="sc-title">
    <h1 class="project-title" data-editable="title">{{ project.title }}</h1>
  </div>

  {%- comment -%} S2: Links {%- endcomment -%}
  <div class="sc-section">
    {% render 'partials/_links', project: project %}
  </div>

  {%- comment -%} S3: Screenshot {%- endcomment -%}
  <div class="sc-section sc-section--heavy">
    {% render 'partials/_screenshot', project: project %}
  </div>

  {%- comment -%} S4: Narrative {%- endcomment -%}
  <div class="sc-section">
    {% render 'partials/_narrative', narrative: project.narrative %}
  </div>

  {%- comment -%} S5: Stats {%- endcomment -%}
  <div class="sc-section sc-stats-grid">
    {% render 'partials/_stats', project: project, durationLabel: durationLabel, efficiencyMultiplier: efficiencyMultiplier %}
  </div>

  {%- comment -%} S6: Work Timeline {%- endcomment -%}
  <div class="sc-section">
    {% render 'partials/_work-timeline', sessionsJson: sessionsJson %}
  </div>

  {%- comment -%} S7: Growth Chart {%- endcomment -%}
  <div class="sc-section">
    {% render 'partials/_growth-chart', project: project, growthJson: growthJson %}
  </div>

  {%- comment -%} S8: Two-column: Decisions + Sources {%- endcomment -%}
  <div class="sc-section">
    <div class="two-col">
      <div class="sc-stagger">
        {% render 'partials/_key-decisions', arc: arc %}
      </div>
      <div class="sc-stagger">
        {% render 'partials/_source-breakdown', sourceCounts: sourceCounts %}
      </div>
    </div>
  </div>

  {%- comment -%} S9: Phase Timeline {%- endcomment -%}
  <div class="sc-section">
    {% render 'partials/_phases', arc: arc %}
  </div>

  {%- comment -%} S10: Skills {%- endcomment -%}
  <div class="sc-section">
    {% render 'partials/_skills', skills: project.skills %}
  </div>

  {%- comment -%} S11: Featured Sessions {%- endcomment -%}
  <div class="sc-section">
    {% render 'partials/_session-cards', featuredSessions: featuredSessions, sessionBaseUrl: sessionBaseUrl, totalSessionCount: sessions.size %}
  </div>

  {%- comment -%} S12: Footer -- no scroll animation {%- endcomment -%}
  {% render 'partials/_footer', sessionBaseUrl: sessionBaseUrl %}

</div>

<script>
(function() {
  /* ── IntersectionObserver for section reveals ── */
  var sections = document.querySelectorAll('.sc-section');
  if (!sections.length) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  sections.forEach(function(s) { observer.observe(s); });

  /* ── Stat counter animation ── */
  var counted = false;
  var statsSection = document.querySelector('.sc-stats-grid');
  if (statsSection) {
    var statsObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !counted) {
          counted = true;
          statsObserver.unobserve(entry.target);
          setTimeout(function() { animateCounters(); }, 200);
        }
      });
    }, { threshold: 0.15 });
    statsObserver.observe(statsSection);
  }

  function animateCounters() {
    var counters = document.querySelectorAll('[data-count-to]');
    counters.forEach(function(el) {
      var target = parseFloat(el.getAttribute('data-count-to'));
      var format = el.getAttribute('data-count-format') || 'number';
      var start = performance.now();
      var duration = 1200;
      function step(now) {
        var elapsed = now - start;
        var progress = Math.min(elapsed / duration, 1);
        /* easeOut: cubic-bezier(0.16, 1, 0.3, 1) approximation */
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = target * eased;
        el.textContent = formatValue(current, format, target);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function formatValue(val, format, target) {
    if (format === 'duration') {
      var mins = Math.round(val);
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
    }
    if (format === 'tokens') {
      if (target >= 1000000) return (val / 1000000).toFixed(1) + 'M';
      if (target >= 1000) return (val / 1000).toFixed(1) + 'K';
      return Math.round(val).toLocaleString();
    }
    if (format === 'multiplier') return val.toFixed(1) + 'x';
    return Math.round(val).toLocaleString();
  }
})();
</script>
```

---

## CSS Scoping Strategy

All showcase-specific styles are scoped under `.showcase` (applied to the root `.heyiam-project` element). This prevents leakage into other templates.

```css
/* ── Showcase template overrides ── */

.heyiam-project.showcase {
  /* Token overrides for dark mode */
  --surface: #111113;
  --surface-low: #18181b;
  --surface-lowest: #09090b;
  --surface-high: #27272a;
  --on-surface: #fafafa;
  --on-surface-variant: rgba(255,255,255,0.4);
  --outline: rgba(255,255,255,0.12);
  --ghost: rgba(255,255,255,0.06);
  --primary: #818cf8;
  --primary-hover: #a5b4fc;
  --on-primary: #09090b;
  --violet: #818cf8;
  --violet-bg: rgba(129,140,248,0.1);
  --border: rgba(255,255,255,0.06);

  max-width: 800px;
  background: #09090b;
  color: #fafafa;
}

.showcase .project-title {
  font-size: 2.25rem;
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
}

.showcase .narrative-text {
  border-left-color: #818cf8;
  font-size: 1.0625rem;
  line-height: 1.7;
  color: rgba(255,255,255,0.65);
  padding-left: 1rem;
}

/* Section spacing */
.showcase .sc-section { margin-bottom: 3rem; }
.showcase .sc-section--heavy { margin-bottom: 2.5rem; }
.showcase .sc-title { margin-bottom: 0.5rem; }

/* Stat grid: 3 columns for showcase */
.showcase .stat-hero-layout {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}
.showcase .stat-grid--compact {
  grid-template-columns: repeat(3, 1fr);
}
.showcase .stat-card {
  background: #111113;
  border: 1px solid rgba(255,255,255,0.06);
  padding: 1.25rem;
}
.showcase .stat-card__value {
  font-size: 2rem;
  letter-spacing: -0.02em;
}

/* Card surface overrides */
.showcase .card {
  background: #111113;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
}

/* Browser chrome dark */
.showcase .browser-chrome {
  border-radius: 12px;
  border-color: rgba(255,255,255,0.06);
}
.showcase .browser-chrome__bar {
  background: #18181b;
  border-bottom-color: rgba(255,255,255,0.06);
}

/* Session card hover */
.showcase .session-card {
  transition: background var(--dur-micro, 150ms) ease,
              border-color var(--dur-micro, 150ms) ease;
}
.showcase .session-card:hover {
  background: #18181b;
  border-color: rgba(129,140,248,0.2);
}
.showcase .session-grid {
  grid-template-columns: repeat(2, 1fr);
}

/* Chip with border */
.showcase .chip--violet {
  background: rgba(129,140,248,0.1);
  color: #818cf8;
  border: 1px solid rgba(129,140,248,0.2);
}

/* Phase timeline dots */
.showcase .phase-timeline__dot {
  background: #818cf8;
  border: 2px solid #09090b;
}

/* Source table dark */
.showcase .source-table__th {
  color: rgba(255,255,255,0.4);
  border-bottom-color: rgba(255,255,255,0.06);
}
.showcase .source-table__td {
  color: rgba(255,255,255,0.65);
  border-bottom-color: rgba(255,255,255,0.06);
}

/* Note stack dark */
.showcase .note {
  border-bottom-color: rgba(255,255,255,0.06);
}
.showcase .note__title { color: #fafafa; }
.showcase .note__body { color: rgba(255,255,255,0.65); }

/* Footer */
.showcase .export-footer {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 2rem 0;
  text-align: center;
}
.showcase .export-footer__text { color: rgba(255,255,255,0.4); }

/* ── Scroll animations ── */

.sc-section {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 600ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sc-section--heavy {
  transform: translateY(32px);
  transition-duration: 700ms;
}
.sc-section.visible {
  opacity: 1;
  transform: translateY(0);
}

.sc-stagger {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 400ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 400ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sc-section.visible > .sc-stagger { opacity: 1; transform: translateY(0); }
.sc-section.visible > .sc-stagger:nth-child(1) { transition-delay: 0ms; }
.sc-section.visible > .sc-stagger:nth-child(2) { transition-delay: 80ms; }
.sc-section.visible > .sc-stagger:nth-child(3) { transition-delay: 160ms; }
.sc-section.visible > .sc-stagger:nth-child(4) { transition-delay: 240ms; }
.sc-section.visible > .sc-stagger:nth-child(5) { transition-delay: 320ms; }
.sc-section.visible > .sc-stagger:nth-child(6) { transition-delay: 400ms; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .sc-section,
  .sc-stagger {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
```

---

## Chart Integration Notes for React Components

### WorkTimeline (bar chart)

The existing React component needs a `showcase` variant that:
1. Uses `--accent` (#818cf8) for bar fill color at 80% opacity
2. Applies `transform: scaleY(0); transform-origin: bottom center` as initial bar state
3. Watches for `.visible` class on the nearest `.sc-section` ancestor (MutationObserver on classList, or poll every 100ms for 500ms max)
4. On visible: adds a class that triggers CSS transitions with staggered delays
5. Bar hover: opacity 1.0, slight translateY(-1px) shift
6. Axis/grid styling: `--font-mono` at 10px, color `--text-3`, grid lines use `--border`

### GrowthChart (line chart)

The existing React component needs a `showcase` variant that:
1. Renders an SVG path for the cumulative line
2. On mount, computes `path.getTotalLength()` and sets `stroke-dasharray` and `stroke-dashoffset` to that value
3. Watches for `.visible` on ancestor `.sc-section`
4. On visible: transitions `stroke-dashoffset` to 0 over 1200ms with `ease-in-out`
5. Fill area (gradient below line): starts at `opacity: 0`, transitions to `opacity: 1` with 1000ms delay and 400ms duration
6. Line stroke: `--accent` at full opacity, `stroke-width: 2`
7. Fill gradient: from `--accent` at 15% opacity (top) to transparent (bottom)

### Template detection

Both chart components should check `data-template` attribute on their closest `.heyiam-project` ancestor. When `showcase`, apply the animation behaviors. When any other template, render immediately without animation.

---

## Responsive Behavior

```
/* Breakpoint: below 768px */
@media (max-width: 768px) {
  .showcase .project-title { font-size: 1.75rem; }
  .showcase .two-col { grid-template-columns: 1fr; }
  .showcase .session-grid { grid-template-columns: 1fr; }
  .showcase .stat-hero-layout,
  .showcase .stat-grid--compact { grid-template-columns: repeat(2, 1fr); }
  .showcase .stat-card__value { font-size: 1.5rem; }
  .heyiam-project.showcase { padding: 2rem 1rem; }
  .sc-section { margin-bottom: 2rem; }
  /* Reduce animation distance on mobile */
  .sc-section { transform: translateY(16px); }
  .sc-section--heavy { transform: translateY(20px); }
}

/* Breakpoint: below 480px */
@media (max-width: 480px) {
  .showcase .stat-hero-layout,
  .showcase .stat-grid--compact { grid-template-columns: 1fr; }
}
```

---

## Implementation Checklist

1. Create `cli/src/render/templates/showcase/project.liquid` with the Liquid structure above
2. Add showcase CSS block to `cli/src/render/templates/styles.css` scoped under `.showcase`
3. Add inline `<script>` for IntersectionObserver and stat counter animation
4. Update WorkTimeline React component to detect showcase template and apply bar growth animation
5. Update GrowthChart React component to detect showcase template and apply line draw animation
6. Verify `prefers-reduced-motion` disables all animations
7. Test that `.visible` class system works in both CLI preview and exported HTML
8. Verify no CSS leakage into other templates (all rules scoped under `.showcase`)
