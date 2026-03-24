# Rendering Architecture

## Principle

One rendering pipeline. The CLI renders all public page HTML. Phoenix serves it.

---

## How It Works

```
CLI (React)                          Phoenix                         Browser
───────────                          ───────                         ───────

1. User publishes project
   or edits profile

2. React renders HTML fragments
   for each public page:
   - Portfolio index
   - Project page
   - Session case studies

3. POST /api/projects               Stores rendered_html
   { ..., rendered_html: "..." }    in DB column

   POST /api/sessions               Stores rendered_html
   { ..., rendered_html: "..." }    in DB column

   PATCH /api/profile               Stores rendered_portfolio_html
   { ..., rendered_portfolio_html }  in DB column

                                    4. GET /:username
                                       Query user, read
                                       rendered_portfolio_html
                                       Wrap in layout shell         → Full page
                                       (OG tags, nav, footer)

                                    5. GET /:username/:project
                                       Query project, read
                                       rendered_html
                                       Wrap in layout shell         → Full page

                                    6. GET /s/:token
                                       Query share, read
                                       rendered_html
                                       Wrap in layout shell         → Full page
```

## What Phoenix Does

- **Auth:** Login, register, OAuth, device auth, onboarding
- **API:** Receive publishes, serve session data for React islands
- **Serve pre-rendered HTML:** Wrap `rendered_html` in layout shell
- **OG tags:** Computed from DB fields (title, narrative) at request time
- **Static pages:** Home, terms, privacy (still HEEx)
- **Vibes:** howdoyouvibe pages (still HEEx — separate product)

## What Phoenix Does NOT Do

- Render portfolio/project/session page content
- Portfolio editing (no LiveView editor)
- Profile editing (CLI-only)
- Template/accent selection (CLI-only)

## What the CLI Does

- All visual editing (bio, name, accent, template, stat picker)
- HTML rendering at publish time
- Profile editing with re-render + push
- Session enhancement, triage, narrative generation

---

## DB Schema Changes

```sql
-- Add to existing tables
ALTER TABLE projects ADD COLUMN rendered_html text;
ALTER TABLE shares ADD COLUMN rendered_html text;
ALTER TABLE users ADD COLUMN rendered_portfolio_html text;
```

No backward compat needed. Single migration, add columns.

---

## Layout Shell (Phoenix)

Phoenix wraps the pre-rendered HTML in a minimal shell:

```heex
<html>
  <head>
    <!-- OG tags computed from DB fields -->
    <meta property="og:title" content={@title} />
    <meta property="og:description" content={@description} />
    <meta property="og:image" content={@og_image} />
    <!-- Fonts, CSS, favicon -->
  </head>
  <body>
    <nav><!-- minimal topbar --></nav>
    <main>
      {raw(@rendered_html)}
    </main>
    <footer><!-- minimal footer --></footer>
    <!-- JS for React islands (charts, timelines) -->
  </body>
</html>
```

The CSS ships with Phoenix (shared stylesheet). The HTML fragments use the same class names.

### OG Tags

Computed at request time from structured DB fields, NOT baked into the fragment:

| Page | og:title | og:description |
|------|----------|---------------|
| Portfolio | `user.display_name` | `user.bio` |
| Project | `project.title` | `project.narrative` (first 200 chars) |
| Session | `share.title` | `share.dev_take` (first 200 chars) |

---

## Interactive Visualizations (Future)

Interactive visualizations (WorkTimeline, GrowthChart, DirectoryHeatmap) are planned but not yet implemented. When added, they will:

1. Mount on `data-*` attributes in the pre-rendered HTML
2. Fetch data from Phoenix API endpoints at runtime
3. Render client-side

The pre-rendered HTML will include mount points:

```html
<div data-work-timeline data-username="ben" data-project-slug="heyi-am"></div>
<div data-growth-chart data-username="ben" data-project-slug="heyi-am"></div>
```

Phoenix's JS bundle will find these and mount the components.

---

## CLI HTML Rendering

### How the CLI renders

The CLI already has React components for session detail, project cards, etc. To produce HTML fragments:

