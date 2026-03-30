# Architecture

## Overview

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

---

## Key Decisions

**CLI-first rendering.** The CLI renders all public page HTML at publish time using `ReactDOMServer.renderToStaticMarkup()`. Phoenix stores the fragment in a DB column and wraps it in a layout shell (nav, footer, OG tags). There is no web editor — the CLI is the single source of truth for how the portfolio looks.

**Domain split for XSS isolation.** Public portfolios serve user-generated HTML via `raw()`. Auth cookies are scoped to `heyiam.com`. Since `heyi.am` (public) and `heyiam.com` (auth) are separate origins, XSS in user content cannot steal session tokens. This is structural ATO prevention — no runtime defense to misconfigure.

**4-app umbrella.** Each Phoenix endpoint has strict invariants: `public_web` has no `Plug.Session`, `app_web` has no `raw()`, `vibe_web` has neither. These guarantees are enforced by the code structure, not by developer discipline.

**SQLite session index.** The CLI maintains `~/.local/share/heyiam/sessions.db` for instant project lookup and full-text search across all sessions from all tools. Replaces filesystem scanning.

**Multi-tool parsers.** Session parsers for Claude Code, Cursor, Codex CLI, and Gemini CLI all produce a consistent `SessionAnalysis` contract. Adding a new tool means writing one parser.

**Pre-publish redaction.** Two-layer secret scanning (secretlint + custom regex) runs before any data leaves the machine. HIGH severity auto-redacts; MEDIUM flags for review.

---

## The CLI (`cli/`)

The CLI is where all content creation happens: session discovery, archiving, search, AI triage, enhancement, narrative generation, and HTML rendering.

