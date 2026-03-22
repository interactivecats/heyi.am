# Data Model — Project-First Upload

Where every piece of data lives: database, object storage, or local disk.

---

## Storage Layers

| Layer | Technology | Purpose | Lifetime |
|-------|-----------|---------|----------|
| **Database** (PostgreSQL) | Ecto/Phoenix | Structured metadata, relationships, query-able fields | Permanent |
| **Object Storage** (S3/R2/SeaweedFS) | Presigned PUT/GET | Large blobs: raw JSONL transcripts, log files, screenshots | Permanent |
| **Local Disk** (CLI) | `~/.config/heyiam/` | Enhanced data cache, auth tokens, settings | Until re-enhanced or deleted |
| **Local Disk** (CLI) | `~/.claude/projects/` | Raw Claude Code session files (source of truth) | User-managed |
| **Local Disk** (Cursor) | `~/Library/Application Support/Cursor/User/globalStorage/` | Cursor workspace SQLite databases | User-managed |
| **Local Disk** (Codex) | `~/.codex/sessions/` | Codex CLI session JSONL files | User-managed |
| **Local Disk** (Gemini) | `~/.gemini/tmp/` | Gemini CLI session JSON logs | User-managed |

---

## Database Schema

### `projects` table (NEW)

The first-class project entity. Created/upserted when user publishes a project.

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `id` | bigserial PK | auto | |
| `slug` | varchar, NOT NULL | CLI: `displayNameFromDir(dirName)` slugified | URL-safe, unique per user |
| `title` | varchar, NOT NULL | CLI: same as slug, human-readable | |
| `narrative` | text | AI-generated, refined with user answers | Two-pass: draft → user questions → refined |
| `repo_url` | varchar | CLI: auto-detected from `git remote get-url origin` | Optional, user can override/clear |
| `project_url` | varchar | CLI: manual entry | Optional (live site, docs, demo) |
| `screenshot_key` | varchar | Object storage key | Optional, `projects/<slug>/screenshot.{ext}` |
| `timeline` | jsonb, default `[]` | AI-generated | `[{period, label, sessions[]}]` — see Timeline Schema below |
| `skills` | text[], default `{}` | AI: union of all session skills | Deduplicated |
| `total_sessions` | integer | CLI: count of ALL local sessions | Not just uploaded — the real total |
| `total_loc` | integer | CLI: sum of all local sessions' LOC | Accurate even if only some are uploaded |
| `total_duration_minutes` | integer | CLI: sum of all local sessions | |
| `total_files_changed` | integer | CLI: union of all local sessions' files | |
| `skipped_sessions` | jsonb, default `[]` | AI triage | `[{title, duration_minutes, loc_changed, turns, reason}]` |
| `user_id` | FK → users, NOT NULL | Auth | ON DELETE CASCADE |
| `inserted_at` | timestamptz | auto | |
| `updated_at` | timestamptz | auto | |

**Unique constraint:** `(user_id, slug)`

#### Timeline Schema (jsonb)

```json
[
  {
    "period": "Mar 3–7, 2026",
    "label": "Foundation",
    "sessions": [
      {
        "token": "abc123...",
        "slug": "cli-session-parser",
        "title": "CLI session parser pipeline",
        "featured": true,
        "tag": "Core infrastructure",
        "date": "2026-03-04",
        "duration_minutes": 41,
        "loc_changed": 980,
        "is_orchestrated": false
      },
      {
        "title": "Setup and deps",
        "featured": false,
        "date": "2026-03-03",
        "duration_minutes": 5,
        "loc_changed": 28
      },
      {
        "title": "Config and env setup",
        "featured": false,
        "date": "2026-03-05",
        "duration_minutes": 8,
        "loc_changed": 42
      }
    ]
  }
]
```

- `token` + `slug` present only for published (featured) sessions — links to `/:username/:project/:slug`
- `featured: false` sessions are collapsed in the UI ("N smaller sessions")
- `date` is the session's `recorded_at` as ISO date — used for display and period grouping
- `period` is a human-readable date range, computed from session dates in that group

#### Skipped Sessions Schema (jsonb)

```json
[
  { "title": "Fix typo in landing page", "duration_minutes": 3, "loc_changed": 12, "turns": 2, "reason": "Too small" },
  { "title": "Update deps", "duration_minutes": 5, "loc_changed": 28, "turns": 4, "reason": "Mechanical" }
]
```

---

### `shares` table (MODIFIED)

