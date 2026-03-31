# heyiam

[![npm version](https://img.shields.io/npm/v/heyiam)](https://www.npmjs.com/package/heyiam)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/interactivecats/heyi.am/blob/main/LICENSE)

Local-first CLI that indexes your AI coding sessions. Search locally, enhance with AI, and publish a portfolio of real work.

Discovers sessions from **Claude Code**, **Cursor**, **OpenAI Codex CLI**, and **Google Gemini CLI**.

## Get Started

```bash
npx heyiam
```

Opens a local dashboard at `localhost:17845`. Browse projects, search sessions, and publish portfolio case studies to `heyi.am/:username`.

## Commands

| Command | Description |
|---------|-------------|
| `heyiam` / `heyiam open` | Start local dashboard |
| `heyiam search [query]` | Full-text search across all sessions |
| `heyiam time` | Your time vs agent time per project |
| `heyiam context <id>` | Export session as compressed context for AI tools |
| `heyiam archive` | Discover and archive sessions from all sources |
| `heyiam sync` | Index sessions into SQLite |
| `heyiam status` | Archive health, session counts, daemon status |

## Privacy

Everything stays local by default. Nothing leaves your machine unless you explicitly publish.

- Sessions are read from local tool storage (read-only)
- SQLite search index lives at `~/.local/share/heyiam/`
- Config at `~/.config/heyiam/`
- Common secret patterns are detected and redacted before upload, but this is not a guarantee

AI enhancement runs locally using your own `ANTHROPIC_API_KEY`.

## Links

- [heyi.am](https://heyi.am) — published portfolios
- [heyiam.com](https://heyiam.com) — dashboard and auth
- [GitHub](https://github.com/interactivecats/heyi.am) — source code
