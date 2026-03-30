# heyi.am

[![npm version](https://img.shields.io/npm/v/heyiam)](https://www.npmjs.com/package/heyiam)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> **Note:** This project is under active development. Expect breaking changes until v1.0.

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

## CLI Commands

| Command | Description |
|---------|-------------|
| `heyiam` / `heyiam open` | Start local dashboard at `localhost:17845` |
| `heyiam search [query]` | Full-text search across all sessions (filters: `--project`, `--source`, `--after`, `--before`, `--skill`, `--file`) |
| `heyiam time` | Show your time vs agent time per project |
| `heyiam context <id>` | Export a session as compressed context for AI tools (`--compact`, `--clipboard`) |
| `heyiam archive` | Discover and archive sessions from all sources |
| `heyiam sync` | Index sessions into SQLite search database |
| `heyiam reindex` | Rebuild the search index from scratch |
| `heyiam status` | Archive health, session counts, daemon status |
| `heyiam logout` | Remove stored auth token |
| `heyiam daemon start\|stop\|install\|uninstall\|status` | Background tray daemon management |

## Privacy & Data

**What stays on your machine:**
- All session files (read from Claude Code, Cursor, Codex, Gemini local storage)
- The SQLite search index
- Archived session copies
- All local commands (`search`, `time`, `context`, `status`, `archive`, `sync`, `reindex`)

**What gets sent to the server (only when you explicitly publish):**
- Project metadata (name, narrative, skills, stats)
- Session case studies you choose to upload (redacted — common secret patterns are detected and replaced via regex and secretlint, but this is not a guarantee)
- Screenshots (uploaded to object storage)

**When the CLI contacts the server:**
- `heyiam open` with an account — authenticates via device code flow
- Publishing a project — uploads project + selected session data to `heyiam.com`
- Never in offline/local-only mode — all local commands work without an account or network

AI enhancement (triage, narrative generation) runs locally using your own `ANTHROPIC_API_KEY`.

## Also

```bash
npx howdoyouvibe
```

An entertaining CLI personality breakdown from your AI coding sessions. 100% local analysis, optional sharing. See [docs/HOWDOYOUVIBE.md](./docs/HOWDOYOUVIBE.md) for details.

## Development

```bash
# Install dependencies
npm install              # root workspaces (packages/*, phoenix/assets)
cd cli/app && npm install && cd ../..  # dashboard (separate to avoid React conflicts)

# CLI (for local dev, point to Phoenix)
cd cli && HEYIAM_API_URL=http://localhost:4001 HEYIAM_PUBLIC_URL=http://localhost:4000 npm run dev

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
| `HEYIAM_PUBLIC_URL` | `https://heyi.am` | Public portfolio base URL. Set to `http://localhost:4000` for local dev. |
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