Individual session case studies. Each share belongs to a project via FK.

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `id` | bigserial PK | auto | |
| `token` | varchar, NOT NULL, UNIQUE | Phoenix: 32 random bytes, base64 | URL identifier for `/s/:token` |
| `title` | varchar, NOT NULL | AI-enhanced or raw first message | max 200 |
| `slug` | varchar | Slugified title | For friendly URLs `/:username/:project/:slug` |
| `dev_take` | text | AI-enhanced | max 2000 |
| `context` | text | AI-enhanced | max 500 |
| `duration_minutes` | integer | CLI parser | Active time, excludes idle gaps |
| `turns` | integer | CLI parser | User + AI turns |
| `files_changed` | integer | CLI parser | Count of unique files |
| `loc_changed` | integer | CLI parser | Additions + deletions |
| `recorded_at` | timestamptz | CLI parser | Session start time |
| `verified_at` | timestamptz | Phoenix | When signature was verified |
| `sealed` | boolean, default false | CLI | Immutable once true |
| `template` | varchar, default "editorial" | CLI | Rendering template |
| `language` | varchar | CLI | Primary language |
| `tools` | text[] | CLI analyzer | Tool names used |
| `skills` | text[] | AI-enhanced or CLI analyzer | max 50 |
| `beats` | jsonb, default `[]` | AI-enhanced | Execution path steps |
| `qa_pairs` | jsonb, default `[]` | AI-enhanced | Q&A pairs |
| `highlights` | jsonb, default `[]` | AI-enhanced | Key moments |
| `tool_breakdown` | jsonb, default `[]` | CLI analyzer | `[{tool, count}]` |
| `top_files` | jsonb, default `[]` | CLI parser | `[{path, additions, deletions}]` or plain strings |
| `transcript_excerpt` | jsonb, default `[]` | CLI | Sampled turns for display |
| `turn_timeline` | jsonb, default `[]` | CLI analyzer | `[{timestamp, type, content}]` |
| `narrative` | text | AI-enhanced | Full narrative, max 10000 |
| `project_name` | varchar | CLI | Raw project name string, max 200 |
| `signature` | text | CLI | Ed25519 hex signature |
| `public_key` | text | CLI | Ed25519 public key hex |
| `status` | varchar, NOT NULL | Phoenix | "draft" / "listed" / "unlisted" |
| `raw_storage_key` | varchar | Phoenix | S3 key for raw JSONL |
| `log_storage_key` | varchar | Phoenix | S3 key for log JSON |
| `source_tool` | varchar, default "claude" | CLI parser | Which tool created the session: "claude", "cursor", "codex", "gemini" |
| `agent_summary` | jsonb | CLI bridge | `{is_orchestrated, agents: [{role, duration, loc}]}` — for agent timeline SVG |
| `project_id` | FK → projects | Phoenix | Set during project publish |
| `user_id` | FK → users | Phoenix | ON DELETE SET NULL |
| `inserted_at` | timestamptz | auto | |
| `updated_at` | timestamptz | auto | |

**Removed:** `project_meta` (replaced by `projects` table), `challenge_id` (feature removed)

**Added:** `slug` (for friendly URLs), `project_id` (FK to projects), `agent_summary` (for agent timeline SVG), `source_tool` (which AI tool created the session)

#### Agent Summary Schema (jsonb)

```json
{
  "is_orchestrated": true,
  "agents": [
    { "role": "frontend-dev", "duration_minutes": 12, "loc_changed": 247 },
    { "role": "backend-dev", "duration_minutes": 18, "loc_changed": 389 },
    { "role": "qa-engineer", "duration_minutes": 8, "loc_changed": 156 }
  ]
}
```

For single-agent sessions: `{ "is_orchestrated": false, "agents": [] }` or `null`.

---

### `users` table (UNCHANGED)

Relevant fields for portfolio: `username`, `display_name`, `bio`, `avatar_url`, `github_url`, `location`, `status`, `portfolio_layout`, `portfolio_accent`.

---

## Object Storage (S3/R2/SeaweedFS)

**Bucket:** `heyi-am-sessions` (configurable via `config :heyi_am, HeyiAm.ObjectStorage, bucket: "..."`)

**Access pattern:** Presigned URLs. Phoenix generates presigned PUT URLs, CLI uploads directly to storage. Phoenix generates presigned GET URLs for reads.

### Key Convention

```
sessions/<token>/raw.jsonl     — raw Claude Code JSONL transcript
sessions/<token>/log.json      — processed log (string array)
projects/<slug>/screenshot.png — project screenshot (optional)
```

### What Each File Contains

