# heyi.am

A portfolio that shows **how you think with AI**, not what the AI said.

Developers connect their AI coding tools — Claude Code, Cursor, OpenAI Codex CLI, and Google Gemini CLI — and heyi.am extracts the decisions, corrections, and architectural thinking that build project-level narratives showing how they actually work.

## How It Works

```
Developer codes with any AI tool
  (Claude Code, Cursor, Codex, Gemini CLI)
        ↓
Sessions auto-saved locally by each tool
        ↓
heyiam open → React dashboard at localhost:17845
        ↓
CLI discovers sessions, indexes in SQLite
        ↓
Select a project → upload wizard
        ↓
AI triage picks best sessions (3-layer: hard floor → signal extraction → LLM ranking)
        ↓
AI generates project narrative, asks targeted questions
        ↓
CLI renders HTML fragments (React SSR)
        ↓
POST rendered HTML to Phoenix API (heyiam.com)
        ↓
Portfolio live at heyi.am/:username/:project
```

## Architecture

The system has four major components that each serve a distinct role:

```
┌────────────────────────────────────────────────────────────────┐
│  CLI (heyiam)                                                  │
│  Node.js + Express + React (Vite)                              │
│  All content creation: parsing, triage, enhancement, rendering │
│  Runs locally at localhost:17845                               │
└──────────────────────────┬─────────────────────────────────────┘
                           │ POST rendered HTML
┌──────────────────────────▼─────────────────────────────────────┐
│  Phoenix Umbrella (heyi_am_umbrella/)                          │
│  4 Elixir apps sharing one Ecto repo                           │
│                                                                │
│  ┌─────────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ public_web :4000│ │ app_web :4001│ │ vibe_web :4002     │  │
│  │ heyi.am         │ │ heyiam.com   │ │ howdoyouvibe.com   │  │
│  │ Portfolios      │ │ Auth + API   │ │ Anonymous vibes    │  │
│  │ No cookies      │ │ Sessions     │ │ No auth            │  │
│  └─────────────────┘ └──────────────┘ └────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ heyi_am (core) — schemas, contexts, repo, LLM, storage  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐  ┌──────────────────────────────┐
│  howdoyouvibe (standalone)   │  │  daemon (early-stage)        │
│  npx howdoyouvibe            │  │  Tauri tray app              │
│  Personality breakdown CLI   │  │  Background session sync     │
│  No heyiam dependency        │  │  com.heyiam.daemon           │
└──────────────────────────────┘  └──────────────────────────────┘
```

### Key Architectural Decisions

**CLI-first rendering.** The CLI renders all public page HTML at publish time using `ReactDOMServer.renderToStaticMarkup()`. Phoenix stores the fragment in a DB column and wraps it in a layout shell (nav, footer, OG tags). There is no web editor — the CLI is the single source of truth for how the portfolio looks.

**Domain split for XSS isolation.** Public portfolios serve user-generated HTML via `raw()`. Auth cookies are scoped to `heyiam.com`. Since `heyi.am` (public) and `heyiam.com` (auth) are separate origins, XSS in user content cannot steal session tokens. This is structural ATO prevention — no runtime defense to misconfigure.

**4-app umbrella.** Each Phoenix endpoint has strict invariants: `public_web` has no `Plug.Session`, `app_web` has no `raw()`, `vibe_web` has neither. These guarantees are enforced by the code structure, not by developer discipline.

**SQLite session index.** The CLI maintains `~/.config/heyiam/sessions.db` for instant project lookup and full-text search across all sessions from all tools. Replaces filesystem scanning.

**Multi-tool parsers.** Session parsers for Claude Code, Cursor, Codex CLI, and Gemini CLI all produce a consistent `SessionAnalysis` contract. Adding a new tool means writing one parser.

**Pre-publish redaction.** Two-layer secret scanning (secretlint + custom regex) runs before any data leaves the machine. HIGH severity auto-redacts; MEDIUM flags for review.

---

## The CLI (`cli/`)

The CLI is where all content creation happens: session discovery, AI triage, enhancement, narrative generation, and HTML rendering.

### Install and Run

```bash
cd cli
npm install
npm run dev
```

This starts concurrently:
- **Express API server** — session parsing, LLM endpoints, SQLite sync
- **Vite dev server** — React UI for the upload flow