1. Use `ReactDOMServer.renderToString()` (or `renderToStaticMarkup()`)
2. Render the same components used in the CLI UI
3. Output is a self-contained HTML fragment (no `<html>`, no `<head>`)
4. Fragment uses the same CSS classes as Phoenix's stylesheet

### Render triggers

| Action | What re-renders | Pushed to Phoenix |
|--------|----------------|-------------------|
| Publish project | Project page + all session pages + portfolio index | POST /api/projects + POST /api/sessions + PATCH /api/profile |
| Edit profile (bio, name) | Portfolio index only | PATCH /api/profile |
| Change accent/template | All pages for that user | Batch update |
| Show/hide session | Project page + portfolio index | PATCH /api/projects + PATCH /api/profile |

### File structure

```
cli/src/render/
  portfolio.tsx    — renders portfolio index HTML fragment
  project.tsx      — renders project page HTML fragment
  session.tsx      — renders session case study HTML fragment
  index.ts         — renderPortfolio(), renderProject(), renderSession() exports
```

These import the same React components used by the CLI UI but render to static HTML strings.

---

## CSS Strategy

One CSS file, shared between CLI and Phoenix:

```
cli/app/src/styles/shared.css     — the canonical CSS
phoenix/assets/css/shared.css     — symlink or copy
```

Both apps use identical class names. The CLI renders HTML with these classes. Phoenix serves the CSS. Result: pixel-perfect match.

---

## Editing Flow

All editing happens in the CLI:

```
heyiam open
  → localhost:17845
  → Edit profile (name, bio, location, status)
  → Change accent color
  → Change template
  → Manage projects (publish, update, session show/hide)
  → Each change re-renders affected HTML fragments
  → Pushes to Phoenix via API
```

No web editor. No LiveView. The CLI is the single source of truth for how the portfolio looks.

---

## Migration Path to R2

The `rendered_html` column works today. If scale demands it later:

1. CLI uploads HTML to R2 instead of (or in addition to) DB
2. Phoenix reads from R2 instead of DB column
3. Same data contract — the HTML fragment is identical
4. Add Cloudflare CDN caching in front of R2

This is an afternoon's work when the time comes. The DB column approach has zero infrastructure overhead for now.

---

## Umbrella File Layout

After the umbrella migration, public page serving lives in `public_web` and auth/API in `app_web`:

### Public Web (`apps/heyi_am_public_web/`)

| File | Purpose |
|------|---------|
| `lib/heyi_am_public_web/components/layouts/root.html.heex` | Layout shell for all public pages |
| `lib/heyi_am_public_web/components/app_shell.ex` | Nav + footer for public pages |
| `lib/heyi_am_public_web/controllers/portfolio_controller.ex` | Read rendered_html + serve |
| `lib/heyi_am_public_web/controllers/portfolio_html/rendered.html.heex` | Portfolio wrapper (uses `raw()`) |
| `lib/heyi_am_public_web/controllers/share_controller.ex` | Read rendered_html + serve |
| `lib/heyi_am_public_web/controllers/share_html/rendered.html.heex` | Session wrapper (uses `raw()`) |
| `lib/heyi_am_public_web/controllers/share_html/transcript.html.heex` | Transcript (data-driven) |
| `lib/heyi_am_public_web/controllers/share_html/verify.html.heex` | Verification (data-driven) |
| `lib/heyi_am_public_web/controllers/share_html/gone.html.heex` | Deleted session error page |
| `lib/heyi_am_public_web/controllers/page_html/*` | Static pages (home, terms, privacy) |

### App Web (`apps/heyi_am_app_web/`)

| File | Purpose |
|------|---------|
| Auth LiveViews (login, register, settings, onboarding) | Server-rendered, session cookies |
| API controllers (share, project, profile, enhance) | Receive publishes from CLI |

### Vibe Web (`apps/heyi_am_vibe_web/`)

| File | Purpose |
|------|---------|
| `lib/heyi_am_vibe_web/controllers/vibe_html/*` | Vibe pages (separate product) |