#### `sessions/<token>/raw.jsonl`

The original session file. For Claude Code sessions, this is from `~/.claude/projects/<dir>/<uuid>.jsonl`. For other tools, the CLI normalizes the data into the same JSONL format before upload. This is the source of truth — everything else is derived from it.

**Format:** Newline-delimited JSON. Each line is a message in Claude API format (all tools are normalized to this):
```jsonl
{"type":"human","message":{"role":"user","content":"Look at the auth system..."}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll review..."},{"type":"tool_use","name":"Read","input":{"file_path":"lib/auth.ex"}}]}}
{"type":"human","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"...","content":"..."}]}}
```

**Size:** Typically 100KB–5MB per session. Large sessions (100+ turns) can be 10MB+.

**Upload timing:** Best-effort, after the share is created in the database. Non-fatal if it fails — the share still exists without the raw file.

**Upload flow:**
1. CLI calls `POST /api/sessions` → Phoenix creates share, returns `{ token, upload_urls: { raw, log } }`
2. `upload_urls.raw` is a presigned PUT URL for `sessions/<token>/raw.jsonl`
3. CLI reads the JSONL file from disk and PUTs it directly to storage
4. If upload fails, the share still works — it just won't have the raw transcript available for download

#### `sessions/<token>/log.json`

Processed human-readable log. A JSON array of strings:
```json
[
  "> Look at the auth system and tell me what's going on",
  "[AI] I'll review the authentication code...",
  "[TOOL] Read lib/heyi_am/accounts.ex",
  "> No. Tear it all out.",
  "..."
]
```

**Size:** Typically 10KB–500KB.

**Upload flow:** Same as raw — presigned PUT, best-effort.

#### `projects/<slug>/screenshot.png`

User-uploaded project screenshot. Optional.

**Upload flow:**
1. During project publish, if screenshot exists:
2. CLI calls a new endpoint to get a presigned PUT URL for `projects/<slug>/screenshot.<ext>`
3. CLI uploads the image directly to storage
4. Phoenix stores the key in `projects.screenshot_key`

**Display:** Phoenix generates a presigned GET URL when rendering the project page, passes it to the template as an `<img>` src.

---

## Local Disk (CLI)

### `~/.config/heyiam/`

| File | Format | Purpose |
|------|--------|---------|
| `auth.json` | `{ token, username, savedAt }` | Bearer token for Phoenix API |
| `settings.json` | `{ anthropicApiKey? }` | BYOK Anthropic key |
| `enhanced/<sessionId>.json` | `EnhancedData` | Per-session AI enhancement results |
| `cache/<sessionId>.json` | `{ loc, duration, files, turns, skills, mtime }` | Session stats cache (NEW) |
| `screenshots/<dirName>.<ext>` | Binary image | Screenshot staging before upload (NEW) |

#### Enhanced Data Schema (`enhanced/<sessionId>.json`)

```json
{
  "title": "Ripping out auth and rebuilding with phx.gen.auth",
  "developerTake": "The login and signup pages had accumulated...",
  "context": "Auth system consolidation",
  "skills": ["Elixir", "Phoenix", "Authentication"],
  "questions": [
    { "question": "Why tear out auth entirely?", "type": "decision" }
  ],
  "executionSteps": [
    { "stepNumber": 1, "title": "Deep review", "body": "Found 3 overlapping token systems" }
  ],
  "qaPairs": [
    { "question": "Why tear out?", "answer": "Three token systems is a liability" }
  ],
  "enhancedAt": "2026-03-22T10:00:00Z",
  "quickEnhanced": false,
  "uploaded": true
}
```

#### Session Stats Cache Schema (`cache/<sessionId>.json`) — NEW

```json
{
  "loc": 2400,
  "duration": 47,
  "files": 34,
  "turns": 77,
  "skills": ["Elixir", "Phoenix"],
  "mtime": 1711094400000
}
```

- `mtime` is the `.jsonl` file's last modified timestamp
- Cache is invalidated when the file's mtime changes
- Used by the ProjectDashboard to show aggregate stats without parsing every session

### Session Source Paths

The CLI reads session data from multiple AI tools. It never writes to any of these.

Sessions from all tools are **grouped by working directory** — if you use Claude Code and Cursor on the same project, their sessions appear together under one project in the UI.

#### Claude Code (`~/.claude/projects/`)

