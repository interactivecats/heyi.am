# @heyiam/ui Architecture

## Purpose

Shared CSS and JS for rendering portfolio pages. Two consumers, identical output:

- **CLI** — preview during upload flow (localhost:17845)
- **Phoenix public_web** — production pages (heyi.am)

## How It Works

```
CLI (React)                    @heyiam/ui                    Phoenix (public_web)
───────────                    ──────────                    ────────────────────

renderProjectHtml()            CSS: project-preview__*       GET /:username/:project
renderSessionHtml()            CSS: timeline__*, chip        GET /s/:token
renderPortfolioHtml()          JS: mount script              GET /:username
        │                          │                              │
        ▼                          ▼                              ▼
   Pure HTML body              Shared styles +             raw(@rendered_html)
   + data-* mount points      viz hydration JS             + <head> with CSS/JS
        │                          │                              │
        └──────────────────────────┴──────────────────────────────┘
                              Same visual result
```

## Body HTML Contract

The CLI renders HTML body fragments via `renderToStaticMarkup()`. These are:

- **Pure structural HTML** — no `<script>`, no SVG, no `<form>`, no event handlers
- **Sanitized server-side** — Phoenix strips anything unsafe via `HeyiAm.HtmlSanitizer`
- **Self-contained** — no `<html>`, no `<head>`, just the body content

### Root Element Attributes

Every rendered body has two data attributes on its root element:

```html
<div class="project-preview__content"
     data-render-version="1"
     data-template="editorial">
  ...
</div>
```

- **`data-render-version`** — Integer version of the render format. Allows CSS to support
  old HTML when the class structure changes. Current version: `1`.
- **`data-template`** — Visual template name. CSS scopes template-specific styles under
  this attribute. Values: `editorial` (default), `terminal`, `minimal`, `brutalist`,
  `campfire`, `neon-night`.

### Visualization Mount Points

Interactive visualizations are **not** embedded as SVG in the body. Instead, the body
contains empty `<div>` elements with data attributes that the client-side JS hydrates:

```html
<!-- Work Timeline — rendered by @heyiam/ui JS -->
<div data-work-timeline
     data-username="ben"
     data-project-slug="heyi-am" />

<!-- Growth Chart -->
<div data-growth-chart
     data-username="ben"
     data-project-slug="heyi-am" />

<!-- Directory Heatmap -->
<div data-directory-heatmap
     data-username="ben"
     data-project-slug="heyi-am" />
```

The JS mount script in `@heyiam/ui` finds these elements on page load and renders
the corresponding React components (WorkTimeline, GrowthChart, DirectoryHeatmap).
Data is fetched from the API using the username + project slug.

## Versioning Strategy

When the render format changes (new class names, different structure):

1. Bump `data-render-version` to `2` in the render components
2. Keep CSS rules for version `1` — scope new rules under `[data-render-version="2"]`
3. Old uploaded HTML continues to render correctly with version 1 CSS
4. Users re-uploading from a new CLI version get the new format automatically

Breaking changes to class names require version bumps. Additive changes (new elements,
new data attributes) do not.

## Template Strategy

Templates are CSS-only. The HTML structure is identical across templates — only the
visual styling changes based on `data-template`:

```css
/* Default (editorial) */
.project-preview__title { font-family: 'Space Grotesk'; }

/* Terminal override */
[data-template="terminal"] .project-preview__title {
  font-family: 'IBM Plex Mono';
  color: var(--terminal-green);
}
```

The CLI sets the template at render time. Phoenix serves whatever template the HTML
specifies — no server-side template logic needed.

## File Layout

```
packages/ui/
  src/
    index.ts              — exports viz components + mount function
    types.ts              — shared data types
    WorkTimeline.tsx       — SVG work timeline visualization
    GrowthChart.tsx        — cumulative LOC growth chart
    DirectoryHeatmap.tsx   — file edit intensity heatmap
    mount.ts              — finds data-* elements, hydrates with React components
  css/
    portfolio.css         — shared styles for rendered pages
  ARCHITECTURE.md         — this file
```
