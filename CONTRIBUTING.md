# Contributing to heyi.am

Thanks for your interest in contributing! This guide covers the basics.

## Getting Started

```bash
# Clone and install
git clone https://github.com/interactivecats/heyi.am.git
cd heyi.am
npm install
cd cli/app && npm install && cd ../..

# CLI development
cd cli && npm run dev

# Phoenix backend (requires Docker)
docker compose -f docker-compose.dev.yml up -d

# Run tests
cd cli && npm test
docker compose -f docker-compose.dev.yml exec phoenix mix test
```

## Project Structure

| Directory | What |
|-----------|------|
| `cli/` | TypeScript CLI + local dashboard (npm package `heyiam`) |
| `heyi_am_umbrella/` | Elixir/Phoenix backend (umbrella app) |
| `packages/howdoyouvibe/` | Standalone vibe analysis tool |
| `daemon/` | Tauri-based system tray daemon |
| `docs/` | Product specs and architecture docs |

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Keep commits focused on a single logical change
3. Add tests for new functionality
4. Make sure all tests pass before submitting
5. Write a clear PR description explaining *what* and *why*

## Code Style

- TypeScript for CLI code, Elixir for backend
- No decorative CSS — typography and whitespace carry the design
- All AI-generated text must sound like a dev thinking out loud, never like AI explaining

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node version, tool versions)

## Security

If you find a security vulnerability, please report it responsibly. See [SECURITY.md](./SECURITY.md) for details.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
