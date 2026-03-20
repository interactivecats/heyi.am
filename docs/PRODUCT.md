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
Code with Claude Code → Sessions saved locally
  → heyiam open → Browse sessions
  → Enhance with AI → Answer questions about your thinking → AI weaves your voice in
  → Edit & Publish → Public case study at heyi.am/s/:token
  → heyiam login → Sessions auto-appear on your portfolio
  → heyi.am/:username → Portfolio of projects + sessions
```

### Two Apps, One Flow

**CLI** (`heyiam`): Where content gets created. Session browsing (grouped by project), AI enhancement, editing, publishing. Runs locally at localhost.

**Web** (`heyi.am`): Where the portfolio lives. Public pages, portfolio editor, user accounts. Phoenix app.

### Identity

- `heyiam login`: Device auth flow (RFC 8628). Opens browser, user authenticates (magic link or GitHub), CLI gets Bearer token. One time, 30 seconds.
- Without login: can still publish anonymously. Gets a public URL + delete code. No portfolio.
- With login: publish = auto-added to portfolio. No manual steps.

---

## The Core Object: A Session Case Study

### Structure

1. **Title** — what was built (max 80 chars)
2. **Context** — the problem that triggered this (max 200 chars)
3. **Developer Take** — short, personal, required. The anti-slop anchor. (max 300 chars)
4. **Execution Path** — 5-7 concrete steps with decisions, reasons, and insights
5. **Hero Image** — screenshot/image of the result (upload or URL → crop to 16:9)
6. **Skills** — technology tags
7. **Metadata** — source tool, date, duration, step count

### Session Questions (how dev voice gets in)

Before AI enhancement, the system generates 3-4 targeted questions based on the dev's actual prompts — their corrections, decisions, and requests. Questions ask about thinking and trade-offs ("Why did you go with X?", "What wasn't working?"), never about session mechanics.

Each question includes a suggested answer the dev can accept, edit, or rewrite. Answers get woven into the AI summarization prompt so the case study reads like the dev's build log, not AI-generated content. Skip is always available.

### Anti-Fluff System

AI generates first draft with dev's answers baked in. Human edits before publish.

- Banned words: "leverage", "utilize", "streamline", "enhance", "robust", "seamless"
- Max 5-7 steps, 20-word titles, 40-word bodies
- Developer take is required and cannot be verbatim AI suggestion
- "Would you actually say this in an interview?" confirmation

---

## Portfolio Structure

Three levels:

### Level 1: Portfolio (`heyi.am/:username`)
- Hero: name, bio, links, skills
- Project grid (2-column cards)
- Each card: project name, stats, featured quote, skills

### Level 2: Project (`heyi.am/:username/:project`)
- Aggregate stats from ALL sessions (sessions, turns, tools, hours)
- Featured sessions (curated subset)
- Stats prove depth; curation proves quality

### Level 3: Session (`heyi.am/s/:token`)
- The full case study

### Session Templates

Six session templates (CSS rendering modes via `.stpl-{name}` class on shared markup):
- **Editorial** — centered single-col, blue primary, stats as standalone numbers (default)
- **Terminal** — dark bg, green monospace, terminal prompt style
- **Minimal** — narrow column, extreme whitespace, no decorative elements
- **Brutalist** — B&W only, thick borders, zero radius, ALL CAPS
- **Campfire** — warm solarized palette, serif headings, earth tones
- **Neon Night** — deep navy, cyan/magenta/green multi-accent

### AI Collaboration Profile

Computed from session data. Shows how you work with AI:
- Task scoping (step count, duration)
- Active redirection (turn/step ratio)
- Verification (test/run tool usage)
- Tool orchestration (distinct tool count)

Requires 8+ sessions. Private by default, opt-in public.

---

## Portfolio Editor (`heyi.am/:username/edit`)

WYSIWYG — the editor IS the portfolio with editing controls overlaid.

- Dark sticky topbar with template picker + accent color dots
- Live template preview panel (mini browser showing how each template looks)
- Inline contenteditable profile editing (name, bio at display size)
- Project cards with drag-to-reorder, eye visibility toggle, expand/collapse
- Session on/off toggles per project
- Not a CRUD admin panel. Feels like Vercel/Wix, not phpMyAdmin.

---

## CLI Experience

### Session List
Grouped by project directory. Accordion expand/collapse. Project name detected from package.json/Cargo.toml/go.mod/basename.

### Session Detail
Raw analysis: turns, tools, files. "Enhance with AI" button → questions about your thinking → AI streams with your answers woven in.

### Session Editor
Title, context, developer take (with AI suggested draft + quote chips), execution path steps (inline editable), skills, hero image upload/crop. Reference panel shows raw session data alongside.

### Project Detail (`/project/:name`)
Aggregate stats, editable settings (name, description, visibility), star sessions to feature (max 6). Settings stored locally, sync to Phoenix on save.

### Publish Flow
- If logged in (Bearer token): publish → auto-linked to portfolio → "Added to your portfolio"
- If not logged in: "Connect your account?" prompt → inline device auth → then publish. Or "Publish anonymously" → delete code.

---

## Design System

See `mockups/full/DESIGN.md` for the canonical spec ("The Calibrated Archive").

- **Fonts**: Space Grotesk (display), Inter (body), IBM Plex Mono (labels/code)
- **Primary accent**: Seal Blue (#084471) — cryptographic trust, structural headers
- **Surfaces**: 5-tier tonal layering (#f8f9fb → #ffffff), no 1px borders for sectioning
- **Functional accents**: Success Teal (#006a61), Caution Amber (#663500)
- **Radii**: tight (0.125–0.375rem) — engineering workbench, not consumer app
- **No**: gradients, glows, glass morphism, pure black, large border-radii, center-aligned prose
- **Yes**: typography, whitespace, tonal layering, ghost borders, monospaced data alignment
- **Energy**: technical documentation meets editorial layout — not Dribbble

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| CLI | Node.js + Express + React (Vite) |
| Web | Phoenix 1.8 + LiveView |
| Database | PostgreSQL (Ecto) |
| Storage | S3-compatible (MinIO) via ExAws |
| Auth | phx.gen.auth + GitHub OAuth + Device Auth (RFC 8628) |
| AI | Claude API (Haiku for summarization) |
| Fonts | Google Fonts (Space Grotesk + IBM Plex Mono) |
| Signing | Ed25519 (machine identity) + SHA-256 (API tokens) |

---

## What Makes This Work

Not portfolios. Not sharing. Not AI summaries.

> **You are standardizing how developers explain their thinking.**

This only works if you're ruthless about quality: rejecting outputs, forcing edits, removing anything that feels "impressive."

If you lean into that: the Stripe Press version of dev portfolios.
If you don't: another AI content generator.