Open `http://localhost:17845` to see the project dashboard.

### What the CLI Does

**Session Discovery.** Finds sessions from all four AI tools by scanning their known directories. A file watcher detects new sessions in real-time; Cursor sessions are polled periodically since they use a different storage model.

**SQLite Index.** Sessions are indexed into `~/.config/heyiam/sessions.db` with full-text search. The dashboard reads from SQLite, not the filesystem — project listing and search are instant regardless of how many sessions exist.

**Two-Phase Sync:**
1. **Discovering** — scan known tool directories for session files
2. **Indexing** — parse new/changed sessions, extract metadata (LOC, duration, tools, files, models), update FTS index

Sessions whose source files are deleted (e.g. Claude Code purges after 30 days) remain in the SQLite index as an archive. The CLI never auto-deletes — only explicit user action removes sessions.

**AI Triage.** Three-layer approach to selecting which sessions to showcase:
1. **Hard floor** (no LLM) — skip sessions < 5 min, < 3 turns, 0 files changed
2. **Signal extraction** (no LLM) — score by correction count, explanation length, error/retry count, architectural keywords
3. **LLM ranking** (Haiku) — final selection with significance tags; falls back to weighted scoring if no LLM available

**Project Narrative.** Two-pass generation:
1. AI generates draft narrative + 2-3 targeted questions based on session patterns
2. User answers questions (optional)
3. AI rewrites narrative incorporating the user's voice

**Anti-Fluff System.** Banned words (leverage, utilize, streamline, robust, seamless). Developer take is required and cannot be verbatim AI text. Questions are pattern-based ("You overrode the AI 4 times — was that a conscious strategy?"), not generic.

**HTML Rendering.** React components render to static HTML fragments via `ReactDOMServer`. Output is self-contained fragments (no `<html>`, no `<head>`) that use the same CSS class names as Phoenix's stylesheet. Pixel-perfect match between CLI preview and published page.

### CLI Commands

```bash
npm run dev              # Start dev server (Express API + Vite React UI)
npm run build            # Build CLI + React app
npm test                 # Run all tests (backend + frontend)
npm run test:backend     # CLI server tests only
npm run test:frontend    # React app tests only
```

### Upload Flow

The React UI at `localhost:17845` provides a multi-step wizard:

1. **Overview** — all sessions in a scrollable table, "Let AI pick sessions" CTA
2. **Triage** — AI's selection with override checkboxes, significance/skip tags
3. **Enhance** — split panel: session processing feed + project narrative streaming
4. **Questions** — 2-3 AI-generated questions with category tags, optional answers
5. **Timeline** — vertical timeline with period headers, featured + collapsed sessions
6. **Review** — project card preview, publish checklist, project details (repo URL, screenshot)
7. **Done** — success page with project URL

### LLM Provider Strategy

The CLI supports three modes for AI features:

| Mode | How | When |
|------|-----|------|
| **BYOK** (local key) | `ANTHROPIC_API_KEY=sk-ant-...` env var, direct Anthropic API calls | Full control, your own billing |
| **Proxy** | Authenticated requests through Phoenix at `POST /api/enhance` | No API key needed, uses server-side LLM |
| **Fallback** | Hard floor + weighted signal scoring, no narrative | Works offline, no AI features |

Resolution order: local key → proxy (if authenticated) → fallback.

### Key Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point (`heyiam open`, `heyiam time`) |
| `src/server.ts` | Express server, binds all routers |
| `src/parsers/` | Multi-tool session parsers (claude, cursor, codex, gemini) |
| `src/db.ts` | SQLite session index (`~/.config/heyiam/sessions.db`) |
| `src/sync.ts` | Observable sync engine (file watcher + Cursor polling) |
| `src/bridge.ts` | Parser → Analyzer conversion, per-file LOC computation |
| `src/analyzer.ts` | Session enrichment (ExecutionStep, ToolUsage, FileChange) |
| `src/redact.ts` | Two-layer secret scanning (secretlint + regex) |
| `src/llm/triage.ts` | 3-layer session selection |
| `src/llm/project-enhance.ts` | Project narrative + question generation |
| `src/render/` | React SSR to HTML fragments |
| `src/routes/` | Express routers (projects, sessions, publish, enhance, search) |
| `app/src/` | React frontend (dashboard, upload flow, session viewer) |

