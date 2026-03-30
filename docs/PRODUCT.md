# heyi.am — Product Spec

## One-liner

A portfolio that shows **how you think with AI**, not what the AI said.

---

## Product Principle (non-negotiable)

> If it sounds like a blog post, it's wrong.
> If it sounds like a dev explaining what they did, it's right.

Everything flows from this.

---

## How It Works

```
Code with any AI tool -> Sessions saved locally
  (Claude Code, Cursor, Codex, Gemini CLI)
  -> heyiam open -> See your PROJECTS (not sessions)
  -> Click a project -> "Upload Project"
  -> AI triages sessions (picks the best, skips the noise)
  -> AI enhances selected sessions + builds project narrative
  -> Answer 2-3 targeted questions about your thinking
  -> Review timeline, add project links + screenshot
  -> Publish -> Project page is live at heyi.am/:username/:project
```

### Two Apps, One Flow

**CLI** (`heyiam`): Where content gets created. Local project gallery, session archive, AI triage, enhancement, project narrative generation, publishing. Runs locally at localhost:17845.

**Web** (`heyi.am`): Where the portfolio lives. Public pages, user accounts. Phoenix app at localhost:4000.

### Identity

- `heyiam login`: Device auth flow (RFC 8628). Opens browser, user authenticates (email/password or GitHub), CLI gets Bearer token. One time, 30 seconds.
- Auth is required for publishing. No anonymous publish.

---

## The CLI as a Local Tool

Before any publishing happens, the CLI is useful on its own — a local gallery for browsing and preserving your AI coding sessions.

### Session Archive

AI tools delete sessions. Claude Code purges after 30 days. Cursor stores in SQLite that gets overwritten. The CLI archives session files so they survive:

- **File-based tools** (Claude Code, Codex, Gemini): hard links to `~/.config/heyiam/archive/` — zero extra disk space until the original is deleted
- **Cursor**: exports conversation data as JSONL to the archive directory
- Idempotent — runs on every CLI command, not just `heyiam archive`

### SQLite Session Index

All sessions from all tools are indexed into `~/.config/heyiam/sessions.db`:

- Full-text search across session content
- Per-project aggregation (sessions, time, LOC, files, skills)
- Preserved sessions: source file gone, but metadata + context summary survive in the DB
- Two-phase sync: discover → index (parse, extract metadata, update FTS)

### CLI Commands

| Command | What it does |
|---------|-------------|
| `heyiam open` | Start local server + React dashboard at localhost:17845 |
| `heyiam time` | Show your time vs agent time per project (terminal table) |
| `heyiam search [query]` | Full-text search across all sessions (filters: project, source, date, skill, file, duration) |
| `heyiam context <id>` | Export a session as compressed context for AI consumption (compact/summary/full tiers) |
| `heyiam archive` | Discover and archive sessions from all sources |
| `heyiam sync` | Index sessions into SQLite |
| `heyiam reindex` | Rebuild the search index from scratch |
| `heyiam status` | Archive health, session counts, daemon status |
| `heyiam daemon start/stop/install` | Background tray daemon for continuous archiving |

### Background Daemon

Optional Tauri tray app (`heyiam-tray`) that runs in the background, watches for new sessions, and archives them without the CLI being open. Installed via `heyiam daemon install`, auto-start registration for macOS launchd and Linux XDG.

---

## The Core Object: A Project

Projects are the primary unit. Sessions live inside projects.

### Project Structure

1. **Title** — the project name (from directory name, editable)
2. **Narrative** — AI-generated, refined with developer's answers. 2-3 sentences describing what was built and why.
3. **Project Arc** — 4-7 high-level phases (e.g., "Foundation -> Identity -> Trust -> Presentation")
4. **Timeline** — chronological view grouped by time period, featured sessions as expanded cards, small sessions collapsed
5. **Skills** — aggregated from all sessions, deduplicated
6. **Stats** — total sessions (including unpublished), total time, LOC, files. Computed from ALL local sessions, not just uploaded ones.
7. **Links** — repository URL (auto-detected from git remote), project URL (manual), screenshot (optional upload)
8. **Published Sessions** — 5-10 AI-selected session case studies with full detail

### Session Case Study Structure

Each published session within a project:

1. **Title** — what was built (max 200 chars)
2. **Context** — the problem that triggered this (max 500 chars)
3. **Developer Take** — short, personal. The anti-slop anchor. (max 2000 chars)
4. **Execution Path** — concrete steps with decisions, reasons, and insights
5. **Skills** — technology tags
6. **Q&A Pairs** — targeted questions the dev answered during enhancement
7. **Metadata** — source tool, date, duration, turns, LOC, files changed
8. **Agent Summary** — for orchestrated sessions: which agents ran, their roles, LOC per agent

