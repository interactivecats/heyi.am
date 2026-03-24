# Umbrella Architecture

## Motivation

heyi.am serves user-generated HTML via `raw()`. If auth cookies exist on the same domain, XSS leads to Account Takeover. Physical separation into separate Phoenix endpoints eliminates this by design — no runtime defense to misconfigure.

## Structure

Four Elixir apps under one umbrella at `heyi_am_umbrella/`:

```
heyi_am_umbrella/
  apps/
    heyi_am/                 # Core: contexts, schemas, repo, LLM, mailer, storage
    heyi_am_public_web/      # heyi.am       (port 4000) — portfolios, sessions, shares
    heyi_am_app_web/         # heyiam.com    (port 4001) — auth, API, settings, LiveView
    heyi_am_vibe_web/        # howdoyouvibe.com (port 4002) — vibe gallery + API
  config/                    # Shared config (config.exs, dev.exs, runtime.exs, etc.)
  mix.exs                    # Umbrella root
```

### Core (`heyi_am`)

Business logic shared by all web apps. Contains:
- `Accounts` — users, tokens, scopes
- `Projects` — project CRUD
- `Shares` — session case studies
- `Vibes` — anonymous vibe results
- `LLM` — enhancement proxy (Gemini/Anthropic)
- `ObjectStorage` — S3-compatible file storage (R2/SeaweedFS)
- `Mailer` — email via Swoosh
- `Repo` — single Ecto repo shared by all apps

### Public Web (`heyi_am_public_web`) — port 4000

Serves pre-rendered HTML portfolios and session case studies at `heyi.am`.

Routes:
- `GET /` — landing page
- `GET /s/:token` — shared session case study
- `GET /s/:token/transcript` — session transcript
- `GET /s/:token/verify` — verification page
- `GET /:username` — portfolio
- `GET /:username/:project` — project page
- `GET /:username/:project/:session` — session in project context
- `GET /terms`, `GET /privacy` — legal pages

### App Web (`heyi_am_app_web`) — port 4001

Auth, API, and settings at `heyiam.com`. Full browser pipeline with sessions, CSRF, LiveView.

API routes:
- `POST /api/device/code`, `POST /api/device/token` — device auth flow
- `POST /api/projects` — create/upsert project
- `POST /api/sessions` — publish session
- `POST /api/enhance` — LLM enhancement proxy
- `PATCH /api/profile` — update rendered portfolio HTML
- `POST /api/time-stats` — publish coding time stats

Browser routes:
- `/users/register`, `/users/log-in`, `/users/log-out` — auth
- `/users/settings` — email, password, export, delete
- `/onboarding/username` — claim username (LiveView)
- `/device` — device auth approval (LiveView)
- `/auth/:provider/callback` — GitHub OAuth
- `/admin/dashboard` — Phoenix LiveDashboard (admin only)

### Vibe Web (`heyi_am_vibe_web`) — port 4002

Anonymous vibe quiz at `howdoyouvibe.com`. No sessions, no auth.

Routes:
- `GET /` — quiz landing
- `GET /:short_id` — vibe result page
- `GET /archetypes/:id` — archetype detail
- `POST /api/vibes` — create vibe (rate limited)
- `POST /api/vibes/narrative` — generate AI narrative (rate limited)

## Security Invariants

| App | Has `Plug.Session`? | Has `raw()`? | Has CSRF? | Has LiveView? |
|-----|---------------------|-------------|-----------|---------------|
| `public_web` | No | Yes (user HTML) | No | No |
| `app_web` | Yes | No | Yes | Yes |
| `vibe_web` | No | No | No | No |

The key guarantee: **`public_web` never has session cookies, so XSS in user-generated HTML cannot steal auth tokens.** Cookie isolation comes from separate registrable domains (`heyi.am` vs `heyiam.com`), not runtime checks.

All three apps share `HeyiAm.Repo` from core — one database, one connection pool.

## Domain Split

| Domain | App | Purpose |
|--------|-----|---------|
| `heyi.am` | `public_web` | Public portfolios, strict CSP (`script-src 'self'`) |
| `heyiam.com` | `app_web` | Auth, API, settings — session cookies scoped here |
| `howdoyouvibe.com` | `vibe_web` | Anonymous vibes, no cookies |

## Data Flow

```
CLI                              App Web (heyiam.com)              Public Web (heyi.am)
───                              ───────────────────              ──────────────────────

heyiam login                     POST /api/device/code
                                 POST /api/device/token
                                 → Bearer token

heyiam open → enhance → publish
  POST /api/projects             → creates project (draft)
  POST /api/sessions             → creates sessions (draft)
  PATCH /api/profile             → stores rendered_portfolio_html

                                 User visits heyiam.com
                                 → publishes project (draft → published)
                                 → sets visibility (published/unlisted)

                                                                  GET /ben
                                                                  → serves rendered_portfolio_html

                                                                  GET /ben/heyi-am
                                                                  → serves project.rendered_html

                                                                  GET /s/token
                                                                  → serves share.rendered_html
```

## Dev Setup

Each endpoint runs on a different localhost port — no `/etc/hosts` needed:

- `http://localhost:4000` — public portfolios (public_web)
- `http://localhost:4001` — auth, API, settings (app_web)
- `http://localhost:4002` — vibes (vibe_web)

Start all three: `cd heyi_am_umbrella && mix phx.server`

## Deployment

One Docker image, one container, three ports. Coolify/Traefik routes each domain to its port:

```
heyi.am          → container:4000  (public_web)
heyiam.com       → container:4001  (app_web)
howdoyouvibe.com → container:4002  (vibe_web)
```

See [COOLIFY_DEPLOY.md](./COOLIFY_DEPLOY.md) for full deployment instructions.

### Environment Variables (domain/port)

```env
PUBLIC_HOST=heyi.am
APP_HOST=heyiam.com
VIBE_HOST=howdoyouvibe.com

# Ports (optional, defaults shown)
PUBLIC_PORT=4000
APP_PORT=4001
VIBE_PORT=4002
```

## Database

Single database, clean migrations:
1. `create_users` — users + users_tokens
2. `create_projects` — projects table
3. `create_shares` — shares (sessions) with project FK
4. `create_vibes` — vibes table (independent, no FKs to core)
5. `create_device_codes` — device auth
6. `create_enhancement_usage` — LLM quota tracking