---

## Phoenix Web App (`heyi_am_umbrella/`)

Phoenix is a thin serving layer. It stores pre-rendered HTML and wraps it in a layout shell with OG tags, nav, and footer. Auth, API, and settings live on a separate domain.

### Structure

**Core** (`apps/heyi_am/`) — shared business logic:
- `Accounts` — users, tokens, scopes
- `Projects` — project CRUD (first-class DB entity)
- `Shares` — session case studies (belongs_to project)
- `Vibes` — anonymous vibe results
- `LLM` — enhancement proxy (Gemini/Anthropic)
- `ObjectStorage` — S3-compatible storage (Cloudflare R2 / SeaweedFS)
- `Repo` — single Ecto repo shared by all apps

**Public Web** (`apps/heyi_am_public_web/`) — `heyi.am`, port 4000:
- Serves pre-rendered HTML portfolios and session case studies
- **No `Plug.Session`** — cookies cannot exist on this domain
- Routes: `/:username`, `/:username/:project`, `/s/:token`, `/s/:token/transcript`

**App Web** (`apps/heyi_am_app_web/`) — `heyiam.com`, port 4001:
- Auth (phx.gen.auth + GitHub OAuth + RFC 8628 device auth)
- API endpoints for CLI (publish projects, sessions, profiles, time stats)
- Settings, onboarding (LiveView)
- Session cookies scoped to `heyiam.com` only

**Vibe Web** (`apps/heyi_am_vibe_web/`) — `howdoyouvibe.com`, port 4002:
- Anonymous vibe results and archetype pages
- Rate-limited API for creating vibes and generating narratives
- No auth, no sessions

### Content Lifecycle

CLI uploads content as **drafts**. Phoenix controls visibility:

| State | Access | On portfolio? |
|-------|--------|---------------|
| **uploaded** (draft) | Owner only | No |
| **unlisted** | Anyone with link | No |
| **published** | Public | Yes |

- CLI can only create `uploaded` (draft) records
- Phoenix controls publish, unlist, and delete
- Transcript visibility is a separate per-session toggle

### Running Phoenix (Docker)

```bash
# Start all services (Postgres + SeaweedFS + Phoenix)
docker compose -f docker-compose.dev.yml up -d

# This starts:
#   Postgres on localhost:5432
#   SeaweedFS (S3-compatible) on localhost:8333
#   Phoenix on localhost:4000 (auto-runs migrations)

# View Phoenix logs
docker compose -f docker-compose.dev.yml logs -f phoenix

# IEx console
docker compose -f docker-compose.dev.yml exec phoenix iex -S mix

# Run tests
docker compose -f docker-compose.dev.yml exec phoenix mix test

# Rebuild after Dockerfile/deps changes
docker compose -f docker-compose.dev.yml up -d --build phoenix
```

### Database Commands

```bash
# Reset database (drop + create + migrate)
docker compose -f docker-compose.dev.yml run --rm phoenix mix ecto.reset

# Run pending migrations
docker compose -f docker-compose.dev.yml run --rm phoenix mix ecto.migrate

# Rollback last migration
docker compose -f docker-compose.dev.yml run --rm phoenix mix ecto.rollback

# Full nuke (delete volume and recreate)
docker compose -f docker-compose.dev.yml down
docker volume rm heyi-am_heyi_pgdata
docker compose -f docker-compose.dev.yml up -d
```

---

## howdoyouvibe (`packages/howdoyouvibe/`)

Standalone `npx` tool that scans local AI coding sessions and generates a personality breakdown. Zero dependency on the heyiam CLI.

```bash
npx howdoyouvibe
```

### Output: Three Layers

**Layer 1 — Archetype headline** (the tweet): combinatorial primary + modifier. 10 x 10 = 100 combos.
> "The Polite Night Owl who reads 5x more than writes"

**Layer 2 — Narrative** (the hook): 2-sentence dev-voice paragraph, generated via Gemini Flash (~$0.0002/vibe). Input is stats blob + archetype only, never raw session text.
> "You said please in 42% of your turns and coded past midnight more often than not. When you pushed back on the AI, you were right 75% of the time."

**Layer 3 — Raw stats grid** (the proof): ~25 computed stats in three categories:
- **Your Voice** — expletives, corrections, please rate, avg prompt length, questions
- **The AI's Habits** — read:write ratio, apologies, test runs, longest chain
- **The Back-and-forth** — override success, autopilot turns, first blood, scope creep