### Project-Level AI Triage

Three-layer approach to selecting which sessions to showcase:

**Layer 1: Hard floor (no LLM, instant)**
- Skip sessions < 5 minutes, < 3 turns, 0 files changed

**Layer 2: Signal extraction (no LLM, transcript scan)**
- Correction count (dev overriding AI)
- User explanation length (thinking out loud)
- Error/retry count (debugging complexity)
- Tool diversity (routine vs complex)
- Multi-directory scope (cross-cutting work)
- Architectural keywords ("design", "trade-off", "because")

**Layer 3: LLM ranking (metadata + signals only)**
- Returns selected sessions with significance tags + skipped sessions with reasons
- Fallback without LLM: weighted signal scoring, select top N

### Context-Aware Questions (anti-slop)

After AI generates the draft narrative, it asks 2-3 targeted questions based on patterns detected in sessions:

- **Pattern-based:** "You overrode the AI 4 times. Was that a conscious strategy?"
- **Architecture-based:** "You spent 52 minutes on the auth system. What made that worth the investment?"
- **Evolution-based:** "The auth and storage sessions share zero files. Were these intentionally isolated?"

Two-pass narrative generation:
1. AI generates draft narrative from session transcripts
2. User answers questions (all optional, can skip)
3. AI rewrites narrative incorporating the user's answers
4. Result sounds like a dev thinking out loud, not AI explaining

### Anti-Fluff System

- Banned words in LLM prompts: "leverage", "utilize", "streamline", "enhance", "robust", "seamless"
- Narrative refined with dev's own voice via questions

---

## Portfolio Structure

Three levels:

### Level 1: Portfolio (`heyi.am/:username`)
- Hero: name, bio, location, avatar, skills
- AI Collaboration Profile (4 dimension bars — requires 8+ published sessions)
- Project cards — each with: title, narrative, stats grid, skills
- Aggregate stats across all projects

### Level 2: Project (`heyi.am/:username/:project`)
- Breadcrumb navigation
- Project narrative (with border-left accent)
- Skills row
- Screenshot (if uploaded)
- Hero stats: total time, sessions (N published), LOC, files
- Agent activity: per-session fork/join SVG timelines
- Project timeline: period headers, featured session cards, collapsed groups
- Growth chart: cumulative LOC over time
- Directory heatmap: file-level edit intensity
- Top files table

### Level 3: Session (`heyi.am/:username/:project/:session-slug` or `/s/:token`)
- Two-column layout: main content + sidebar
- Dev take, stats, Q&A pairs, highlights
- Execution path timeline
- Agent timeline SVG (fork/join for orchestrated, simple line for single-agent)
- Tool breakdown, turn timeline, files changed (collapsible)
- Full narrative

### Session Templates

Six CSS rendering modes via `.tpl-{name}` class. Currently only **Editorial** is fully implemented:

- **Editorial** — centered single-col, blue primary, stats as standalone numbers (default)
- Terminal, Minimal, Brutalist, Campfire, Neon Night — defined in schema, not yet rendered

### AI Collaboration Profile

Computed from session data (minimum 8 sessions). Shows how you work with AI:
- Task scoping (step count, duration)
- Active redirection (turn/step ratio)
- Verification (test/run tool usage)
- Tool orchestration (distinct tool count)

---

## CLI Experience

### Project Dashboard (`/`)
Project cards with stats (sessions, time, LOC, files), skills chips, "Upload" button per project. No session list — projects are the primary unit.

### Project Upload Flow (`/project/:dirName/upload`)
Multi-step wizard:
1. **Overview** — all sessions in scrollable table, "Let AI pick sessions" CTA
2. **Triage** — AI's selection with override checkboxes, significance/skip tags
3. **Enhance** — split panel: session processing feed (left) + project narrative streaming in (right)
4. **Questions** — 2-3 AI-generated questions with category tags, optional answers
5. **Timeline** — vertical timeline with period headers, featured + collapsed sessions
6. **Review** — project card preview, "what gets published" checklist, project details (repo URL, project URL, screenshot), publish CTA
7. **Done** — success page with project URL + copy button

### Settings (`/settings`)
- API Configuration (Anthropic key with show/hide toggle)
- Authentication status
- Enhancement mode indicator

---

## URL Structure