```
~/.claude/projects/
  -Users-ben-Dev-heyi-am/          ← projectDir (encoded path)
    abc123-def456.jsonl            ← parent session
    abc123-def456/subagents/       ← child sessions (if orchestrated)
      child-uuid.jsonl
      child-uuid.meta.json         ← agent role, parent reference
  -Users-ben-Dev-agent-sync/
    ...
```

#### Cursor (`~/Library/Application Support/Cursor/User/globalStorage/`)

Cursor stores conversations in SQLite databases, not flat files. The parser reads two databases per workspace:

- **Global DB** (`state.vscdb`): `cursorDiskKV` table with `bubbleId:{convId}:{msgId}` entries containing JSON messages
- **Workspace DB** (`state.vscdb` in workspace storage): `composer.composerData` key containing conversation list with names, timestamps, and mode

Discovery creates synthetic `cursor://{composerId}?name=...&createdAt=...` URLs since conversations aren't files.

**Data availability:** Cursor migrated conversation storage to the global `cursorDiskKV` table around August 2025 (`composer.planMigrationToHomeDirCompleted`). Sessions created before September 2025 have metadata (title, date, mode) but no recoverable message content. The CLI only imports Cursor sessions from September 2025 onwards.

#### Codex CLI (`~/.codex/sessions/`)

```
~/.codex/sessions/
  2026/03/22/
    rollout-abc123.jsonl           ← JSONL format, similar to Claude Code
```

Each line has a `type` field. The `session_meta` entry contains `cwd` for project directory mapping.

#### Gemini CLI (`~/.gemini/tmp/`)

```
~/.gemini/tmp/
  abc123def/                       ← SHA-256 hash of project directory
    logs.json                      ← JSON array, multiple sessions per file
```

Sessions are grouped by `sessionId` within each `logs.json`. Project directory is resolved by hashing known paths and matching against the directory name.

---

## Data Flow: Publish

```
CLI Local                              Phoenix                          Object Storage
─────────                              ───────                          ──────────────

1. Compute project stats
   from ALL local sessions
   (using stats cache)

2. POST /api/projects ──────────────→  Upsert projects row
   {title, slug, narrative,            Returns {project_id, slug}
    timeline, skills, stats,
    repo_url, project_url,
    skipped_sessions}

3. If screenshot exists:
   GET presigned PUT URL ──────────→  Generate presigned URL
                                       for projects/<slug>/screenshot
   PUT screenshot ──────────────────────────────────────────────────→  Store image

4. For each selected session (sequential, 2s spacing):
   POST /api/sessions ─────────────→  Create share with project_id FK
   {title, dev_take, beats,           Returns {token, upload_urls}
    skills, turns, duration,
    loc_changed, files_changed,
    top_files, tool_breakdown,
    tools, qa_pairs, narrative,
    project_name, recorded_at,
    project_id, template,
    source_tool}

   PUT raw JSONL ──────────────────────────────────────────────────→  Store sessions/<token>/raw.jsonl
   PUT log JSON ───────────────────────────────────────────────────→  Store sessions/<token>/log.json

5. Mark session as uploaded
   locally (enhanced/<id>.json
   → uploaded: true)
```

---

## Data Flow: Read (Public Page)

```
Browser                                Phoenix                          Object Storage
───────                                ───────                          ──────────────

GET /:username ────────────────────→  Query projects table
                                      for user's projects
                                      Return project cards
                                      (narrative, stats, skills)

GET /:username/:project ───────────→  Query project by (user, slug)
                                      Preload shares (project_id FK)
                                      Compute growth chart, heatmap
                                      from shares' top_files/loc

                                      If project.screenshot_key:
                                        Generate presigned GET URL ──→  Serve image

GET /:username/:project/:session ──→  Query share by (project, slug)
  or GET /s/:token                    or by token

GET /s/:token/transcript ──────────→  Query share by token
                                      Generate presigned GET URL
                                      for raw JSONL ────────────────→  Serve JSONL
                                      Parse and render turn-by-turn
```

---

## Agent/Orchestration Data

Agent data lives on the session (share), not the project. The CLI parser extracts it from child session files.

### On shares (DB)

`agent_summary` jsonb field on shares (see schema above). The CLI computes this via `bridgeChildSessions()` + `aggregateChildStats()` and includes it in the publish payload.

### On the project timeline (DB)

Each session entry in `projects.timeline` includes `is_orchestrated: boolean`. The project page uses this to decide whether to render a fork/join SVG or a simple line for that session.

The full per-agent breakdown for the project-level agent activity SVG comes from querying the published shares' `agent_summary` fields.

---

## Screen → Data Mapping

What each public page (Phoenix-rendered) reads from where.