### Key Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point (commands: open, time, search, context, archive, sync, status, daemon) |
| `src/server.ts` | Express server, binds all routers |
| `src/parsers/` | Multi-tool session parsers (claude, cursor, codex, gemini) |
| `src/db.ts` | SQLite session index (`~/.local/share/heyiam/sessions.db`) |
| `src/sync.ts` | Observable sync engine (file watcher + Cursor polling) |
| `src/archive.ts` | Hard-link archiving (survives tool cleanup) |
| `src/bridge.ts` | Parser → Analyzer conversion, per-file LOC computation |
| `src/analyzer.ts` | Session enrichment (ExecutionStep, ToolUsage, FileChange) |
| `src/redact.ts` | Two-layer secret scanning (secretlint + regex) |
| `src/search.ts` | Full-text search with faceted filters |
| `src/context-export.ts` | Export sessions as compressed context for AI |
| `src/llm/triage.ts` | 3-layer session selection (see [AI Triage](#ai-triage) below) |
| `src/llm/project-enhance.ts` | Project narrative + question generation |
| `src/render/` | React SSR to HTML fragments |
| `src/routes/` | Express routers (projects, sessions, publish, enhance, search) |
| `app/src/` | React frontend (dashboard, upload flow, session viewer) |

### AI Triage

Session triage uses 3 layers to pick the best sessions for a portfolio:

1. **Hard floor** — filters out sessions under 5 min or 3 turns
2. **Scoring fallback** — heuristic score (correction count, tool diversity, LOC, etc.) used when LLM is unavailable
3. **LLM triage** — sends session metadata to Haiku 4.5, which returns a JSON selection with reasons

**Token budget:** `max_tokens` is set to 40,000 to support up to ~1,000 sessions. Each session produces ~35 output tokens (UUID + reason + JSON syntax). A truncation guard (`stop_reason !== 'end_turn'`) falls back to scoring if the response is cut short.

**Cost estimate** (Haiku 4.5, at 1,000 sessions):

| | Tokens | Rate | Cost |
|---|---|---|---|
| Input | ~75k | $1.00/MTok | ~$0.08 |
| Output | ~36k | $5.00/MTok | ~$0.18 |
| **Total** | | | **~$0.25** |

At typical usage (50-100 sessions) each triage call costs under $0.03.

---

## Session Discovery & Storage

### Discovery

Session discovery (`src/parsers/index.ts`) scans four tool directories:

| Tool | Location | Format |
|------|----------|--------|
| Claude Code | `~/.claude/projects/{dir}/{id}.jsonl` | JSONL |
| Cursor | Cursor's internal SQLite DB | Export to JSONL |
| Codex | `~/.codex/sessions/` | JSONL |
| Gemini | `~/.gemini/tmp/` | JSON |

Claude Code sessions may have **subagents** in `{id}/subagents/*.jsonl`. Discovery flattens parents + children into a single list, deduplicating by session ID to avoid double-counting when the same session exists in both the live directory and the archive.

### Archive

The archive (`src/archive.ts`) preserves session files that tools will delete. Claude Code deletes sessions after 30 days.

- **Hard links** for file-based sources (zero extra disk space — same inode)
- **JSONL export** for Cursor (stores in its own SQLite DB, can't hard-link)
- Location: `~/.local/share/heyiam/sessions/`

Discovery scans live directories first, then the archive. Live files take precedence (may still be receiving entries). Archive files are only used for sessions whose live copy is gone.

### SQLite Index

The DB (`src/db.ts`) at `~/.local/share/heyiam/sessions.db` stores:
- **Session metadata**: duration, LOC, turns, skills, models, timestamps, active intervals
- **Full-text search index** (FTS5): every turn's content (truncated to 10KB/turn)
- **Per-file changes**: `session_files` table with additions/deletions per file
- **Context summary**: compact text summary for offline access after source deletion

The DB enables instant dashboard rendering and search without re-parsing JSONL files.

### Duration Calculation

See [DURATION.md](./DURATION.md) for the full explanation. Summary:

- **Human hours ("You")**: Merge overlapping active intervals across concurrent sessions. One human running 3 parallel sessions for 1 hour = 1 human hour.
- **Agent hours ("Agents")**: Simple sum across all sessions including subagents. Parallel work is additive (3 agents × 1 hour = 3 agent hours).
- **Per-session duration**: Unchanged — sum of sub-threshold gaps within that session.

Active intervals are stored in the DB (`active_intervals` JSON column) at index time, so project-level aggregation never needs to re-parse JSONL files.

---

## Phoenix Web App (`heyi_am_umbrella/`)

Phoenix is a thin serving layer. It stores pre-rendered HTML and wraps it in a layout shell with OG tags, nav, and footer. Auth, API, and settings live on a separate domain.

### Core (`apps/heyi_am/`)

Shared business logic:
- `Accounts` — users, tokens, scopes
- `Projects` — project CRUD (first-class DB entity)
- `Shares` — session case studies (belongs_to project)
- `Vibes` — anonymous vibe results
- `LLM` — enhancement proxy (Gemini/Anthropic)
- `ObjectStorage` — S3-compatible storage (Cloudflare R2 / SeaweedFS)
- `Profiles` — AI collaboration profile computation
- `Repo` — single Ecto repo shared by all apps

### Public Web (`apps/heyi_am_public_web/`) — port 4000

`heyi.am` — serves pre-rendered HTML portfolios and session case studies.

- **No `Plug.Session`** — cookies cannot exist on this domain
- Routes: `/:username`, `/:username/:project`, `/s/:token`, `/s/:token/transcript`

### App Web (`apps/heyi_am_app_web/`) — port 4001

`heyiam.com` — auth, API, settings.

- Auth (phx.gen.auth + GitHub OAuth + RFC 8628 device auth)
- API endpoints for CLI (publish projects, sessions, profiles, time stats)
- Settings, onboarding (LiveView)
- Session cookies scoped to `heyiam.com` only

### Vibe Web (`apps/heyi_am_vibe_web/`) — port 4002

`howdoyouvibe.com` — anonymous vibes.

- Vibe results and archetype pages
- Rate-limited API for creating vibes and generating narratives
- No auth, no sessions

### Security Invariants

| App | Has `Plug.Session`? | Has `raw()`? | Has CSRF? | Has LiveView? |
|-----|---------------------|-------------|-----------|---------------|
| `public_web` | No | Yes (user HTML) | No | No |
| `app_web` | Yes | No | Yes | Yes |
| `vibe_web` | No | No | No | No |

---

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
                                 → lists project (draft → listed)
                                 → sets visibility (listed/unlisted)

                                                                  GET /ben
                                                                  → serves rendered_portfolio_html

                                                                  GET /ben/heyi-am
                                                                  → serves project.rendered_html

                                                                  GET /s/token
                                                                  → serves share.rendered_html
```

---

## Shared Packages

### @heyiam/ui (`packages/ui/`)

Shared React visualization components used in both CLI and Phoenix:
- `GrowthChart` — cumulative LOC over time
- `WorkTimeline` — session progression timeline
- `DirectoryHeatmap` — file-level edit intensity

Built with esbuild to ESM for embedding in Phoenix HEEx templates via `data-*` mount points.

---

## Database

Single PostgreSQL database, clean migrations:
1. `create_users` — users + users_tokens
2. `create_projects` — projects table
3. `create_shares` — shares (sessions) with project FK
4. `create_vibes` — vibes table (independent, no FKs to core)
5. `create_device_codes` — device auth
6. `create_enhancement_usage` — LLM quota tracking

---

## Deployment

One Docker image, one container, three ports. Coolify/Traefik routes each domain to its port. See [COOLIFY_DEPLOY.md](./COOLIFY_DEPLOY.md) for full instructions.

```
heyi.am          → container:4000  (public_web)
heyiam.com       → container:4001  (app_web)
howdoyouvibe.com → container:4002  (vibe_web)
```
