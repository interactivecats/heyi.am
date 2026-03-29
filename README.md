# heyi.am

[![npm version](https://img.shields.io/npm/v/heyiam)](https://www.npmjs.com/package/heyiam)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A portfolio that shows **how you think with AI**, not what the AI said.

heyi.am discovers your AI coding sessions from Claude Code, Cursor, OpenAI Codex CLI, and Google Gemini CLI — then helps you turn them into structured case studies that show your problem-solving process.

## Get Started

```bash
npx heyiam
```

This opens a local dashboard at `localhost:17845` that discovers your AI coding sessions.

From there you can browse projects, search sessions, and publish portfolio case studies to `heyi.am/:username`.

## What It Does

**Locally (no account needed):**
- Archives sessions so they survive tool cleanup (Claude Code deletes after 30 days)
- SQLite-indexed search across all your AI sessions
- Per-project time tracking (your time vs agent time)
- Session context export for feeding back into AI tools

**With an account:**
- AI triage picks your best sessions, skips the noise
- Two-pass narrative generation with targeted questions about your thinking
- Portfolio published at `heyi.am/:username/:project`

## Also

```bash
npx howdoyouvibe
```

Standalone personality breakdown from your AI coding sessions. 100% local analysis, optional sharing.

## Development

```bash
# CLI
cd cli && npm install && npm run dev

# Phoenix backend (Postgres + Phoenix)
docker compose -f docker-compose.dev.yml up -d

# Tests
cd cli && npm test
docker compose -f docker-compose.dev.yml exec phoenix mix test
```

### Ports

| Port | What |
|------|------|
| `localhost:17845` | CLI dashboard |
| `localhost:4000` | Public portfolios (heyi.am) |
| `localhost:4001` | Auth + API (heyiam.com) |
| `localhost:4002` | Vibes (howdoyouvibe.com) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEYIAM_API_URL` | `https://heyiam.com` | Phoenix API base URL. Set to `http://localhost:4001` for local dev. |
| `ANTHROPIC_API_KEY` | — | Enables local AI enhancement (BYOK). Without it, uses proxy or falls back to no-LLM mode. |

## Documentation

| Document | Contents |
|----------|----------|
| [PRODUCT.md](./docs/PRODUCT.md) | Product spec, CLI commands, content lifecycle |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture, key decisions, file layout |
| [HOWDOYOUVIBE.md](./docs/HOWDOYOUVIBE.md) | howdoyouvibe implementation spec |
| [COOLIFY_DEPLOY.md](./docs/COOLIFY_DEPLOY.md) | Production deployment |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](./LICENSE)
