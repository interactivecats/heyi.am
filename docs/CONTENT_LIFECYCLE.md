# Content Lifecycle

## Principle

CLI uploads. Phoenix controls visibility. Users decide what's public from the web app, not the terminal.

---

## Visibility States

Projects and sessions share the same three-state model:

| State | Access | On portfolio? | URL |
|-------|--------|---------------|-----|
| **uploaded** (draft) | Owner only (app_web) | No | N/A |
| **unlisted** | Anyone with link | No | `heyi.am/s/<uuid>` |
| **published** | Public | Yes | `heyi.am/:username/:project` |

### State Transitions

```
CLI upload → uploaded (draft)
               ↓
         [publish from web]
               ↓
           published ←→ unlisted
               ↓           ↓
           [delete]     [delete]
```

- **CLI** can only create `uploaded` (draft) records
- **Phoenix app** (heyiam.com) controls: publish, unlist, delete
- Moving between `published` and `unlisted` is instant (visibility toggle)
- Delete removes all data: DB records, S3 files, triggers portfolio re-render

---

## Transcript Control

Per-session boolean: `transcript_visible` (default: `true`)

| Setting | `/s/:token/transcript` |
|---------|----------------------|
| `true` | Full transcript rendered |
| `false` | 404 |

Controlled from Phoenix app (heyiam.com). CLI uploads always include the transcript — visibility is separate from storage.

---

## Delete

Deleting a project or session:
1. Removes DB records (project, linked shares, or individual share)
2. Removes S3 files (raw JSONL, log JSON, session.json, screenshot)
3. Marks portfolio HTML as stale (or triggers re-render if CLI is connected)
4. Returns 404 for all public URLs

Delete is available from the Phoenix app (heyiam.com). No "undo" — deletion is permanent.

### GDPR / Anonymization

The upload-then-publish model makes GDPR simpler:
- Delete account → cascade deletes all projects, shares, vibes
- No data exists outside the DB + S3 (no client-side caches to invalidate)
- Rendered HTML is regenerated from structured data, so deleting the source deletes everything

---

## Data Flow

```
CLI (localhost:17845)                 App Web (heyiam.com)           Public Web (heyi.am)
─────────────────────                ──────────────────────          ────────────────────

heyiam open
  → parse sessions
  → AI triage + enhance
  → render HTML fragments

POST /api/projects                   → creates project (uploaded)
  { title, narrative, skills,
    rendered_html, ... }

POST /api/sessions (x N)             → creates shares (uploaded)
  { title, dev_take, beats,
    rendered_html, ... }

PATCH /api/profile                   → stores rendered_portfolio_html
  { rendered_portfolio_html }

                                     User visits heyiam.com/settings
                                     → sees uploaded projects
                                     → clicks "Publish"
                                     → project.visibility = published

                                                                    GET /ben
                                                                    → portfolio page

                                     User clicks "Unlist"
                                     → project.visibility = unlisted
                                     → removed from portfolio
                                     → still accessible via direct link

                                     User clicks "Delete"
                                     → cascade delete
                                     → S3 cleanup
                                     → portfolio re-render
```

---

## Schema Changes

```sql
-- Replace current status enum with visibility
-- Projects
ALTER TABLE projects ADD COLUMN visibility varchar NOT NULL DEFAULT 'uploaded';
-- CHECK: visibility IN ('uploaded', 'unlisted', 'published')

-- Shares
ALTER TABLE shares ALTER COLUMN status SET DEFAULT 'uploaded';
-- Rename 'listed' → 'published', 'draft' → 'uploaded'
-- Add 'unlisted' to valid values

-- Transcript control
ALTER TABLE shares ADD COLUMN transcript_visible boolean NOT NULL DEFAULT true;
```

Since we're rewriting migrations during the umbrella tearout, these go into the clean schema from day one.
