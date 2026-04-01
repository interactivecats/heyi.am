# Strata Template -- Visual Mockup Specification

**Template identity:** Strata
**Mode:** Light
**Accent:** Warm amber `#d97706`
**Background:** Off-white `#fafaf9` (stone-50)
**Concept:** Depth-based parallax layering. Sections exist on distinct z-planes with soft drop shadows, like cards in a physical stack being peeled apart. The active/visible section elevates and expands. Geometric sans-serif typography. Generous whitespace.

---

## 1. Design Tokens

```css
[data-template="strata"] {
  /* Surfaces -- layered from back to front */
  --strata-bg:             #fafaf9;   /* page background (stone-50) */
  --strata-plane-0:        #f5f5f4;   /* deepest plane, behind everything (stone-100) */
  --strata-plane-1:        #ffffff;   /* default section plane */
  --strata-plane-2:        #ffffff;   /* elevated/active section plane */

  /* Shadows -- the core of the depth system */
  --strata-shadow-rest:    0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --strata-shadow-hover:   0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
  --strata-shadow-active:  0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);

  /* Accent */
  --strata-accent:         #d97706;   /* amber-600 */
  --strata-accent-hover:   #b45309;   /* amber-700 */
  --strata-accent-light:   #fef3c7;   /* amber-100, for backgrounds */
  --strata-accent-faint:   #fffbeb;   /* amber-50, for subtle fills */

  /* Text */
  --strata-text:           #1c1917;   /* stone-900 */
  --strata-text-secondary: #78716c;   /* stone-500 */
  --strata-text-tertiary:  #a8a29e;   /* stone-400 */

  /* Borders */
  --strata-border:         #e7e5e4;   /* stone-200 */
  --strata-border-faint:   #f5f5f4;   /* stone-100 */

  /* Typography */
  --strata-font-display:   'Space Grotesk', system-ui, sans-serif;
  --strata-font-body:      'Inter', system-ui, sans-serif;
  --strata-font-mono:      'IBM Plex Mono', monospace;

  /* Radii -- slightly larger than editorial for softer card edges */
  --strata-radius:         0.5rem;    /* 8px */
  --strata-radius-lg:      0.75rem;   /* 12px */
  --strata-radius-sm:      0.25rem;   /* 4px */

  /* Motion */
  --strata-duration-micro: 150ms;
  --strata-duration-section: 350ms;
  --strata-duration-parallax: 600ms;
  --strata-ease:           cubic-bezier(0.16, 1, 0.3, 1); /* ease-out-expo */
  --strata-ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1); /* slight overshoot */
}
```

---

## 2. Page-Level Layout

```
+------------------------------------------------------------------------+
|  #fafaf9 page background                                               |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  |  max-width: 960px  /  margin: 0 auto  /  padding: 3rem 2rem     |  |
|  |                                                                  |  |
|  |  [ SECTION 1: Title ]          z-index: 1                       |  |
|  |                           margin-bottom: 0                      |  |
|  |                                                                  |  |
|  |  [ SECTION 2: Links ]          z-index: 2                       |  |
|  |                           margin-bottom: 0                      |  |
|  |                                                                  |  |
|  |  ================================================               |  |
|  |  || SECTION 3: Screenshot ||   z-index: 3                       |  |
|  |  ================================================               |  |
|  |                           margin-bottom: -1rem (overlap)        |  |
|  |                                                                  |  |
|  |  ================================================               |  |
|  |  || SECTION 4: Narrative  ||   z-index: 4                       |  |
|  |  ================================================               |  |
|  |                                                                  |  |
|  |  ================================================               |  |
|  |  || SECTION 5: Stats      ||   z-index: 5                       |  |
|  |  ================================================               |  |
|  |                                                                  |  |
|  |  ... (sections continue stacking upward in z)                   |  |
|  |                                                                  |  |
|  +------------------------------------------------------------------+  |
+------------------------------------------------------------------------+
```