### Screen 24: Portfolio (`/:username`)

| UI Element | Data Source | Table.Column |
|-----------|-------------|--------------|
| User name, bio, location, avatar | `users` | `display_name`, `bio`, `location`, `avatar_url` |
| User skills | `users` | aggregated from projects |
| AI Collaboration Profile bars | Computed from `shares` | `tool_breakdown`, `turns`, `beats` across all user's shares |
| Project card: title | `projects` | `title` |
| Project card: narrative | `projects` | `narrative` |
| Project card: stats (sessions, time, LOC, files) | `projects` | `total_sessions`, `total_duration_minutes`, `total_loc`, `total_files_changed` |
| Project card: "N published" | `shares` | `COUNT(*) WHERE project_id = ? AND status = 'listed'` |
| Project card: skills | `projects` | `skills` |
| Sidebar: project links | `projects` | `repo_url`, `project_url` |
| Sidebar: recent activity | `shares` | most recent by `inserted_at` |

### Screen 25: Project Detail (`/:username/:project`)

| UI Element | Data Source | Table.Column |
|-----------|-------------|--------------|
| Breadcrumb | `users` + `projects` | `username`, `slug` |
| Title | `projects` | `title` |
| Repo link | `projects` | `repo_url` (optional, only if present) |
| Project link | `projects` | `project_url` (optional, only if present) |
| Narrative | `projects` | `narrative` |
| Skills row | `projects` | `skills` |
| Screenshot | Object storage | presigned GET for `projects.screenshot_key` |
| Hero stats: Total Time | `projects` | `total_duration_minutes` |
| Hero stats: Sessions | `projects` + `shares` | `total_sessions` + `COUNT(*) WHERE project_id AND listed` |
| Hero stats: LOC | `projects` | `total_loc` |
| Hero stats: Files | `projects` | `total_files_changed` |
| Agent activity: per-session SVG | `shares` | `agent_summary` for each share in project |
| Agent activity: summary stats | `shares` | computed from `agent_summary` across project shares |
| Timeline: period headers | `projects` | `timeline[].period`, `timeline[].label` |
| Timeline: featured sessions | `projects` + `shares` | `timeline[].sessions` (featured=true), linked via `token` to shares |
| Timeline: collapsed groups | `projects` | `timeline[].sessions` (featured=false), metadata only |
| Growth chart | `shares` | `loc_changed`, `recorded_at` per share (computed, same as today) |
| Directory heatmap | `shares` | `top_files` per share (computed, same as today) |
| Top files | `shares` | `top_files` per share (computed, same as today) |

### Screen 23: Session Case Study (`/:username/:project/:slug` or `/s/:token`)

| UI Element | Data Source | Table.Column |
|-----------|-------------|--------------|
| Breadcrumb | `users` + `projects` + `shares` | `username`, project `slug`, share `slug` |
| Title | `shares` | `title` |
| Dev take | `shares` | `dev_take` |
| Stats (duration, turns, files, LOC) | `shares` | `duration_minutes`, `turns`, `files_changed`, `loc_changed` |
| Skills | `shares` | `skills` |
| Q&A pairs | `shares` | `qa_pairs` |
| Highlights | `shares` | `highlights` |
| Execution path | `shares` | `beats` |
| Agent timeline SVG | `shares` | `agent_summary` |
| Tool breakdown | `shares` | `tool_breakdown` |
| Turn timeline | `shares` | `turn_timeline` |
| Files changed | `shares` | `top_files` |
| Full narrative | `shares` | `narrative` |
| Raw log preview | `shares` | `transcript_excerpt` |
| Sealed badge | `shares` | `sealed`, `verified_at`, `signature` |
| "View transcript" link | `shares` | `token` → `/s/:token/transcript` |

### Screen 26: Transcript (`/s/:token/transcript`)

| UI Element | Data Source | Table.Column / Storage |
|-----------|-------------|------------------------|
| Turn-by-turn log | Object storage | `sessions/<token>/log.json` via presigned GET |
| Session metadata | `shares` | `title`, `duration_minutes`, `turns`, `recorded_at` |
| If log.json missing | `shares` | Falls back to `turn_timeline` from DB |

### Screen 27: Verification (`/s/:token/verify`)

| UI Element | Data Source | Table.Column |
|-----------|-------------|--------------|
| Content hash | `shares` | computed from share fields |
| Signature | `shares` | `signature` |
| Public key | `shares` | `public_key` |
| Sealed status | `shares` | `sealed` |
| Verification result | Computed | `Signature.verify(share)` |
