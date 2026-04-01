# Template Browser Page — Design Specification

Route: `/templates`
Purpose: A dedicated marketplace-style page for browsing, previewing, and selecting portfolio templates. Replaces the collapsed template picker currently embedded in Settings.

---

## 1. Page Layout

### Structure (top to bottom)

```
[ AppShell header — standard ]
[ Hero section — page title + subtitle + active theme summary ]
[ Filter bar — horizontal pills ]
[ Template grid — 3-column on desktop ]
```

### Hero Section

- Full-width, light background (`bg-surface-lowest`), bottom border (`border-ghost`)
- Padding: `px-6 py-8` within a `max-w-6xl mx-auto` container
- Left side: page title + subtitle + current theme indicator
- No decorative elements — typography carries the hierarchy

```
Portfolio Templates                          [Currently active]
Browse themes for your published portfolio   Editorial — Light, card-based layout
27 templates                                 [Change theme] [Preview site ->]
```

**Title**: `font-display text-3xl font-bold text-on-surface`
**Subtitle**: `text-sm text-on-surface-variant mt-1`
**Template count**: `font-mono text-xs text-on-surface-variant uppercase tracking-wider mt-2`

**Active theme indicator** (right-aligned):
- Small preview thumbnail (48x30, `aspect-[16/10]`, `rounded-sm`, `border border-ghost`)
- Template name in `text-sm font-medium text-on-surface`
- Description in `text-xs text-on-surface-variant`
- "Active" badge using the existing Badge component (`variant="refined"`)

### Content Container

- `max-w-6xl mx-auto px-6` — wider than the current Settings page (`max-w-3xl`) because template cards need breathing room
- Background: `bg-surface-mid` (page background, same as rest of app)

---

## 2. Filter Bar

Positioned directly below the hero section, sticky below the AppShell header on scroll.

### Layout

- Horizontal row of pill-style filter buttons
- Two filter groups separated by a vertical divider (`border-l border-ghost mx-3 h-4`)
- `bg-surface-lowest border-b border-ghost` background, `px-6 py-3`
- Sticky: `sticky top-12 z-40` (below the AppShell header at `top-0 z-50`)

### Filter Groups

**Group 1 — Category** (maps to template tags):
```
All | Minimal | Animated | Data-dense | Dark | Light
```

**Group 2 — Sort**:
```
Default | A-Z | By mode
```

### Pill Design

Each filter pill is a `<button>`:
- Default state: `bg-surface-low text-on-surface-variant text-xs font-mono px-3 py-1 rounded-sm`
- Active state: `bg-primary/10 text-primary` (matches Chip `variant="primary"`)
- Hover: `hover:bg-surface-high transition-colors`
- No border on pills — the background shift is sufficient differentiation

### Behavior

- Single-select within each group (radio behavior, not checkbox)
- "All" is the default for category
- Filtering is instant (client-side, no API call — we have all 27 templates in memory)
- URL params reflect filters: `/templates?category=dark&sort=az` for shareability
- Filtered-out templates animate out with `opacity-0 scale-95` over 150ms, filtered-in templates enter with `opacity-100 scale-100` over 150ms

---

## 3. Template Card Design

Each template is a card in the grid. The card is the primary interactive element on the page.

### Card Anatomy

```
+---------------------------------------+
|                                       |
|   [ Live iframe preview ]             |
|   aspect-[16/10]                      |
|   240px min-height                    |
|                                       |
+---------------------------------------+
|  Template Name              [Active]  |
|  Description text here                |
|  Dark · ● orange · animated           |
|  [ Apply ] [ Full preview -> ]        |
+---------------------------------------+
```

### Preview Area (top section)

- **Renders a real project preview via iframe**, not a wireframe thumbnail
- Source: `<iframe src="/preview/project/${firstProjectDir}?template=${t.name}" />`
- The iframe is scaled down: `transform: scale(0.25); transform-origin: top left;` inside an overflow-hidden container, making a 1200px-wide page fit in ~300px
- Container: `aspect-[16/10] overflow-hidden bg-surface-low rounded-t-md`
- If no project exists (`firstProjectDir` is null), fall back to the existing wireframe thumbnail (the colored rectangles pattern from Settings.tsx)
- Border-bottom: `border-b border-ghost`

### Info Area (bottom section)

- Padding: `p-3`
- **Row 1**: Template name (left) + Active badge (right, only if this is the current theme)
  - Name: `text-sm font-medium text-on-surface` (or `text-primary` if active)
  - Active badge: `<Badge variant="refined">Active</Badge>`
- **Row 2**: Description
  - `text-xs text-on-surface-variant leading-snug` — single line, truncated with ellipsis if needed
- **Row 3**: Metadata chips
  - Mode: `Light` or `Dark` in `font-mono text-[10px] uppercase tracking-wider text-on-surface-variant`
  - Accent dot: `w-2 h-2 rounded-full inline-block` with `background: t.accent`
  - Tags (if any): each as a `<Chip variant="default">` — e.g., `animated`, `minimal`
  - Separated by `middot` characters at `opacity-30`