```
/:username                          -> portfolio (project index)
/:username/:project                 -> project page (timeline, stats, agent activity)
/:username/:project/:session-slug   -> session case study (within project context)
/s/:token                           -> session case study (direct share link)
/s/:token/transcript                -> full raw transcript
```

Both `/:username/:project/:session-slug` and `/s/:token` resolve to the same session. The friendly URL shows breadcrumbs; the `/s/` URL is for sharing.

---

## Design System

"The Calibrated Archive" — engineering workbench aesthetic, not consumer app.

- **Fonts**: Space Grotesk (display), Inter (body), IBM Plex Mono (labels/code)
- **Primary accent**: Seal Blue (#084471)
- **Surfaces**: 5-tier tonal layering (#f8f9fb -> #ffffff), no 1px borders for sectioning
- **Functional accents**: Success Teal (#006a61), Caution Amber (#663500)
- **Radii**: tight (0.125-0.375rem) — engineering workbench, not consumer app
- **No**: gradients, glows, glass morphism, pure black, large border-radii, center-aligned prose
- **Yes**: typography, whitespace, tonal layering, ghost borders, monospaced data alignment

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| CLI | Node.js + Express + React (Vite) |
| Web | Phoenix 1.8 + LiveView |
| Database | PostgreSQL (Ecto) |
| Local DB | SQLite (better-sqlite3) for session index |
| Storage | S3-compatible (Cloudflare R2) via ExAws |
| Auth | phx.gen.auth + GitHub OAuth + Device Auth (RFC 8628) |
| AI | Claude API (Haiku default, configurable per deployment) |
| Fonts | Google Fonts (Space Grotesk + IBM Plex Mono) |

---

## Agent / Orchestration Support

Multi-agent sessions (parent spawns child agents) are first-class:

- Parser detects subagent sessions from `{parentId}/subagents/{childId}.jsonl` structure
- Parent sessions show "N agents" badge, expand to show children
- Session case study: "ORCHESTRATED" chip + agent contributions table
- Fork/join timeline SVG shows parallel agent lanes with role colors
- Agent summary stored on shares: `{is_orchestrated, agents: [{role, duration_minutes, loc_changed}]}`

---

## LLM Provider Strategy

Both local (BYOK) and proxy paths work:

| LLM Call | Local (BYOK) | Proxy (Phoenix) | Fallback (no LLM) |
|----------|-------------|-----------------|-------------------|
| Triage | Direct Anthropic API | `POST /api/enhance` type: "triage" | Hard floor + signal scoring |
| Session enhancement | Direct Anthropic API | `POST /api/enhance` (existing) | Skip enhancement |
| Project narrative | Direct Anthropic API | `POST /api/enhance` type: "project" | No narrative |
| Narrative refinement | Direct Anthropic API | `POST /api/enhance` type: "refine" | Use draft as-is |

Provider resolution: local API key wins, then proxy (if authenticated), then fallback. Server-side model is configurable via `LLM_ANTHROPIC_MODEL` / `LLM_GEMINI_MODEL` env vars (defaults: Haiku / Gemini Flash).

---

## Content Lifecycle

CLI uploads. Phoenix controls visibility. Users decide what's public from the web app, not the terminal.

### Visibility States

Projects and sessions share the same three-state model:

| State | Access | On portfolio? |
|-------|--------|---------------|
| **draft** | Owner only (app_web) | No |
| **listed** | Public | Yes |
| **unlisted** | Anyone with link | No |

- **CLI** can only create `draft` records
- **Phoenix app** (heyiam.com) controls: list, unlist, delete
- Moving between `listed` and `unlisted` is instant (visibility toggle)
- Delete removes all data: DB records, S3 files, triggers portfolio re-render

### Transcript Control

Per-session boolean: `transcript_visible` (default: `true`). When `false`, `/s/:token/transcript` returns 404. Controlled from Phoenix app. CLI uploads always include the transcript — visibility is separate from storage.

### Delete

Deleting a project or session:
1. Removes DB records (project, linked shares, or individual share)
2. Removes S3 files (raw JSONL, log JSON, session.json, screenshot)
3. Marks portfolio HTML as stale (or triggers re-render if CLI is connected)
4. Returns 404 for all public URLs

Delete is permanent — no undo. GDPR: delete account cascade-deletes all projects, shares, and vibes.

---

## What Makes This Work

Not portfolios. Not sharing. Not AI summaries.

> **You are standardizing how developers explain their thinking.**

This only works if you're ruthless about quality: rejecting outputs, forcing edits, removing anything that feels "impressive."

If you lean into that: the Stripe Press version of dev portfolios.
If you don't: another AI content generator.