### How It Works

- Parsers vendored from `cli/src/parsers/` — same multi-tool support
- Stat computation is deterministic and 100% local
- Only computed stats leave the machine (for optional narrative generation)
- Anonymous: no accounts, no tracking, no dependency on heyi.am
- Share URL and downloadable image are optional
- Vibes are stored in Phoenix (`vibe_web`) with zero FKs to core tables — designed for clean extraction

### Development

```bash
cd packages/howdoyouvibe
npm install
npm test          # Run tests with vitest
npm run build     # TypeScript build
```

---

## Daemon (`daemon/`)

Early-stage Tauri desktop app (`heyiam-tray`) for background session monitoring. Runs as a system tray icon, watches for new AI coding sessions, and syncs them to the SQLite index without requiring the CLI to be open.

**Status:** Infrastructure scaffolding only. Uses Tauri with the shell plugin for system command execution.

---

## Shared Packages

### @heyiam/ui (`packages/ui/`)

Shared React visualization components used in both CLI and Phoenix:
- `GrowthChart` — cumulative LOC over time
- `WorkTimeline` — session progression timeline
- `DirectoryHeatmap` — file-level edit intensity

Built with esbuild to ESM for embedding in Phoenix HEEx templates via `data-*` mount points.

---

## Prerequisites

- **Node.js 20+** — CLI and packages
- **Docker & Docker Compose** — Phoenix backend (Postgres, SeaweedFS, Phoenix)
- **Elixir 1.15+** — optional, if running Phoenix outside Docker

## Quick Start

```bash
# 1. Start the backend
docker compose -f docker-compose.dev.yml up -d

# 2. Start the CLI
cd cli && npm install && npm run dev

# 3. Open the dashboard
open http://localhost:17845

# 4. (Optional) Connect to Phoenix for publishing
HEYIAM_API_URL=http://localhost:4000 npm run dev

# 5. (Optional) Enable local AI enhancement
ANTHROPIC_API_KEY=sk-ant-... HEYIAM_API_URL=http://localhost:4000 npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEYIAM_API_URL` | `https://heyi.am` | Phoenix API base URL. Set to `http://localhost:4000` for local dev. |
| `ANTHROPIC_API_KEY` | — | Enables local AI enhancement (BYOK). Without it, uses proxy via Phoenix or falls back to no-LLM mode. |

## URL Structure

```
heyi.am/:username                          → portfolio (project cards, aggregate stats)
heyi.am/:username/:project                 → project page (timeline, narrative, agent activity)
heyi.am/:username/:project/:session-slug   → session case study (in project context)
heyi.am/s/:token                           → session case study (direct share link)
heyi.am/s/:token/transcript                → full raw transcript
```

## Design System

"The Calibrated Archive" — see `mockups/full/DESIGN.md` for the canonical spec.

- **Fonts:** Space Grotesk (display), Inter (body), IBM Plex Mono (labels/code)
- **Primary accent:** Seal Blue (#084471)
- **Surfaces:** 5-tier tonal layering, no 1px borders for sectioning
- **Radii:** tight (0.125-0.375rem) — engineering workbench, not consumer app
- **No:** gradients, glows, glass morphism, pure black, large border-radii, center-aligned prose
- **Yes:** typography, whitespace, tonal layering, ghost borders, monospaced data alignment

Six session templates: Editorial (default), Terminal, Minimal, Brutalist, Campfire, Neon Night.

## Deployment

See [docs/COOLIFY_DEPLOY.md](./docs/COOLIFY_DEPLOY.md) for Coolify deployment instructions. The Phoenix umbrella builds as a single Docker image exposing ports 4000/4001/4002, routed to separate domains via reverse proxy.

## Documentation

| Document | Contents |
|----------|----------|
| [PRODUCT.md](./docs/PRODUCT.md) | Product spec, object model, content lifecycle, anti-fluff system |
| [HOWDOYOUVIBE.md](./docs/HOWDOYOUVIBE.md) | howdoyouvibe implementation spec, stat computation, archetypes |
| [COOLIFY_DEPLOY.md](./docs/COOLIFY_DEPLOY.md) | Production deployment with Coolify |