- **Row 4**: Actions (only visible on hover or for active template)
  - "Apply" button: `text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-on-primary` — hidden if already active
  - "Full preview" link: `text-[11px] text-on-surface-variant hover:text-primary` — opens in new tab
  - These fade in on card hover: `opacity-0 group-hover:opacity-100 transition-opacity duration-150`

### Card Container

- `group` class for hover state management
- Default: `bg-surface-lowest border border-ghost rounded-md overflow-hidden`
- Hover: `hover:border-outline-variant hover:shadow-sm transition-all duration-150`
- Active: `border-2 border-primary ring-1 ring-primary/20` (same as current Settings pattern)
- The entire card is NOT a button — the "Apply" button within it is the action target. This avoids the accessibility issue of nested interactive elements (the "Full preview" link lives inside too).

### Grid Layout

- Desktop (>= 1024px): `grid-cols-3 gap-5`
- Tablet (>= 640px): `grid-cols-2 gap-4`
- Mobile (< 640px): `grid-cols-1 gap-4`
- Cards animate in on mount with staggered `fadeIn`: each card gets `animation-delay: ${index * 30}ms`

---

## 4. Preview Interaction

### Hover

- Card border transitions from `border-ghost` to `border-outline-variant`
- Subtle shadow appears (`shadow-sm`)
- Action buttons (Apply / Full preview) fade in
- The iframe preview does NOT zoom or animate — it remains static. Movement within the preview iframe would be distracting.

### Click "Apply"

1. Immediately updates `currentTheme` state
2. Calls `saveTheme(t.name)` (existing API)
3. The previously active card loses its `border-primary` + badge
4. The newly selected card gains `border-primary` + "Active" badge
5. A toast-style confirmation appears at the bottom of the page: "Theme updated to Editorial" — auto-dismisses after 2 seconds
6. The hero section's "Currently active" indicator updates

### Click "Full preview"

- Opens `/preview/project/${firstProjectDir}?template=${t.name}` in a new tab
- If no project exists, this link is hidden entirely

### Empty State

If no templates match the current filter:
- Centered message: "No templates match this filter."
- `text-sm text-on-surface-variant py-12 text-center`
- Below it: a "Clear filters" button that resets to "All"

---

## 5. Active Theme Indication

Three levels of indication, ensuring the active theme is always identifiable:

1. **Hero section** (always visible): Shows the active template name, description, and a mini preview thumbnail. This persists even when scrolled past the active card.

2. **Card border**: The active card has `border-2 border-primary ring-1 ring-primary/20` — a visually heavier treatment than the `border border-ghost` on inactive cards. This is immediately scannable in a grid of 27 cards.

3. **Active badge**: Inside the card's info area, top-right: `<Badge variant="refined">Active</Badge>` — the green badge matches the "refined" treatment used elsewhere in the app for positive status.

4. **Card name color**: Active card's template name renders in `text-primary` instead of `text-on-surface`.

---

## 6. Mobile Responsive Approach

### Breakpoints

| Breakpoint | Grid | Card preview | Filter bar |
|---|---|---|---|
| >= 1024px | 3 columns | iframe preview | Horizontal pills, all visible |
| >= 640px | 2 columns | iframe preview | Horizontal pills, scrollable |
| < 640px | 1 column | iframe preview | Horizontal scroll with fade hints |

### Mobile-specific adjustments

- **Hero section**: Stacks vertically. Title on top, active theme summary below (full width, not side-by-side).
- **Filter bar**: Horizontal scroll with `overflow-x-auto` and `-webkit-overflow-scrolling: touch`. Fade gradient on the right edge to hint at more pills (`mask-image: linear-gradient(to right, black 85%, transparent)`).
- **Cards**: Single column, full width. The iframe preview still works at full width (and looks better since the scale factor can be larger).
- **Action buttons**: Always visible on mobile (no hover state available), not hidden behind `group-hover`.
- **Sticky filter bar**: Remains sticky on mobile — critical for filtering 27 templates on a long scroll.

### Touch interactions

- No hover states on mobile — actions are always visible
- Cards do not have a tap-to-expand pattern. "Apply" and "Full preview" are always accessible.
- Pull-to-refresh is not needed (templates are static data)

---

## 7. Navigation Integration

### Route

Add to `App.tsx`:
```tsx
<Route path="/templates" element={<TemplateBrowser />} />
```

### Entry Points

1. **Settings page**: Replace the inline template browser with a link: "Browse all templates" that navigates to `/templates`
2. **AppShell**: No global nav link needed — templates are a configuration concern, not a daily-use page

### AppShell Configuration

```tsx
<AppShell
  back={{ label: 'Settings', to: '/settings' }}
  chips={[{ label: 'Templates' }]}
/>
```

---

## 8. Data Requirements

### Current TemplateInfo Type

```ts
interface TemplateInfo {
  name: string
  description: string
  accent: string
  mode: 'light' | 'dark'
  builtIn: boolean
}
```

### Required Additions

Add `tags` and `label` fields to `TemplateInfo`:

