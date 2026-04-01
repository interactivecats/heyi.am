# Shared Mock Data for Template Mockups

All templates use this exact data. Each template renders it differently.

---

## Portfolio Page — @alex

**User Profile (all optional — templates should gracefully hide empty fields):**
- Display name: Alex Chen
- Profile photo: placeholder avatar (circle with initials "AC")
- Bio/About: "Full-stack engineer building tools for personal finance and real-time collaboration. I care about schema design, performance, and building things that feel right. Previously at Stripe and a YC startup. I use AI as a force multiplier — my sessions show the thinking, not just the output."
- Location: San Francisco, CA
- Email: alex@alexchen.dev
- Phone: (optional — not shown in mock)
- LinkedIn: linkedin.com/in/alexchendev
- GitHub: github.com/alexchen
- Personal site: alexchen.dev
- Resume: resume.pdf (download button)
- Twitter/X: @alexchendev

**Aggregate Stats:**
- 3 projects
- 28 sessions
- 124 hours total
- 18,400 lines of code

**Project Cards:**

### BudgetWise
- Narrative: "Personal finance app with recurring transaction detection, Plaid integration, and spending insights dashboard."
- Skills: TypeScript, React, Next.js, Prisma, PostgreSQL, Stripe API
- Stats: 8 sessions · 42.5h · 4,460 LOC
- Source mix: Claude 62.5%, Cursor 37.5%

### ShellHook
- Narrative: "Rust CLI tool for managing git hooks with TOML configuration and automatic symlinking."
- Skills: Rust, CLI design, TOML parsing, Git internals, Shell scripting
- Stats: 7 sessions · 32h · 3,580 LOC
- Source mix: Claude 85%, Cursor 15%

### PixelBoard
- Narrative: "Real-time collaborative drawing canvas with CRDT-based state sync and pressure-sensitive input."
- Skills: TypeScript, WebSocket, Canvas API, Redis, Express, CRDT
- Stats: 5 sessions · 28h · 2,940 LOC
- Source mix: Claude 60%, Cursor 40%

---

## Project Page — BudgetWise

**Title:** BudgetWise
**Links:** github.com/alex/budgetwise · budgetwise.app
**Screenshot:** Browser chrome frame with gradient placeholder

**Narrative (3 paragraphs):**
"Started with a basic Prisma schema but realized halfway through that I needed polymorphic transaction types. The AI kept suggesting single-table inheritance but I pushed back — went with a discriminated union pattern instead. Nullable fields for transfer-specific data, hard deletes with an audit log."

"The recurring transaction detection was the hardest part. Had to figure out the right tolerance windows — monthly transactions drift by a few days, weekly ones are more precise. Settled on three consecutive interval matches before marking something as recurring. The partial index on merchant_normalized brought the detection query from 2 seconds to 120ms on 10k transactions."

"Plaid integration went smoother than expected. The token exchange flow is straightforward, but the webhook handling needed careful idempotency — Plaid sends duplicate webhooks, so I used a processed-events table keyed on webhook ID."

**Stats:** 8 sessions · 42h 30m · 4,460 LOC · 156 files · 2.1M tokens · 4.2x efficiency

**Human vs Agent Time (show prominently — this is a key differentiator):**
- Human time: 8.1 hours
- Agent time: 34.4 hours
- Total: 42.5 hours
- Multiplier: 4.2x (agent time / human time)
- Visual: a bar showing 19% human (solid) + 81% agent (gradient/accent)

Different templates can visualize this differently:
- Stacked bar with labels
- Split stat cards (YOU / AGENTS / MULTIPLIER)
- Donut/ring chart
- Two large numbers side by side with a divider
- Horizontal bar with ratio marker
- Simple text: "8.1h you + 34.4h agents = 4.2x leverage"

Show on: portfolio page (aggregate across all projects), project page (per project), optionally session page (per session)

**Sessions (for work timeline chart):**

| # | Title | Date | Duration | LOC | Source | Agent count |
|---|-------|------|----------|-----|--------|-------------|
| 1 | Set up Prisma schema | Feb 3 | 72m | 680 | Claude | 7 |
| 2 | Transaction list + infinite scroll | Feb 14 | 65m | 520 | Cursor | 5 |
| 3 | Recurring transaction detection | Mar 1 | 88m | 890 | Claude | 6 |
| 4 | Stripe integration | Mar 10 | 55m | 420 | Claude | 0 |
| 5 | CSV import pipeline | Mar 14 | 45m | 380 | Cursor | 4 |
| 6 | Full-text search tsvector | Mar 18 | 62m | 510 | Claude | 3 |
| 7 | Spending insights dashboard | Mar 22 | 78m | 720 | Claude | 5 |
| 8 | Mobile responsive + 2FA | Mar 26 | 50m | 340 | Cursor | 0 |