**Key structural rules:**
- `max-width: 960px` (narrower than editorial's 1200px -- tighter column creates stronger card presence)
- `padding: 3rem 2rem` (more generous than editorial's 2rem 1.5rem)
- Each section is a `.strata-layer` element -- a full-width card with its own background, shadow, and z-index
- Sections overlap by `-1rem` using negative margin-top, creating a physical stacking appearance
- Each successive section has a higher z-index so it visually "sits on top" of the one before it

---

## 3. Section Architecture -- The Layer System

Every content section wraps in a `.strata-layer`:

```css
.strata-layer {
  position: relative;
  background: var(--strata-plane-1);
  border-radius: var(--strata-radius-lg);
  padding: 2rem 2.5rem;
  margin-top: -1rem;             /* overlap with previous layer */
  box-shadow: var(--strata-shadow-rest);
  transition:
    transform var(--strata-duration-section) var(--strata-ease),
    box-shadow var(--strata-duration-section) var(--strata-ease);
  will-change: transform, box-shadow;
}
```

**Z-index assignment:**
- Title/Links area (no card, bare on background): z-index 0
- Screenshot layer: z-index 1
- Narrative layer: z-index 2
- Stats layer: z-index 3
- Work Timeline layer: z-index 4
- Growth Chart layer: z-index 5
- Two-column (Decisions + Sources) layer: z-index 6
- Phase Timeline layer: z-index 7
- Skills layer: z-index 8
- Session Cards layer: z-index 9
- Footer: z-index 10

**Active/visible state -- IntersectionObserver driven:**

```css
.strata-layer.strata-active {
  transform: translateY(-4px);
  box-shadow: var(--strata-shadow-active);
}
```

When a section crosses the 40% viewport threshold (becoming the "active" section), it elevates via translateY(-4px) and deepens its shadow. Only one section is `.strata-active` at a time. This is the "peeling apart" effect -- the active card lifts away from the stack.

---

## 4. Parallax Scroll Behavior

The parallax is CSS-only using `transform: translateY()` applied via a lightweight IntersectionObserver + scroll listener (same inline `<script>` pattern as showcase).

**Rules:**
- Each `.strata-layer` translates on Y at a rate proportional to its z-index: `translateY(offset * 0.03 * zIndex)` where offset is pixels from center viewport
- This creates a subtle depth separation where higher layers move slightly faster, lower layers lag behind
- Maximum translation: +/- 20px (clamped to prevent jarring movement)
- The effect is subtle. If you squint you might miss it. That is correct.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables all translateY parallax, keeps shadow transitions

**Entrance animation (one-time, on first scroll into view):**

```css
.strata-layer {
  opacity: 0;
  transform: translateY(24px);
}

.strata-layer.strata-visible {
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity var(--strata-duration-parallax) var(--strata-ease),
    transform var(--strata-duration-parallax) var(--strata-ease);
}
```

Each section fades in and slides up 24px when it first enters the viewport. Staggered by 80ms per section index to create a cascade effect on initial page load.

---

## 5. Section-by-Section Specification

### 5.1 Title (Section 1)

**Not a card.** Sits directly on the `#fafaf9` background, no shadow, no border.

```
+---------------------------------------------------------+
|                                                         |
|  Project Name Here                                      |
|                                                         |
+---------------------------------------------------------+
```

- **Font:** `--strata-font-display` (Space Grotesk)
- **Size:** `2.25rem` (36px) -- larger than editorial's 1.25rem
- **Weight:** 700
- **Color:** `--strata-text` (#1c1917)
- **Letter-spacing:** `-0.02em` (tight, geometric feel)
- **Margin-bottom:** `0.5rem`
- **No border, no background, no shadow**

This is intentionally oversized compared to editorial. The title is the anchor -- it stays pinned to the background plane while all card sections slide over it.

### 5.2 Links (Section 2)

**Not a card.** Inline with title area, same background plane.

```
  [GitHub icon] github.com/user/repo    [Globe icon] project.example.com
```

- **Font:** `--strata-font-mono` (IBM Plex Mono)
- **Size:** `0.8125rem` (13px)
- **Color:** `--strata-accent` (#d97706) -- amber links, not blue
- **Hover:** `--strata-accent-hover` (#b45309), underline
- **Icon size:** 14px, `color: --strata-text-tertiary`
- **Gap between links:** `1.25rem`
- **Margin-bottom:** `2rem` (space before first card layer)

### 5.3 Screenshot (Section 3) -- First Card Layer

```
+=========================================================+
|  [*] [*] [*]   project.example.com                      |  <- browser bar
|---------------------------------------------------------|
|                                                         |
|                   [ screenshot.png ]                     |
|                                                         |
|                   max-height: 28rem                      |
|                   overflow: hidden                       |
|                                                         |
+=========================================================+
```

- **Container:** `.strata-layer` with `padding: 0` (image bleeds to card edges)
- **Browser chrome bar:**
  - Background: `--strata-plane-0` (#f5f5f4)
  - Dots: standard red/yellow/green (same as editorial)
  - URL text: `--strata-font-mono`, 11px, `--strata-text-tertiary`
  - Bottom border: `1px solid --strata-border`
- **Image viewport:** `max-height: 28rem`, `overflow: hidden`
- **Image:** `width: 100%`, `height: auto`, `display: block`
- **Card radius:** `--strata-radius-lg` (12px) -- notably rounder than editorial's 6px
- **Shadow:** `--strata-shadow-rest`
- **z-index:** 1

### 5.4 Narrative (Section 4)

```
+=========================================================+
|                                                         |
|  |||  Project narrative text goes here. This is the     |
|  |||  story of what was built, why it matters, and      |
|  |||  what was learned. Multiple paragraphs supported.  |
|  |||                                                    |
+=========================================================+
```

- **Container:** `.strata-layer`, `padding: 2.5rem 3rem` (extra horizontal padding for reading comfort)
- **Left border accent:** `4px solid --strata-accent` (#d97706) -- amber instead of editorial's blue
- **Border implementation:** `border-left` on the text block, not on the card
- **Font:** `--strata-font-body` (Inter)
- **Size:** `1rem` (16px)
- **Line-height:** `1.75` (28px -- more generous than editorial's 1.6)
- **Color:** `--strata-text` (#1c1917)
- **Max-width of text block:** `65ch` (optimal reading width)
- **z-index:** 2

### 5.5 Stats Grid (Section 5)

```
+=========================================================+
|                                                         |
|  DURATION        SESSIONS        LOC          FILES     |
|  2h 34m          12              4,281        47        |
|                                                         |
|                  TOKENS          EFFICIENCY              |
|                  128.4k          3.2x                    |
|                                                         |
+=========================================================+
```

- **Container:** `.strata-layer`
- **Layout:** CSS Grid, `grid-template-columns: repeat(4, 1fr)`, second row `repeat(2, 1fr)` centered
- **Stat label:**
  - Font: `--strata-font-mono`, 10px, weight 500
  - Transform: `uppercase`
  - Letter-spacing: `0.08em`
  - Color: `--strata-text-tertiary` (#a8a29e)
  - Margin-bottom: `0.25rem`
- **Stat value:**
  - Font: `--strata-font-display`, `1.75rem` (28px), weight 700
  - Color: `--strata-text` (#1c1917)
- **Efficiency value (if present):** color `--strata-accent` (#d97706) to draw attention
- **Grid gap:** `1.5rem` horizontal, `1.25rem` vertical
- **Dividers:** None. Whitespace separates. This differs from editorial which uses card borders per stat.
- **z-index:** 3

### 5.6 Work Timeline (Section 6) -- React Hydrated

```
+=========================================================+
|                                                         |
|  Work Timeline                          12 sessions     |
|                                                         |
|  |                    ____                              |
|  |          ____     |    |                             |
|  |   ___   |    |    |    |   ___                       |
|  |  |   |  |    |    |    |  |   |  ___                 |
|  |__|___|__|____|____|____|__|___|__|___|___________    |
|  Jan 4  Jan 11  Jan 18  Jan 25  Feb 1  Feb 8           |
|                                                         |
+=========================================================+
```

- **Container:** `.strata-layer`
- **Section header:** flex row, title left + meta right (same pattern as editorial `section-header`)
  - Title: `--strata-font-display`, 1rem, weight 600, `--strata-text`
  - Meta: `--strata-font-mono`, 10px, uppercase, `--strata-text-tertiary`
- **Chart container:** `data-work-timeline` attribute for React hydration
- **Bar color:** `--strata-accent` (#d97706)
- **Bar hover:** `--strata-accent-hover` (#b45309)
- **Bar radius:** `--strata-radius-sm` (4px) on top corners
- **Axis text:** `--strata-font-mono`, 10px, `--strata-text-tertiary`
- **Grid lines:** `1px solid --strata-border-faint`
- **Chart height:** `200px`
- **z-index:** 4

### 5.7 Growth Chart (Section 7) -- React Hydrated

```
+=========================================================+
|                                                         |
|  Cumulative Growth                      4,281 lines     |
|                                                         |
|                                        ___/             |
|                                   ___/                  |
|                              ___/                       |
|                         ___/                            |
|                    ___/                                 |
|               ___/                                      |
|          ___/                                           |
|     ___/                                                |
|  __/                                                    |
|                                                         |
+=========================================================+
```

- **Container:** `.strata-layer`
- **Header:** Same pattern as Work Timeline
- **Line color (LOC):** `--strata-accent` (#d97706)
- **Line color (Files):** `--strata-text-tertiary` (#a8a29e) -- muted secondary line
- **Line width:** 2px
- **Area fill (LOC):** `--strata-accent` at 8% opacity
- **Area fill (Files):** none
- **Dot on hover:** 6px circle, `--strata-accent`, `--strata-shadow-hover`
- **Tooltip:** `--strata-plane-2` background, `--strata-shadow-hover`, `--strata-radius` corners
- **Chart height:** `220px`
- **z-index:** 5

### 5.8 Two-Column: Key Decisions + Source Breakdown (Section 8)

```
+=========================================================+
|                                                         |
|  Key Decisions               |  Source Breakdown        |
|                              |                          |
|  +------------------------+  |  Language    Lines   %   |
|  | Decision title here    |  |  ---------------------   |
|  | Description of what    |  |  TypeScript  2,140  50%  |
|  | was decided and why.   |  |  CSS         1,024  24%  |
|  +------------------------+  |  Liquid        680  16%  |
|  +------------------------+  |  JSON          437  10%  |
|  | Another decision       |  |                          |
|  | And its rationale.     |  |                          |
|  +------------------------+  |                          |
|                              |                          |
+=========================================================+
```

**This is a SINGLE `.strata-layer` card containing two columns.** Not two separate cards.

- **Layout:** CSS Grid, `grid-template-columns: 1fr 1fr`, `gap: 2.5rem`
- **Divider:** `1px solid --strata-border` vertical line between columns (via `border-left` on right column or `column-gap` with a pseudo-element)

**Key Decisions (left column):**
- **Column heading:** `--strata-font-display`, 1rem, weight 600
- **Decision cards:** Stacked vertically, `gap: 0.75rem`
  - Background: `--strata-accent-faint` (#fffbeb) -- warm amber tint, unique to Strata
  - Border: `1px solid --strata-accent-light` (#fef3c7)
  - Radius: `--strata-radius` (8px)
  - Padding: `0.875rem 1rem`
  - Title: `--strata-font-body`, 0.875rem, weight 600, `--strata-text`
  - Description: `--strata-font-body`, 0.8125rem, `--strata-text-secondary`, line-height 1.5

**Source Breakdown (right column):**
- **Column heading:** `--strata-font-display`, 1rem, weight 600
- **Table:**
  - Header row: `--strata-font-mono`, 10px, uppercase, `--strata-text-tertiary`, no border
  - Data rows: `--strata-font-mono` for language name (0.8125rem, `--strata-text`), `--strata-font-mono` for numbers (0.8125rem, `--strata-text-secondary`)
  - Row separator: `1px solid --strata-border-faint`
  - Row padding: `0.5rem 0`
  - Percentage bar: 3px tall, `--strata-accent` at 20% opacity, behind each row, width = percentage. Subtle data visualization.

- **z-index:** 6

### 5.9 Phase Timeline (Section 9)

```
+=========================================================+
|                                                         |
|  Project Phases                                         |
|                                                         |
|  o---- Phase 1: Foundation                              |
|  |     Set up the project structure, configured          |
|  |     build tooling, established CI pipeline.           |
|  |                                                       |
|  o---- Phase 2: Core Features                            |
|  |     Implemented the template rendering engine,        |
|  |     Liquid integration, and CSS token system.         |
|  |                                                       |
|  o---- Phase 3: Polish                                   |
|  .     Responsive breakpoints, accessibility audit,      |
|        motion design, final QA pass.                     |
|                                                         |
+=========================================================+
```

- **Container:** `.strata-layer`
- **Section heading:** `--strata-font-display`, 1rem, weight 600
- **Timeline line:** `2px solid --strata-border` (#e7e5e4), positioned `left: 0.3rem`
- **Timeline dots:**
  - `10px` diameter circle
  - `background: --strata-accent` (#d97706)
  - `box-shadow: 0 0 0 4px --strata-accent-light` (#fef3c7) -- amber glow ring instead of editorial's blue
- **Phase title:** `--strata-font-display`, 0.875rem, weight 600, `--strata-text`
- **Phase description:** `--strata-font-body`, 0.8125rem, `--strata-text-secondary`, line-height 1.6
- **Phase spacing:** `padding-bottom: 1.25rem` per item
- **Last item:** dotted line instead of solid (timeline trails off)
- **z-index:** 7

### 5.10 Skills (Section 10)

```
+=========================================================+
|                                                         |
|  Technologies                                           |
|                                                         |
|  [TypeScript] [React] [Liquid] [CSS] [Node.js]         |
|  [PostgreSQL] [Docker] [Vitest]                         |
|                                                         |
+=========================================================+
```

- **Container:** `.strata-layer`
- **Section heading:** `--strata-font-display`, 1rem, weight 600
- **Chip layout:** `display: flex`, `flex-wrap: wrap`, `gap: 0.375rem`
- **Chip style (differs from editorial's flat chips):**
  - Background: `--strata-accent-faint` (#fffbeb)
  - Border: `1px solid --strata-accent-light` (#fef3c7)
  - Color: `--strata-accent` (#d97706)
  - Font: `--strata-font-mono`, 11px, weight 500
  - Padding: `0.25rem 0.625rem`
  - Radius: `--strata-radius` (8px) -- pill-ish, rounder than editorial
  - Hover: `background: --strata-accent-light`, `border-color: --strata-accent` -- chip "lifts" into amber
- **z-index:** 8

### 5.11 Featured Session Cards (Section 11)

```
+=========================================================+
|                                                         |
|  Sessions                               12 total        |
|                                                         |
|  +------------------------+  +------------------------+ |
|  |  ____________________  |  |  ____________________  | |
|  |  Session title here    |  |  Another session       | |
|  |  45m  ·  32 turns      |  |  1h 12m  ·  58 turns  | |
|  |  +218 lines            |  |  +847 lines            | |
|  |                        |  |                        | |
|  |  [React] [CSS]         |  |  [Node] [SQL]          | |
|  +------------------------+  +------------------------+ |
|                                                         |
|  +------------------------+  +------------------------+ |
|  |  ...                   |  |  ...                   | |
|  +------------------------+  +------------------------+ |
|                                                         |
+=========================================================+
```

- **Container:** `.strata-layer`
- **Header:** flex row, "Sessions" left + "N total" right
- **Grid:** `display: grid`, `grid-template-columns: repeat(2, 1fr)`, `gap: 0.75rem`
- **Individual session card:**
  - Background: `--strata-bg` (#fafaf9) -- slightly recessed compared to the parent card (card-within-card depth)
  - Border: `1px solid --strata-border`
  - Radius: `--strata-radius` (8px)
  - Padding: `1rem 1.25rem`
  - **Top accent bar:** `height: 3px`, full width at top of card
    - Cycles through: `--strata-accent` (#d97706), `--strata-text-tertiary` (#a8a29e), `#92400e` (amber-800)
    - Bar has `border-radius: --strata-radius --strata-radius 0 0` (rounds only top)
  - **Hover state:**
    - `transform: translateY(-2px)`
    - `box-shadow: --strata-shadow-hover`
    - `border-color: --strata-accent-light`
    - Transition: `--strata-duration-micro` `--strata-ease`
  - **Title:** `--strata-font-display`, 0.8125rem, weight 600, `--strata-text`
  - **Meta:** `--strata-font-mono`, 0.75rem, `--strata-text-secondary`
  - **Lines changed:** `--strata-font-mono`, 0.75rem, `color: --strata-accent` for positive
  - **Skill chips:** Same as Section 10 but smaller (9px font, less padding)
- **z-index:** 9

### 5.12 Footer (Section 12)

**Not a card.** Returns to the bare background plane, like the title.

```
+---------------------------------------------------------+
|                                                         |
|           Built with heyi.am  ·  View all sessions      |
|                                                         |
+---------------------------------------------------------+
```

- **Top border:** `1px solid --strata-border`
- **Padding-top:** `1.5rem`
- **Margin-top:** `2rem` (breathing room after last card)
- **Text:** `--strata-font-mono`, 10px, uppercase, `--strata-text-tertiary`, `letter-spacing: 0.08em`
- **Link:** `color: --strata-accent`, hover underline
- **Alignment:** `text-align: center`
- **z-index:** 10 (above all cards, but visually flat)

---

## 6. Animation Specification

### 6.1 Entrance Animations (one-time, on scroll into view)

| Element | Start state | End state | Duration | Easing | Trigger |
|---|---|---|---|---|---|
| Each `.strata-layer` | `opacity: 0; translateY(24px)` | `opacity: 1; translateY(0)` | 600ms | ease-out-expo | IntersectionObserver, threshold 0.15 |
| Stagger between layers | -- | -- | +80ms per layer index | -- | Calculated from DOM order |
| Title (h1) | `opacity: 0; translateY(12px)` | `opacity: 1; translateY(0)` | 450ms | ease-out-expo | Immediate on load |
| Links | `opacity: 0` | `opacity: 1` | 300ms | ease-out | 200ms delay after title |

### 6.2 Parallax Scroll Effect (continuous)

```js
// Inline <script> at bottom of template
// Same pattern as showcase template

const layers = document.querySelectorAll('.strata-layer');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('strata-visible');
    }
  });
}, { threshold: 0.15 });

layers.forEach(layer => observer.observe(layer));

// Active layer tracking (most-visible section)
const activeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    entry.target.classList.toggle('strata-active', entry.isIntersecting);
  });
}, { threshold: 0.4 });

layers.forEach(layer => activeObserver.observe(layer));

// Parallax on scroll (subtle Y offset per z-index)
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const vh = window.innerHeight;
        layers.forEach((layer, i) => {
          const rect = layer.getBoundingClientRect();
          const offset = (rect.top + rect.height / 2 - vh / 2);
          const parallax = Math.max(-20, Math.min(20, offset * 0.03 * (i + 1) * 0.5));
          if (layer.classList.contains('strata-visible')) {
            layer.style.transform = `translateY(${parallax}px)`;
          }
        });
        ticking = false;
      });
      ticking = true;
    }
  });
}
```

### 6.3 Micro-interactions

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Session card | hover | `translateY(-2px)`, shadow deepen | 150ms | ease-out-expo |
| Session card | mouse leave | return to rest | 150ms | ease-out |
| Skill chip | hover | bg fill intensifies | 150ms | ease-out |
| Link | hover | underline slides in from left | 150ms | ease-out |
| Timeline dot | scroll into view | scale 0 to 1 | 300ms, +100ms stagger | ease-spring (overshoot) |

### 6.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .strata-layer {
    opacity: 1 !important;
    transform: none !important;
    transition: box-shadow var(--strata-duration-micro) ease-out;
  }
  .strata-layer.strata-active {
    transform: none;
    /* Keep shadow change only -- no motion */
  }
}
```

---

## 7. Responsive Breakpoints

### Desktop (960px+)
- Full layout as specified above
- Two-column grid for decisions/sources and session cards
- Parallax active

### Tablet (768px - 959px)
- `max-width: 100%`, `padding: 2rem 1.5rem`
- Two-column sections remain (but tighter gap: 1.5rem)
- Session card grid: remains 2-col
- Parallax reduced (halve the multiplier)

### Mobile (below 768px)
- `padding: 1.5rem 1rem`
- All two-column layouts collapse to single column
- Session card grid: 1 column
- Stats grid: `repeat(2, 1fr)` (2x3 instead of 4+2)
- Card overlap reduced: `margin-top: -0.5rem`
- Card padding: `1.5rem` (from 2rem 2.5rem)
- Title: `1.75rem` (from 2.25rem)
- Parallax disabled entirely
- Entrance animations preserved (fade + slide)

---

## 8. How Strata Differs from Other Light Templates

### vs. Editorial (the default light template)
| Aspect | Editorial | Strata |
|---|---|---|
| **Section separation** | Flat cards with 1px borders, no overlap | Overlapping cards with drop shadows, z-stacking |
| **Max width** | 1200px | 960px (tighter, stronger card presence) |
| **Accent color** | Seal Blue (#084471) | Warm Amber (#d97706) |
| **Title size** | 1.25rem | 2.25rem (much larger, hero-style) |
| **Border radius** | 6px | 12px (rounder, softer) |
| **Motion** | None (static) | Parallax scroll, entrance animations, active elevation |
| **Shadow system** | Minimal (hover only on session cards) | Three-tier shadow system (rest, hover, active) |
| **Background** | #f8f9fb (cool gray) | #fafaf9 (warm stone) |
| **Narrative accent** | Blue left border | Amber left border |
| **Chips** | Flat, violet/green/blue variants | Warm amber tint, single color family |
| **Section spacing** | margin-bottom: 1rem (discrete) | margin-top: -1rem (overlapping) |

### vs. Minimal (the other light template)
| Aspect | Minimal | Strata |
|---|---|---|
| **Philosophy** | Reduce to essentials, content-only | Add depth and physical presence |
| **Cards** | No cards at all, just horizontal rules | Every section is a card on a z-plane |
| **Typography** | Serif display font, understated | Geometric sans-serif, bold |
| **Stats presentation** | Inline text ("2h 34m, 12 sessions, 4,281 lines") | Grid of large display numbers |
| **Sessions** | Simple list (title + meta per line) | Card grid with accent bars and hover lift |
| **Motion** | None | Full parallax + entrance + hover system |
| **Visual density** | Very sparse | Moderate (contained in cards) |
| **Dividers** | `<hr>` rules between every section | Card edges and shadows create separation |

---

## 9. Liquid Template Structure

The Strata template follows the same Liquid partial system as editorial/kinetic/minimal. File: `cli/src/render/templates/strata/project.liquid`

```liquid
<div class="heyiam-project strata" data-render-version="2" data-template="strata"
     {% if sessionBaseUrl %} data-session-base-url="{{ sessionBaseUrl }}"{% endif %}
     data-username="{{ user.username }}"
     data-project-slug="{{ project.slug }}">

  {%- comment -%} Title + Links: bare on background, no card {%- endcomment -%}
  <div class="strata-header">
    <h1 class="strata-title" data-editable="title">{{ project.title }}</h1>
    {% render 'partials/_links', project: project %}
  </div>

  {%- comment -%} Screenshot: first card layer {%- endcomment -%}
  <div class="strata-layer" style="z-index: 1">
    {% render 'partials/_screenshot', project: project %}
  </div>

  {%- comment -%} Narrative {%- endcomment -%}
  <div class="strata-layer" style="z-index: 2">
    {% render 'partials/_narrative', narrative: project.narrative %}
  </div>

  {%- comment -%} Stats {%- endcomment -%}
  <div class="strata-layer" style="z-index: 3">
    {% render 'partials/_stats', project: project, durationLabel: durationLabel, efficiencyMultiplier: efficiencyMultiplier %}
  </div>

  {%- comment -%} Work Timeline (React hydrated) {%- endcomment -%}
  <div class="strata-layer" style="z-index: 4">
    {% render 'partials/_work-timeline', sessionsJson: sessionsJson %}
  </div>

  {%- comment -%} Growth Chart (React hydrated) {%- endcomment -%}
  <div class="strata-layer" style="z-index: 5">
    {% render 'partials/_growth-chart', project: project, growthJson: growthJson %}
  </div>

  {%- comment -%} Two-column: Key Decisions + Source Breakdown {%- endcomment -%}
  <div class="strata-layer" style="z-index: 6">
    <div class="strata-two-col">
      {% render 'partials/_key-decisions', arc: arc %}
      <div class="strata-col-divider"></div>
      {% render 'partials/_source-breakdown', sourceCounts: sourceCounts %}
    </div>
  </div>

  {%- comment -%} Phase Timeline {%- endcomment -%}
  <div class="strata-layer" style="z-index: 7">
    {% render 'partials/_phases', arc: arc %}
  </div>

  {%- comment -%} Skills {%- endcomment -%}
  <div class="strata-layer" style="z-index: 8">
    {% render 'partials/_skills', skills: project.skills %}
  </div>

  {%- comment -%} Featured Session Cards {%- endcomment -%}
  <div class="strata-layer" style="z-index: 9">
    {% render 'partials/_session-cards', featuredSessions: featuredSessions, sessionBaseUrl: sessionBaseUrl, totalSessionCount: sessions.size %}
  </div>

  {%- comment -%} Footer: returns to bare background {%- endcomment -%}
  <div class="strata-footer" style="z-index: 10">
    {% render 'partials/_footer', sessionBaseUrl: sessionBaseUrl %}
  </div>

  <script>
    // Strata: IntersectionObserver for entrance + active state + parallax
    // (see Section 6.2 for full implementation)
  </script>
</div>
```

---

## 10. Template Registration

Add to `cli/src/render/templates.ts`:

```ts
{ name: 'strata', description: 'Warm depth-layered cards with parallax scroll', accent: '#d97706', mode: 'light' },
```

---

## 11. Accessibility Notes

- All parallax and entrance animations respect `prefers-reduced-motion: reduce`
- Shadow-based depth is decorative; section ordering communicates hierarchy via DOM order
- Amber accent `#d97706` on white `#ffffff` = contrast ratio 3.1:1 (fails AA for body text). Use amber only for: links (underlined, so color is not sole indicator), accent bars, decorative borders, chip backgrounds. Never use amber as the sole text color on white without a supporting indicator.
- Amber accent `#d97706` on stone-50 `#fafaf9` = contrast ratio 3.0:1. Same rule applies.
- For any text that must meet AA: fall back to `--strata-text` (#1c1917, ratio 15.4:1) or `--strata-text-secondary` (#78716c, ratio 4.7:1)
- Active section elevation is communicated via shadow only (visual), but section headings provide structural navigation via proper heading hierarchy
- Interactive elements (session cards, links) have visible focus states: `outline: 2px solid --strata-accent; outline-offset: 2px`

---

## 12. Full-Page ASCII Wireframe

```
  bg: #fafaf9 (off-white stone)
  |
  |  +-- 960px max-width, centered --------------------------------+
  |  |                                                              |
  |  |  "Project Name Here"                        <- 2.25rem/700  |
  |  |  [GH] github.com/user/repo  [WEB] example.com  <- mono/amber|
  |  |                                                              |
  |  |  2rem gap                                                    |
  |  |                                                              |
  |  |  /======================================================\   |
  |  |  | [*][*][*]  project.example.com          | z:1 shadow  |   |
  |  |  |-------------------------------------------            |   |
  |  |  |                                                       |   |
  |  |  |             [ screenshot image ]                      |   |
  |  |  |              max-h: 28rem                             |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |                                         | z:2 shadow  |   |
  |  |  |  |||  Narrative text. The story of       |             |   |
  |  |  |  |||  what was built and why it           |             |   |
  |  |  |  |||  matters. Max 65ch width.            |             |   |
  |  |  |                                          |             |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |  DURATION    SESSIONS    LOC       FILES | z:3 shadow |   |
  |  |  |  2h 34m      12          4,281     47    |             |   |
  |  |  |              TOKENS      EFFICIENCY       |             |   |
  |  |  |              128.4k      3.2x [amber]     |             |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |  Work Timeline                  12 sessions| z:4      |   |
  |  |  |                                             |          |   |
  |  |  |  [||||  ||||      ||||||  ||||  ||  ||||]   |          |   |
  |  |  |   Jan    Feb       Mar    Apr   May  Jun    |          |   |
  |  |  |   (amber bars, 4px top-radius)              |          |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |  Cumulative Growth              4,281 lines| z:5      |   |
  |  |  |                                             |          |   |
  |  |  |                              ___/ (amber)   |          |   |
  |  |  |                         ___/                |          |   |
  |  |  |                    ___/                     |          |   |
  |  |  |               ___/   ---- (gray, files)     |          |   |
  |  |  |          ___/                               |          |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |  Key Decisions       |  Source Breakdown    | z:6     |   |
  |  |  |                      |                      |          |   |
  |  |  |  /--amber-tint----\  |  TypeScript  2,140   |          |   |
  |  |  |  | Decision 1     |  |  [==========] 50%    |          |   |
  |  |  |  | Rationale...   |  |  CSS         1,024   |          |   |
  |  |  |  \----------------/  |  [======] 24%         |          |   |
  |  |  |  /--amber-tint----\  |  Liquid        680   |          |   |
  |  |  |  | Decision 2     |  |  [====] 16%           |          |   |
  |  |  |  | Rationale...   |  |  JSON          437   |          |   |
  |  |  |  \----------------/  |  [===] 10%            |          |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |  Project Phases                            | z:7      |   |
  |  |  |                                             |          |   |
  |  |  |  (o)--- Phase 1: Foundation                 |          |   |
  |  |  |   |     Description text here...            |          |   |
  |  |  |   |                                         |          |   |
  |  |  |  (o)--- Phase 2: Core Features              |          |   |
  |  |  |   |     Description text here...            |          |   |
  |  |  |   :                                         |          |   |
  |  |  |  (o)--- Phase 3: Polish                     |          |   |
  |  |  |         Description text here...            |          |   |
  |  |  |   (amber dots with amber-100 glow ring)     |          |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |  Technologies                              | z:8      |   |
  |  |  |                                             |          |   |
  |  |  |  [TypeScript] [React] [Liquid] [CSS]        |          |   |
  |  |  |  [Node.js] [PostgreSQL] [Docker]            |          |   |
  |  |  |   (amber-tint bg, amber text, 8px radius)   |          |   |
  |  |  \======================================================/   |
  |  |      margin-top: -1rem (overlap) |                           |
  |  |  /======================================================\   |
  |  |  |  Sessions                       12 total   | z:9      |   |
  |  |  |                                             |          |   |
  |  |  |  +---------------------+ +------------------+|          |   |
  |  |  |  | === accent bar ===  | | === accent bar == ||          |   |
  |  |  |  | Session title       | | Session title     ||          |   |
  |  |  |  | 45m · 32 turns      | | 1h 12m · 58 turns||          |   |
  |  |  |  | +218 lines          | | +847 lines        ||          |   |
  |  |  |  | [React] [CSS]       | | [Node] [SQL]      ||          |   |
  |  |  |  +---------------------+ +------------------+|          |   |
  |  |  |  +---------------------+ +------------------+|          |   |
  |  |  |  | ...                 | | ...               ||          |   |
  |  |  |  +---------------------+ +------------------+|          |   |
  |  |  \======================================================/   |
  |  |                                                              |
  |  |  --------------------------------------------------------    |
  |  |           BUILT WITH HEYI.AM  ·  VIEW ALL SESSIONS           |
  |  |           (mono 10px, amber link, centered)                  |
  |  |                                                              |
  |  +--------------------------------------------------------------+
  |
```

---

## 13. CSS Scoping Strategy

All Strata styles are scoped under `[data-template="strata"]` or `.heyiam-project.strata` to prevent leaking into other templates. The CSS lives in `styles.css` as a new section:

```css
/* ── Strata Template ── */
[data-template="strata"] {
  /* all strata-specific tokens and rules here */
}
```

Shared partials (stats, skills, phases, etc.) are restyled via descendant selectors:

```css
[data-template="strata"] .stat-card__value { /* strata overrides */ }
[data-template="strata"] .chip { /* strata overrides */ }
[data-template="strata"] .phase-timeline__dot { /* amber glow ring */ }
```

This avoids forking partials -- the same Liquid partials render, but CSS reshapes them for the Strata aesthetic.