```ts
interface TemplateInfo {
  name: string
  label: string          // Display name (e.g., "Editorial", "Kinetic")
  description: string
  accent: string
  mode: 'light' | 'dark'
  builtIn: boolean
  tags?: string[]        // e.g., ['animated'], ['minimal', 'data-dense']
}
```

Update `BUILT_IN_TEMPLATES` in `src/render/templates.ts`:

```ts
{ name: 'editorial', label: 'Editorial', description: 'Classic light theme...', accent: '#084471', mode: 'light', tags: [] },
{ name: 'kinetic', label: 'Kinetic', description: 'Dark with orange...', accent: '#f97316', mode: 'dark', tags: ['animated', 'data-dense'] },
{ name: 'terminal', label: 'Terminal', description: 'Green-on-black...', accent: '#4ade80', mode: 'dark', tags: ['minimal'] },
{ name: 'minimal', label: 'Minimal', description: 'Ultra-clean light...', accent: '#1c1917', mode: 'light', tags: ['minimal'] },
{ name: 'showcase', label: 'Showcase', description: 'Dark with scroll...', accent: '#818cf8', mode: 'dark', tags: ['animated'] },
```

Note: The spec mentions 27 templates, but we currently have 5 built-in templates. The page design scales to 27 (9 rows of 3) without any layout changes. When more templates are added, no page redesign is needed.

---

## 9. Performance Considerations

### Iframe Previews

27 iframes loading simultaneously would be catastrophic for performance. Mitigation:

1. **Lazy loading**: Use `IntersectionObserver` to only load iframes when their card enters the viewport (with a 200px rootMargin for pre-loading one row ahead)
2. **loading="lazy"**: Set the native `loading="lazy"` attribute on all iframes as a baseline
3. **Placeholder**: Before the iframe loads, show the wireframe thumbnail (the existing colored-rectangles pattern from Settings). Once the iframe fires `onLoad`, crossfade from wireframe to iframe over 150ms.
4. **Limit concurrent iframes**: Cap at 6 iframes loaded simultaneously. Cards scrolled far out of view can have their iframe `src` removed to free memory.

### Filter Transitions

- Use CSS transitions only (no JS animation library)
- `transition: opacity 150ms ease, transform 150ms ease` on cards
- Filtered-out cards get `opacity-0 scale-[0.97] pointer-events-none` then `display: none` after the transition completes (use `transitionend` event)

---

## 10. Accessibility

- **Filter pills**: Use `role="radiogroup"` on the filter container, `role="radio"` + `aria-checked` on each pill
- **Cards**: Each card is a `<article>` with `aria-label="${template.label} template"`
- **Active indication**: The "Active" badge text is sufficient for screen readers. Additionally, `aria-current="true"` on the active card's article element.
- **Iframe previews**: Each iframe gets `title="${template.label} template preview"` and `aria-hidden="true"` (the preview is decorative — the card text provides the information)
- **Keyboard navigation**: Tab order flows through filter pills, then through cards (Apply button, then Full preview link within each card)
- **Focus visible**: Standard `:focus-visible` ring (`ring-2 ring-primary ring-offset-2`) on all interactive elements
- **Reduced motion**: Wrap staggered card animations in `@media (prefers-reduced-motion: no-preference)` — users who prefer reduced motion see cards appear instantly

---

## 11. Component Breakdown

New file: `app/src/components/TemplateBrowser.tsx`

Internal components (not exported, defined in the same file):

| Component | Purpose |
|---|---|
| `TemplateBrowser` | Top-level page component, owns state |
| `TemplateHero` | Hero section with title + active theme summary |
| `TemplateFilters` | Sticky filter bar with pill buttons |
| `TemplateGrid` | Grid container + empty state |
| `TemplateCard` | Individual template card with preview + info + actions |
| `TemplateSaveToast` | Auto-dismissing confirmation toast |

State management:
- `currentTheme: string` — fetched from `fetchTheme()` on mount
- `templates: TemplateInfo[]` — fetched from `fetchTemplates()` on mount
- `firstProjectDir: string | null` — fetched from `fetchProjects()` on mount
- `activeCategory: string` — filter state, default `'all'`
- `activeSort: string` — sort state, default `'default'`
- `toastMessage: string | null` — for the save confirmation

No new API endpoints needed. All data comes from existing endpoints:
- `GET /api/templates` (template list)
- `GET /api/settings/theme` (current theme)
- `POST /api/settings/theme` (save theme)
- `GET /api/projects` (to find first project for preview URLs)

---

## 12. Settings Page Changes

The current Settings page has an inline template browser (the expandable card grid inside the "Portfolio theme" card). This should be simplified to:

1. Keep the active theme summary (thumbnail + name + description)
2. Replace the "Browse themes" toggle button with a `<Link to="/templates">` styled as the same button: "Browse all templates"
3. Remove the `showTemplateBrowser` state and the entire inline grid
4. Keep the "Preview site" link

This keeps Settings focused on configuration summaries and pushes the browsing experience to the dedicated page.