Agent role colors: frontend-dev=#7c3aed, backend-dev=#0891b2, qa-engineer=#059669, security-engineer=#475569, code-reviewer=#e11d48, ux-designer=#d97706

**Phases (arc):**
1. Foundation (Feb 3–14) — Schema design, Prisma setup, transaction CRUD
2. Data Pipeline (Feb 17–26) — CSV import, Plaid integration, recurring detection
3. Intelligence (Mar 1–14) — Search, full-text indexing, spending insights
4. Hardening (Mar 16–26) — 2FA, mobile responsive, CI/CD, performance

**Skills:** TypeScript, React, Next.js, Prisma, PostgreSQL, Tailwind CSS, Stripe API, Plaid API, Chart.js, Playwright

**Key Decisions:**
1. Discriminated union over single-table inheritance for transaction types
2. Partial index on merchant_normalized for 16x query speedup
3. Processed-events table for Plaid webhook idempotency

**Source Breakdown:** Claude Code 62.5% (5 sessions) · Cursor 37.5% (3 sessions)

**Featured Sessions (6):**
1. Prisma schema (72m, 680 LOC, 7 agents, tag: schema)
2. Transaction list (65m, 520 LOC, 5 agents, tag: frontend)
3. Recurring detection (88m, 890 LOC, 6 agents, tag: algorithm)
4. CSV import (78m, 640 LOC, 5 agents, tag: import)
5. Plaid integration (90m, 780 LOC, 8 agents, tag: integration)
6. Spending insights (70m, 620 LOC, 4 agents, tag: insights)

---

## Session Page — "Set up Prisma schema"

**Breadcrumb:** alex / budgetwise / Set up Prisma schema

**Header:**
- Title: "Set up Prisma schema with User, Account, and Transaction models"
- Date: February 3, 2026
- Source: Claude Code
- Duration: 72 minutes (87m wall clock)
- Turns: 45
- LOC: 680
- Files changed: 4

**Dev Take:** "Went with discriminated unions over STI — nullable columns everywhere felt wrong. The audit log instead of soft deletes was the right call too."

**Sidebar — Tools Used:**
| Tool | Count |
|------|-------|
| Edit | 18 |
| Read | 12 |
| Bash | 9 |
| Write | 4 |
| Grep | 2 |

**Sidebar — Files Changed:**
| File | +/- |
|------|-----|
| prisma/schema.prisma | +142 |
| prisma/seed.ts | +89 |
| prisma/migrations/20260203_init/migration.sql | +415 |
| src/lib/db.ts | +34 |

**Sidebar — Skills:** TypeScript, Prisma, PostgreSQL

**Execution Path (Beats):**
1. **Schema design** — Sketched out the core models — User, Account, Transaction. Decided on a discriminated union for transaction types instead of STI.
2. **Prisma setup** — Initialized Prisma with PostgreSQL, wrote the schema file with proper relations and indexes.
3. **Migration** — Ran the initial migration, fixed a cascade delete issue on Account → Transaction.
4. **Seed data** — Created a seed script with realistic test data — multiple accounts, mixed transaction types.

**Q&A:**
Q: Why did you choose a discriminated union over single-table inheritance for transaction types?
A: STI would have left nullable columns everywhere — transferTo only makes sense for transfers, recurringSchedule only for recurring. The union pattern keeps each type clean and the TypeScript compiler catches missing fields.

Q: How does the cascade delete work between Account and Transaction?
A: Deleting an account cascades to its transactions. Initially had it set to restrict, but that made account cleanup impossible without manual transaction deletion first.

**Agent Summary (7 sub-sessions):**
| Role | Duration | LOC |
|------|----------|-----|
| backend-dev | 25m | 280 |
| qa-engineer | 18m | 190 |
| frontend-dev | 15m | 125 |
| security-engineer | 12m | 85 |
| code-reviewer | 8m | 0 |

---

## Accessibility Requirements (ALL templates)
- WCAG AA contrast (4.5:1 text, 3:1 large text/UI)
- Skip-to-content link (visually hidden until focus)
- Semantic HTML: main, nav, article, section, aside, header, footer
- Heading hierarchy: h1 → h2 → h3 (no skips)
- aria-label on icon-only buttons and major sections
- Keyboard accessible: tab order, focus-visible outlines
- prefers-reduced-motion: disable ALL animations
- lang="en" on html element
- Alt text on images

## Technical Requirements
- Standalone HTML (inline CSS + JS, no build step)
- Google Fonts CDN for web fonts
- Responsive (mobile-first, breakpoint at 768px)
- Nav links between 3 pages (relative: ./portfolio.html, ./project.html, ./session.html)
- Each file 800+ lines minimum
