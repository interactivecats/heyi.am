# heyi.am

Turn AI coding sessions into portfolio case studies. Developers connect their Claude Code sessions, and heyi.am extracts signal — the decisions, corrections, and architectural thinking — to build project-level narratives that show how they actually work.

## Architecture

```
cli/          Node.js CLI + React UI — parses sessions, runs AI triage/enhance, serves local UI
  src/        Express server, session parsers, LLM prompts
  app/        React (Vite) frontend for the upload flow
phoenix/      Elixir/Phoenix web app — public portfolios, auth, API, object storage
docker-compose.dev.yml   Postgres + SeaweedFS (S3-compatible) + Phoenix
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for Phoenix backend)
- Elixir 1.15+ (optional, if running Phoenix outside Docker)

## Quick Start

### 1. Start the backend (Phoenix + Postgres + S3)

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **Postgres** on `localhost:5432`
- **SeaweedFS** (S3-compatible storage) on `localhost:8333`
- **Phoenix** on `localhost:4000` — auto-runs `mix ecto.create && mix ecto.migrate`

### 2. Start the CLI

```bash
cd cli
npm install
npm run dev
```

This runs concurrently:
- Express API server (session parser + LLM endpoints)
- Vite dev server for the React UI

Open `http://localhost:17845` to see the upload flow.

### 3. Connect to Phoenix

Set the Phoenix API URL for local dev:

```bash
HEYIAM_API_URL=http://localhost:4000 npm run dev
```

For AI enhancement with your own key:

```bash
ANTHROPIC_API_KEY=sk-ant-... HEYIAM_API_URL=http://localhost:4000 npm run dev
```

## Common Commands

### CLI

```bash
cd cli
npm run dev              # Start dev server (API + React UI)
npm run build            # Build CLI + React app
npm test                 # Run all tests (backend + frontend)
npm run test:backend     # CLI server tests only
npm run test:frontend    # React app tests only
```

### Phoenix (inside Docker)

```bash
# Run a mix command in the running container
docker compose -f docker-compose.dev.yml exec phoenix mix <command>

# IEx console
docker compose -f docker-compose.dev.yml exec phoenix iex -S mix

# Run tests
docker compose -f docker-compose.dev.yml exec phoenix mix test

# Compile check
docker compose -f docker-compose.dev.yml exec phoenix mix compile --warnings-as-errors
```

### Database

```bash
# Reset database (drop + create + migrate)
# Use `run` instead of `exec` if Phoenix crashed on startup (e.g. migration errors)
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

### Docker

```bash
# Start all services
docker compose -f docker-compose.dev.yml up -d

# View Phoenix logs
docker compose -f docker-compose.dev.yml logs -f phoenix

# Rebuild Phoenix container (after Dockerfile/deps changes)
docker compose -f docker-compose.dev.yml up -d --build phoenix

# Stop everything
docker compose -f docker-compose.dev.yml down

# Stop and remove all data
docker compose -f docker-compose.dev.yml down -v
```

## Deployment

See [docs/COOLIFY_DEPLOY.md](./docs/COOLIFY_DEPLOY.md) for full Coolify deployment instructions.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEYIAM_API_URL` | `https://heyi.am` | Phoenix API base URL. Set to `http://localhost:4000` for local dev. |
| `ANTHROPIC_API_KEY` | — | Enables local AI enhancement (BYOK mode). Without it, uses proxy mode via Phoenix. |

## Project Structure

### CLI (`cli/`)

- `src/parsers/` — Claude Code session JSONL parsers
- `src/llm/triage.ts` — 3-layer AI triage (hard floor + signal extraction + LLM ranking)
- `src/llm/project-enhance.ts` — Project narrative generation + refinement
- `src/server.ts` — Express API server (local endpoints + Phoenix proxy)
- `app/src/components/ProjectUploadFlow.tsx` — Multi-step upload wizard
- `app/src/components/ProjectDashboard.tsx` — Project cards landing page

### Phoenix (`phoenix/`)

- `lib/heyi_am/projects/` — Project schema + context (first-class entity)
- `lib/heyi_am/shares/` — Session share schema (belongs_to project)
- `lib/heyi_am_web/controllers/portfolio_controller.ex` — Public portfolio pages
- `lib/heyi_am_web/controllers/project_api_controller.ex` — Project API (upsert)
- `lib/heyi_am_web/controllers/share_api_controller.ex` — Session publish API
- `priv/repo/migrations/` — Single squashed migration (clean schema)
