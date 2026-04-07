# heyi.am — Product Requirements Document

> Canonical product spec. Supersedes the scattered intent across PRODUCT.md, STRATEGY.md, PORTFOLIO_UX.md, and PORTFOLIO_PREVIEW_PRD.md where they conflict. Those documents remain as deeper references; this one is the single source an engineer, designer, or investor should be able to read end-to-end.

---

## 0. Executive Summary

heyi.am is a developer portfolio product built on a single observation: the most interesting thing about a modern engineer is no longer the code that ended up in the repo, it is the conversation that produced it. Every AI coding session — every `claude` invocation, every Cursor chat, every `codex` run — is a recording of how a developer actually thinks under pressure: what they tried, what they rejected, where they overrode the model, what they decided was good enough. Those recordings exist on every engineer's laptop today. Nobody is doing anything with them. They get garbage-collected after thirty days and the signal is lost.

The product is a CLI plus a web layer. The CLI runs locally, indexes sessions across Claude Code, Cursor, Codex, and Gemini, archives them so they survive the upstream tool's cleanup, and walks the developer through a curated upload flow that turns a chosen project's messiest sessions into a small set of structured case studies. The web layer is a thin serving shell that hosts the result at `heyi.am/:username` — but hosting is only one of three publish targets. The same artifact can be exported as a self-contained static site to a folder on disk, pushed to GitHub Pages, or published to heyi.am. The CLI is the canonical place a portfolio is made; heyi.am is one of several places it can live.

The bet is that the transformation from raw transcript to curated case study is the part nobody else is building, and that owning that transformation creates a new category of developer artifact: the AI collaboration portfolio. The product principle that holds the whole thing together is non-negotiable and editorial: *if it sounds like a blog post, it's wrong; if it sounds like a dev thinking out loud, it's right.* Every output is filtered through that bar. Quality comes from refusing fluff, not from generating more of it.

**Positioning, in one line:** *heyi.am is the local-first portfolio that shows how you think with AI, owned by you, hosted wherever you want.*

---

## 1. The Product in One Sentence (and what that sentence hides)

**heyi.am turns the AI coding sessions on a developer's laptop into a curated, self-hostable portfolio of case studies that show how they think.**

That sentence hides three things, each of which is a common misread we have to actively fight.

**It's not a blog generator.** A blog generator writes prose for you to publish under your name. heyi.am refuses to do that. The narrative on every page is built from the raw structure of the session — files touched, decisions reversed, tools chained, questions answered — and then cross-checked against a tight editorial standard that bans fluff vocabulary and forces the developer's own voice through targeted questions during enhancement. The output is shorter than what an AI summarizer would produce, not longer. The product is more like a typesetter than a ghostwriter.

**It's not a hosted service that happens to have a CLI.** The CLI is the product. The web app is one of three places the product can be delivered. We have built the renderer such that the same publish action can write a complete static site to a folder on disk, push that site to a GitHub Pages branch, or upload an HTML fragment to heyi.am for hosted serving. A developer who never trusts our servers gets a real portfolio they can `rsync` to their own box. A developer who wants the shortest path to a shareable URL gets one click.

**It's not a transcript viewer.** The published page is not a chat log with prettier styling. It is a case study with a title, a developer take, a stat strip, a phase timeline, decision callouts, and a collapsible evidence layer for the people who want to see the underlying turns. A hiring manager who lands on a heyi.am session should see *the shape of how this person worked* in the first viewport, not be asked to scroll through 200 messages. The transcript is evidence, not the story.

---

## 2. Who It's For

Four developers, each at a specific moment.

**Maya, the side-project shipper.** Friday morning, fifteen-minute window. A recruiter pinged her LinkedIn the night before; she replied "let me send you something" and now has to make good. She wrapped a weekend CLI for parsing GPX files four days ago, four sessions of interesting work. She does not want to learn a publishing system. She wants to open the app, see her work already there, confirm her bio isn't embarrassing, hit one button, copy a URL, paste it into the LinkedIn DM. If at any point she's asked to make a decision she didn't expect, she bounces and sends a GitHub link instead. Maya is the budget the entire UX has to come in under. *Job-to-be-done: turn a finished side project into a shareable URL in under fifteen minutes without thinking about it.*

**Devon, the indie dev with opinions.** Three months on the CLI, runs his blog on a Hetzner box, thinks GitHub Pages is fine but prefers Cloudflare. He wants heyi.am because the rendering is genuinely good but he will not let it own his URL. Devon needs Export-to-folder to be a top-level target with the same visual weight as heyi.am hosting, not a button in a dropdown. The moment that wins him is seeing three publish targets as peers; the moment that loses him is treating Export as an escape hatch. *Job-to-be-done: produce a real, inspectable, diffable static site directory I can host wherever I want, and re-publish to it on demand without re-doing setup.*

**Priya, the career-switcher with one project.** Bootcamp graduate, mid-transition, terrified of the blank slate. She has exactly one real project and five sessions she's proud of. She opens the Portfolio workspace and the preview pane is already populated with her project, because the portfolio is derived from what she's listed and she listed it yesterday. The product has to meet her where she already is, not drop her at "Create Your Portfolio." If a template designed for twelve projects looks sparse with one, the preview shows that honestly with a quiet note, and the "Use this template" button stays enabled. We do not paternalize. *Job-to-be-done: feel that the portfolio already exists and my job is to refine it, not build it.*

**Sam, the employed engineer with NDA-locked work.** Senior engineer at a company that doesn't let her open-source anything. Five years of real work that she cannot put on GitHub. She has 200 sessions of internal product work on her laptop. heyi.am's pitch to her is the only honest one in the market: *no code is shared.* The case studies show approach, decision-making, and judgment without leaking files. The "transcript visible" toggle is per-session, defaults safely, and a sanitized session can be published with the code redacted while the thinking remains. *Job-to-be-done: demonstrate the quality of my professional work to a future employer without violating my current employer's NDA.*

A hiring manager is a critical fifth user but is a *reader*, not an *author*. The session viewer design (see SESSION_VIEWER_VISION.md) is built for them: 60 seconds per session, no scrolling, signal in the first viewport.

---

## 3. The Core Value Proposition

The central claim is this: *a curated case study of how a developer worked with AI is a higher-fidelity signal of engineering judgment than any artifact currently on a portfolio.*

A GitHub repo shows you the code that survived. It hides the three approaches that got rejected, the moment the developer overrode the AI and was right, the test run that failed four times before passing, and the decision to abandon Redis because the latency wasn't worth the operational overhead. A blog post can describe those moments but requires the developer to sit down and write — which most don't, and the few who do produce content that sounds like content. A raw transcript share (Claude `--share`, Cursor Share Chat) preserves all the signal but in a form so noisy that no hiring manager will read it. Each existing artifact loses something the others preserve.

The case study is what's missing in the middle. It is structured enough that a hiring manager can extract signal in 60 seconds, evidence-rich enough that a peer can dig in for five minutes and learn something concrete, and grounded enough in real session data that it cannot be fabricated by someone who didn't actually do the work. The transformation from raw turns to case study is the hard part. It is what every other tool in this space declines to do.

That transformation only works under one editorial standard: **it has to sound like a developer thinking out loud, never like an AI explaining what a developer did.** If we slip on this, the output becomes another flavor of AI slop and the entire premise dissolves. The product enforces the standard in three places. The LLM prompts ban the corporate vocabulary that signals AI authorship: *leverage, utilize, streamline, robust, seamless.* The enhancement pipeline forces a two-pass narrative where the developer answers targeted questions in their own voice and the AI rewrites incorporating those answers. And the stats framework (STATS.md) refuses any composite "collaboration score" — every number is something a developer would actually mention at a bar.

Anti-fluff is not a stylistic preference. It is the load-bearing wall.

---

## 4. The Complete User Journey

The first time Maya touches the product she runs `npm install -g @heyiam/cli` (or grabs a binary release; both paths exist). She types `heyiam open`. The CLI starts a local Express server on `localhost:17845`, opens her browser, and drops her into FirstRun.tsx — an eight-step terminal-styled onboarding flow that walks through: detect installed AI tools, count sessions per tool, archive them so they survive cleanup, build the SQLite index, claim a username (calls `app_web` to reserve `heyi.am/maya`), and explain what the product is. Onboarding is fast and uninterrupted; it is the only time the UI says "let's set things up."

When onboarding ends she lands on the Dashboard at `/`. Not the project list, not the Portfolio workspace. The Dashboard is the orientation surface: hero copy ("Turn your AI sessions into a dev portfolio"), four stat cards (Sessions indexed, Projects synced, Enhanced, Sources), an action row with Sync / View projects / Search sessions / Open Portfolio, a recent projects grid showing whatever the first sync pulled in, and four feature callouts (Archive / Build / Search / Export). This is the home. From here she can drill into Projects, step into the Portfolio workspace, run a search, or kick off a sync. Portfolio is something she navigates into when she's ready to think about the public-facing artifact; it is not a place she gets dropped. The product assumes she knows why she's here — no celebration modal, no "let's get started" tour.

She clicks Projects in the sidebar. She sees her local project gallery — every directory the parsers found a session in, each card showing aggregated stats (sessions, time, LOC, files), skills chips, and an "Upload" button. She picks the GPX project and clicks Upload.

This drops her into the seven-step project upload wizard, which is the one part of the product that *is* a wizard, because the AI-assisted curation flow is genuinely a sequence of decisions she has to make in order. **Overview** lists every session in the project. **Triage** shows the AI's selection — the 3-layer triage from PRODUCT.md picks the sessions worth featuring, tags each kept session with a significance reason, and tags each skipped one with a reason for skipping; she can override any of it with checkboxes. **Enhance** is a split panel: left side streams a per-session processing feed as the LLM enhances each chosen session, right side streams the project narrative as it's generated. **Questions** presents 2-3 targeted questions generated from patterns the AI detected ("you overrode the model 4 times — was that a strategy?"); she answers in her own voice or skips. **Timeline** shows the sessions arranged chronologically with featured cards expanded and small ones collapsed. **Review** shows the project card preview, repo URL (auto-detected from git remote), project URL (manual), and an optional screenshot upload. She picks 2-4 featured stats from the Stats picker (defaults are pre-selected, see STATS.md). She clicks Publish.

The wizard's terminating screen used to deposit her on the project list. As of the new design it deposits her in the Portfolio workspace, with the new project already listed and the status bar amber: "Draft — 1 change since last publish." This is the critical handoff: the wizard is for adding a project, the workspace is for shipping the portfolio, and the wizard ends by saying "now go ship."

The first time she clicks the publish button in the workspace, she sees the target picker sheet — a three-card sliding panel with Export to folder, Publish to heyi.am, and Publish to GitHub Pages, in that order. Maya has fifteen minutes, so she picks heyi.am. The handle is prefilled from her username, custom domain is collapsed behind a disclosure, she clicks Publish. The button fills left-to-right with a darker shade for two seconds, then relabels to "View live" and the status dot flips green. No confetti, no toast, no auto-opened browser tab. She clicks "View live", lands on `heyi.am/maya`, copies the URL, pastes it into LinkedIn. *Five seconds from green dot to shareable link.* That's the Maya path.

A week later she comes back. She edited her bio yesterday to fix a typo. She opens the Portfolio workspace. The status bar is amber: "Draft — 1 change since last publish to heyi.am." Next to the dot is a "View changes" link that opens a small popover listing the specific diffs ("Bio edited"). She doesn't even need to look. She hits Re-publish. Two seconds. Green. Done.

Devon's path branches at the target picker. He opens the workspace, sees the three targets, and picks Export to folder first because he wants to see what we actually produce. He picks `~/sites/portfolio` as the output directory, hits Publish, and the CLI writes a complete static site there: `index.html` at the root, `projects/gpx-cli/index.html`, `projects/gpx-cli/sessions/debugging-the-parser.html`, an `assets/` folder for screenshots. Finder opens automatically. He inspects the files. The CSS is inlined per-page (~40KB duplicated), the structure is human-readable, links are relative, no opaque hashed filenames. He `rsync`s it to his Hetzner box. Then he opens the target picker again, picks GitHub Pages, kicks the inline OAuth flow, picks a repo, and publishes a second target. Now his portfolio lives in three places. The status bar shows whichever target is currently active; clicking the target pill reveals all three with per-target dots.

Sam's path is mostly the same as Maya's with one inflection: in the project upload wizard's Review step, she toggles `transcript_visible: false` for sessions that contain proprietary code. The case studies still publish — title, developer take, stats, phase timeline, decision callouts, file change *counts* — but the raw transcript is unreachable. The thinking is shareable; the code is not.

---

## 5. The Surfaces

A surface-by-surface inventory. For each, what it is, what's there, what isn't, and what state of existence it's in.

### CLI commands

The terminal layer. **Existing.** `heyiam open` starts the local server and opens the dashboard. `heyiam time` prints a per-project human-vs-agent hours table to stdout. `heyiam search [query]` runs a full-text search across the SQLite index with faceted filters. `heyiam context <id>` exports a session as compressed context for an AI consumer at compact, summary, or full fidelity. `heyiam archive` runs discovery and hard-link archiving idempotently. `heyiam sync` parses and indexes new sessions. `heyiam reindex` rebuilds from scratch. `heyiam status` reports archive health, session counts, and daemon status. `heyiam daemon start|stop|install` manages the optional Tauri tray app. `heyiam export` (existing per-project) exports a single project as standalone HTML. The CLI does **not** have a `vibe` subcommand — howdoyouvibe is a separate package.

### Dashboard (`/`)

**Existing.** The orientation surface and the post-onboarding landing page. Hero block ("Turn your AI sessions into a dev portfolio"), four stat cards (Sessions indexed, Projects synced, Enhanced, Sources), an action row (Sync new sessions / View projects / Search sessions / Open Portfolio), a recent projects grid, and four feature callouts (Archive / Build / Search / Export). Dashboard is the first sidebar destination and the place users return to when they want to see their data state at a glance and pick what to do next. Small additive enhancements in Phase 6 of the implementation plan: the Open Portfolio button in the action row is new, the Enhanced stat card becomes clickable (routes to Projects filtered to unenhanced), and the Export callout copy is updated to describe the full local-first multi-target story ("Export your full portfolio as a static site, publish to heyi.am, or push to GitHub Pages"). The hero, stat cards, and recent projects grid are not otherwise touched.

### First-run onboarding (FirstRun.tsx)

**Existing.** Eight-step terminal-styled flow that runs once on first `heyiam open`. Detect tools, count sessions, archive, index, claim username, explain product, finish. At sequence end it deposits the user on the Dashboard at `/` — the orientation surface, not the projects list and not the Portfolio workspace. The flow itself is not restructured.

### Projects list

**Existing.** Local project gallery. Cards show stats, skills chips, and an Upload button. The "My Portfolio" link that currently lives at the top-right of this screen and points at the `/preview/portfolio` debug tunnel is **deleted** in Phase 3. Projects is a sibling of Portfolio in the sidebar, not a parent of it.

### Project detail and upload wizard

**Existing.** The seven-step wizard (Overview → Triage → Enhance → Questions → Timeline → Review → Done) is the most mature surface in the product and is left **untouched** in v1. It works. The only change is the destination of the Done step — wizard terminates at the Portfolio workspace, not the projects list. Project detail (sessions inside a project) is also untouched. Cross-project chronological session browsing lives on the Sessions surface (below); cross-project session *search* is handled by the global ⌘K palette.

### Sessions (`/sessions`)

**Existing. Untouched by the portfolio workspace work.** A top-level sidebar destination and a different cut of the same data than Projects: Projects groups by project, Sessions is a flat chronological and searchable list across all projects. It is the home for the local SQLite session index, faceted search (tool / project / skill / time), and the existing local session detail viewer (transcript view). Nothing about Sessions, the local session detail page, or the `heyiam search` CLI command changes in this branch. ⌘K is *added* as a global affordance from anywhere in the app, not as a *replacement* for the Sessions surface.

### Portfolio workspace

**New, in active development. Phase 3 of the implementation plan.** The central surface. Three regions: a 56px status bar, a 60% live preview pane on the left, a 40% edit rail on the right (capped at 480px on ultrawide). Status bar shows the active target as a pill, the state as a colored dot with phrase, and the primary action as a single dominant button. Preview pane is an iframe sourced from the internal render pipeline, debounced 300ms after edits, scroll-preserving, with a segmented control for Landing/Project/Session and a clickable template pill. Edit rail has six collapsible sections: Identity, Contact, Photo & resume, Projects on portfolio, Template, Accent color. No save button. Changes commit on blur. The workspace is the only place portfolio editing happens; the preview is always real data, never mock.

### Template browser

**Existing as standalone route, becoming dual-mode in Phase 6.** Same component, two entry points. As a modal it is invoked from the Portfolio workspace edit rail's Template section; as a route it lives at `/templates`. Two-column layout: filterable grid of template cards on the left (3-across, wireframe thumbnails, no marketing copy), large live preview on the right. Toggle above the preview switches between mock data (default) and the user's real data. The "Use this template" button is never disabled — even when real data underfills the template, the user sees the truth and decides for themselves. Three filter strips above the grid (density, tone, layout) reduce 27 templates to 6-9 per combination. There are 29 templates today; the 27 figure in the UX doc is approximate.

### Settings

**Existing, shrinking in Phase 3.** Settings becomes app config only: API configuration (Anthropic key), Authentication, Connected accounts (the only place OAuth tokens appear, though they are *configured* inline in the target picker, not from Settings), and Local data status (archive health, daemon status, DB location). The portfolio profile editor that currently lives in Settings is **moved** to the Portfolio workspace edit rail. Copy-then-delete, never refactor-and-move.

### Global ⌘K command palette

**Future.** Cross-project session lookup. Invokable from anywhere via a mono pill in the AppShell top bar. Not a top-level destination, not a sidebar item; it is a global affordance that sits *alongside* the Sessions surface, not in place of it. Fuzzy search across session titles, project names, skills, and content (FTS). Selecting a result drills into the project and opens that session.

### Public portfolio (`heyi.am/:username`)

**Existing.** Hosted landing page. Hero block (name, bio, location, avatar, skills), AI Collaboration Profile (4-dimension bars; only shown when 8+ sessions are published), project cards with narrative + stats grid + skills, aggregate stats. Served from `public_web` (port 4000), no session cookies, HTML stored in `users.rendered_portfolio_html`.

### Public project (`heyi.am/:username/:project`)

**Existing.** Hosted project page. Breadcrumbs, narrative, skills, screenshot, hero stats (time/sessions/LOC/files), per-session agent activity SVGs, project timeline with featured/collapsed groups, growth chart, directory heatmap, top files table. Stored as `projects.rendered_html`.

### Public session (`heyi.am/:username/:project/:slug` or `/s/:token`)

**Existing, with the SESSION_VIEWER_VISION.md rebuild as active design work.** Two-column case study layout. Currently renders the Editorial template; the other five templates from PRODUCT.md (Terminal, Minimal, Brutalist, Campfire, Neon Night) are defined in the schema but not yet rendered. The vision doc plans a phased rebuild from "flat transcript with DEV/AI labels" to "phase timeline with decision callouts and progressive disclosure." Both URL forms resolve to the same content; the friendly URL shows breadcrumbs, the `/s/` URL is for sharing.

### Exported static site

**New, in active development. Phase 1 and Phase 4.** A self-contained directory written by `generatePortfolioSite()` in `cli/src/export.ts`. Layout mirrors the hosted version: `index.html`, `projects/{slug}/index.html`, `projects/{slug}/sessions/{slug}.html`, `assets/`. CSS inlined per-page, fonts loaded from CDN, mount.js inlined for chart hydration. No server required. Devon's trust moment.

### GitHub Pages deployment

**New. Phase 5.** Same artifact as the static export, pushed to a GitHub repo via the GitHub Git Data API (one batched tree commit, not N file PUTs), served via Pages. OAuth via device flow, token stored in OS keychain via keytar (never in `~/.config/heyiam/settings.json`). Pages build polled for ~120 seconds; status dot only flips green when build is confirmed.

### howdoyouvibe

**Existing as standalone package.** `npx howdoyouvibe`. Scans local sessions, computes the ~25 stats from STATS.md, picks an archetype from a 10×10 combinatorial grid, generates a 2-sentence narrative via Gemini Flash (the only network call, and only computed stats are sent — never raw session text), and outputs a shareable URL + downloadable card. Lives in its own Phoenix endpoint (`vibe_web` on port 4002, `howdoyouvibe.com`) with zero foreign keys to core tables. Designed for clean extraction. It is the funnel, not a feature of the main product.

### Daemon (heyiam-tray)

**Existing, early-stage.** Optional Tauri tray app that runs in the background, watches for new sessions across all four tools, and archives them without the CLI being open. Installed via `heyiam daemon install`, registers with macOS launchd or Linux XDG autostart. The CLI works without it; the daemon just removes the "remember to run heyiam archive" step.

### AI Collaboration Profile

**Existing.** A computed 4-dimension profile (task scoping, active redirection, verification, tool orchestration) that appears on the public portfolio when the user has 8+ published sessions. Not a vanity score — each dimension is a real signal pulled from session data. Hidden until the threshold is met because the stats are noisy with small N.

---

## 6. The Data Model

The conceptual objects users think in. This is the mental model, not the schema.

A **User** is one developer with a username, a profile (bio, photo, contact, links, resume), an authentication identity, and zero or one portfolio. Stored in `users`. The username is the URL slug.

A **Project** is the primary unit of curated work. It has a title, a narrative, an arc, a timeline, aggregated stats, featured stat keys, links (repo, project, screenshot), and a list of published sessions inside it. It is first-class in the database (`projects`). It has a visibility state: draft, listed, or unlisted.

A **Session** is a single AI coding session — one Claude Code conversation, one Cursor chat, one Codex run. It belongs to a project. When published it becomes a *case study*: title, context, developer take, execution path, skills, Q&A pairs, metadata, optional agent summary. Stored as `shares` in the DB. It has its own visibility state and a separate `transcript_visible` toggle.

A **Portfolio** is — as of the new design — first-class in the user's mental model and operationally explicit in the CLI, even though it remains a derived artifact in the database. It is the union of the user's profile plus the listed projects, rendered through the active template, written into `users.rendered_portfolio_html` at publish time and into a static folder at export time. There is one portfolio per user. Portfolios are not stored as a separate table because they are functionally a snapshot of profile + projects; they are stored as a serialized HTML blob plus per-target publish state in the CLI's `settings.json`.

A **Vibe** is a howdoyouvibe result. Stat blob + archetype + narrative + optional shareable URL. Anonymous, no FK to users. Lives in its own table for clean future extraction.

A **Target** is a publish destination. v1 ships three: Export-to-folder, heyi.am-hosted, GitHub-Pages. Each target has its own configuration (folder path, handle + custom domain, repo + branch + CNAME), its own credentials (none, bearer token, OAuth in keychain), its own per-target publish state (last published timestamp, last published profile hash, last published profile snapshot, URL). Targets are stored client-side in `settings.json` under `portfolioPublishState.targets`. They are not stored on the server. The server doesn't know how many targets a user is publishing to; it only knows what gets uploaded to it.

A **Template** is a Liquid + CSS pair. The Liquid file owns layout, the CSS file owns visual treatment. There are 29 templates in the repo; Editorial is the most mature. Templates are not user-creatable in v1 (custom themes are a future surface). Per-project template overrides are out of scope; all projects on a portfolio share the portfolio's template.

The **AI Collaboration Profile** is a computed object — four dimensions calculated from the user's session corpus. Derived, not stored. Materialized at publish time and embedded in the portfolio HTML. Hidden until 8+ sessions are published.

The relationships are simple. User has many projects. Project has many sessions. Project belongs to user. Session belongs to project. Portfolio is the projection of (user, listed projects, template) onto rendered HTML. Targets are client-side bindings between a portfolio and a destination.

---

## 7. Content Lifecycle and Publish Model

The lifecycle model works at three levels: project, session, and portfolio. Projects and sessions share the existing three-state model from PRODUCT.md (draft / listed / unlisted). Portfolios add a new dimension on top: per-target publish state.

**Projects** are created in the `draft` state by the CLI upload flow. They become `listed` when the user toggles them on from the heyiam.com app (or, in v1's simpler path, when they pick the project as part of the portfolio listing in the Portfolio workspace edit rail). They can be moved to `unlisted` (link-only access, not on the portfolio) or `listed` (public, on the portfolio) instantly. Delete is permanent and removes DB rows, S3 files, and cascades to a portfolio re-render.

**Sessions** follow the same three states as projects. The CLI uploads them in `draft`. The web app controls visibility transitions. A session also has an independent `transcript_visible` boolean (default true). When false, the published case study still renders title, developer take, stats, and decision callouts; the raw transcript route returns 404. This is the NDA-safe path for Sam.

**Portfolios** are conceptually derived from (profile, listed projects, template) and operationally explicit through the publish action. The state machine, viewed from the CLI workspace, has five states:

*Unpublished.* No target has ever received a publish. Status bar gray, "Never published," primary action is "Publish to heyi.am" (the default first target).

*Draft-with-changes.* The active target was published before, but the current profile hash differs from the stored hash. Status bar amber, "Draft — N changes since last publish," primary action is "Re-publish to {target}." A "View changes" popover lists field-by-field diffs.

*Published-clean.* The active target's stored profile hash matches the current hash. Status bar green, "Published to {target} · 2m ago," primary action demotes to "View live" (opens the URL or folder).

*Published-with-divergence.* Functionally identical to draft-with-changes but the diff receipt includes a "since last publish on {date}" timestamp. The semantic difference is "I published this once, then edited" vs "I edited and never published the active target."

*Publish-failed.* The last attempt errored. Status bar red, "Last publish failed," primary action is "Retry publish." Errors are surfaced inline, not buried in toasts.

The interesting case is **multi-target mixed state**. A user can have heyi.am green, Export amber (folder was written last week, profile has changed since), and GitHub Pages gray (never published). The status bar shows the *active* target's state. Clicking the target pill reveals all three with per-target dots; switching the active target switches the entire status bar context. There is no attempt to show three publish buttons at once.

State transitions:

- **Profile/template/order edit in CLI** → all targets that were previously clean transition to draft-with-changes (their stored hash no longer matches).
- **Project listed/unlisted toggle from web app** → triggers an automatic server-side portfolio re-render for the heyi.am target. Folder and GitHub Pages targets do *not* auto-update; they remain at their last-published state and show as draft-with-changes the next time the user opens the workspace.
- **Project delete** → cascades exactly like the toggle.
- **Publish action** → renders the current portfolio for the active target only, writes the artifact, updates that target's stored hash + snapshot + timestamp, transitions that target to published-clean. Other targets are unaffected.

Re-publish is always a clean re-render. Incremental publish is deferred. The render pipeline takes under two seconds; the state-diff complexity isn't worth the speed win.

Draft detection is profile-hash-based: `sha256(sortedJson(profile)).slice(0, 16)` compared against the stored hash from last publish. Cheap, accurate, no render needed. The "View changes" popover compares the current `getPortfolioProfile()` against the stored snapshot field-by-field. Project ordering is part of the snapshot.

---

## 8. Feature Set (v1 scope)

The definitive list of what ships in v1, grouped by surface, with implementation status. "Existing" means the feature is in main today. "Phase N" refers to PORTFOLIO_IMPLEMENTATION.md. Anything not on this list is either deferred (Section 9) or out of scope.

**CLI core (existing).** Multi-tool session discovery (Claude Code, Cursor, Codex, Gemini). Hard-link archiving with idempotent re-runs. SQLite session index with FTS. Two-phase sync (discover → index). Per-tool parsers producing a consistent SessionAnalysis contract. Pre-publish two-layer secret redaction (secretlint + custom regex). Context export at three fidelity tiers. Full-text search with faceted filters. Background daemon (heyiam-tray) for continuous archiving. Device auth login (RFC 8628).

**Project upload wizard (existing).** Seven-step flow: Overview, Triage (3-layer: hard floor + signal scoring + LLM ranking with fallback), Enhance (per-session enhancement + project narrative), Questions (2-3 context-aware), Timeline, Review (with stats picker), Done. AI cost guardrails (40k token budget, truncation guard). Dual LLM path (BYOK Anthropic + Phoenix proxy with quota).

**Portfolio renderer (Phase 1).** `generatePortfolioSite()` produces a complete static site directory. `generatePortfolioHtmlFragment()` produces the fragment for Phoenix upload. Same template, two output modes. Audit existing Liquid templates for relative URLs before wiring.

**Portfolio publish API (Phase 2).** `POST /api/portfolio/publish` Phoenix endpoint that writes to `users.rendered_portfolio_html` through the existing sanitizer. CLI-side `publishPortfolio()` and per-target publish state in `settings.json`. Profile-hash-based draft detection.

**Portfolio workspace (Phase 3).** New `/portfolio` route. Status bar, preview pane, edit rail. Profile editor moved out of Settings. 30-second TTL cache on the preview render. ⌘↵ keyboard shortcut.

**Static export target (Phase 4).** Target picker sheet with three cards. Export-to-folder card with native folder picker (File System Access API + text fallback). Cross-platform reveal-in-finder.

**GitHub Pages target (Phase 5).** Device-flow OAuth, keytar token storage, GitHub Git Data API push, Pages build polling. Connected accounts section in Settings.

**Template browser polish (Phase 6).** Dual-mode component (modal + standalone route). My-data toggle. Template pill in preview pane. Open-in-browser button. FirstRun ends at Portfolio. Local data section in Settings.

**Public web (existing).** Public portfolio rendering. Public project rendering. Public session rendering (Editorial template only; other templates pending the SESSION_VIEWER_VISION rebuild). Both `/:username/:project/:slug` and `/s/:token` routes. Per-session transcript visibility.

**App web (existing).** Auth (phx.gen.auth + GitHub OAuth + device flow). Project visibility controls. Session visibility controls. Delete (cascades to S3 + portfolio re-render). LLM proxy with quota tracking.

**howdoyouvibe (existing).** Standalone npx package. Stats computation. Archetype matching. Narrative generation via Gemini Flash. Shareable URL. Hosted on `howdoyouvibe.com` (vibe_web on port 4002).

**AI Collaboration Profile (existing).** Computed from session data, surfaced on portfolio at 8+ sessions threshold.

**Stats framework (existing).** ~25 stats across three categories. Per-project stat picker in upload wizard. Default selection logic. Aggregation rules (sum, mean, max, weighted) per stat type. Single-source-of-truth catalog in CLI and Phoenix.

---

## 9. Deferred / Out of Scope

Everything deliberately not in v1, with one-line justification.

**Per-project template overrides.** All projects share the portfolio's template. Adds combinatorial complexity to the renderer with negligible user benefit.

**Multi-portfolio support.** One portfolio per user. The flexibility belongs in *which projects are listed*, not *how many portfolios exist*. Power users will ask; the answer is "wait."

**Project workspace redesign.** ProjectDetail.tsx works. Touching it triples Phase 3 scope.

**Enhance / Triage / Questions wizard redesign.** It works. Don't break what's shipping.

**Session viewer rebuild (SESSION_VIEWER_VISION.md).** The vision is correct but the rebuild is its own multi-phase project. Editorial template ships in v1; the phase-timeline-with-decision-callouts redesign ships post-v1.

**Other five session templates (Terminal, Minimal, Brutalist, Campfire, Neon Night).** Defined in schema, not yet rendered. Editorial-only in v1.

**Recruiter discovery surface.** Requires hosted-only data and a separate user role. Pro-tier or later.

**Analytics dashboard.** Pageviews, referrers, click events. Requires server-side instrumentation. Pro-tier.

**Verification badges / verified credential.** Speculative. Requires credential infrastructure.

**Custom themes (user-authored).** The data model allows for it; the UI does not. Future.

**Mobile responsive preview pane.** The preview pane shows desktop only in v1. Templates *render* responsively when served, but the workspace doesn't simulate mobile.

**Session transcript search inside the public viewer.** Static HTML, no server-side search. Use ⌘K in the CLI.

**Onboarding restructure.** Eight-step flow stays. Only the terminal navigation destination changes.

**Offline font bundling for static export.** CDN-loaded Google Fonts in v1. Future enhancement.

**Incremental publish.** Every publish is a clean re-render. Revisit when the render pipeline becomes a bottleneck.

**Multi-portfolio support, team accounts, SSO, SAML, ATS integrations.** Team / Enterprise tiers, post-v1.

---

## 10. Monetization Model

The principle from STRATEGY.md still holds: monetize the portfolio, not the tool. The CLI is free forever; it is the growth engine. Free includes parsing, enhancement, BYOK LLM (unlimited), proxy LLM (10/month quota), all 29 templates, public portfolio at `heyi.am/:username`, and static export to folder.

The local-first pivot creates a new tension. If Export-to-folder is free and produces a real, hostable static site, what does Pro actually sell? A naive answer is "the hosted experience" — but we have explicitly committed that *every target produces the same artifact* and that we won't differentiate features by target. So Pro cannot be "extra features on heyi.am that the static export can't reproduce." That would betray Devon and dissolve the local-first positioning.

The honest Pro hooks in a local-first world are the things that *cannot* exist in a static folder by definition:

**Custom domain on heyi.am.** A folder export already lets the user host at any domain they want; the value of a hosted custom domain is the zero-config DNS path for users who don't run servers. Ships in v1 Pro if backend is ready, otherwise stub the UI.

**Recruiter discovery.** A hosted index of opt-in portfolios that recruiters can search by skill and collaboration style. By definition this only exists on heyi.am. Pro feature, ships post-v1 once 5,000+ portfolios exist.

**Analytics dashboard.** Page views, referrers, click-throughs. By definition requires a server. Ships post-v1 Pro.

**AI proxy quota uplift.** Free is 10 enhancements per month via the Phoenix proxy; Pro is unlimited. Trivial to implement, immediate value for heavy users. Ships in v1 Pro.

**Private project visibility.** A `listed: private` state where the project page renders only for authenticated viewers. Unlocks Sam's NDA work case more cleanly than per-session transcript toggling. Ships in v1 Pro.

**Verified credential.** Content hashes prove the work is real. The hardest one to build but the most defensible long-term. Speculative for Enterprise.

**Recommendation:** v1 Pro at launch ships with custom domain, AI proxy quota uplift, and private project visibility. Analytics, recruiter discovery, and verification land later. Price at $12/mo or $99/yr. Free-to-Pro upgrade CTA appears in the CLI after the first successful publish, never before. The footer "Built with heyi.am" branding removes on Pro, which is the cheap psychological hook that converts more than any actual feature.

What we will not monetize: session count limits (friction at the worst moment), AI quality (quota is enough), templates (drives sharing), the CLI itself (kills the funnel).

---

## 11. Competitive Positioning

The competitive map has two axes now, not one. The first axis is **transformation**: does the tool turn raw sessions into curated case studies, or just dump transcripts? The second axis is **ownership**: does the user own the artifact, or does the tool own it? heyi.am is the only product in the upper-right quadrant of both.

**Direct competitors.** Claude Code `--share` produces a raw transcript dump on Anthropic's domain — no curation, ephemeral, owned by Anthropic. Cursor Share Chat is the same model. ChatGPT shared links are general-purpose, not developer-specific. Replit project sharing is tied to the Replit IDE. Every existing share feature is on the dump-and-host side of both axes. None of them transform; none of them give the user a self-hostable artifact. The transformation moat is real and unattacked.

**Adjacent — developer portfolio platforms.** GitHub Profile shows commit quantity. Peerlist and Read.cv require manual curation. Dev.to and Hashnode require writing. GitHub Pages and Netlify host static sites but don't generate them from session data. None bridge "raw AI session" to "structured case study." heyi.am sits in the gap.

**Adjacent — AI coding analytics.** GitHub Copilot Metrics, Cursor analytics, Sourcegraph Cody — all enterprise admin dashboards measuring acceptance rates and tool invocations. Quantitative, not qualitative. Not user-facing. Not a portfolio. The whitespace heyi.am addresses ("how well does this developer collaborate with AI") is wide open.

**Two moats, both load-bearing.**

The first moat is the **transformation layer**. Turning a session transcript into a case study is opinionated, hard, and editorially constrained. The tone has to be right. The triage has to skip the noise. The questions have to provoke real answers. The fluff filter has to hold. A vendor would have to commit to all of that as a product, not as a feature, and that's a hard pivot for a company optimized for shipping a great IDE or a great model.

The second moat — added by the local-first pivot — is **artifact ownership**. Even if Anthropic shipped session sharing tomorrow with a curated case study layer, they would not also let the user export the result as a static site they could host on their own server. Local-first export is a positioning a venture-backed AI lab cannot follow without contradicting their distribution strategy. We can.

**Platform risk** (from STRATEGY.md): medium-high, 12-18 month timing advantage. Mitigation: multi-tool support so we don't rise or fall with one vendor; build the identity layer fast; own the canonical `heyi.am/username` URL; ship the export path so even a vendor copy can't take Devon's portfolio away from him.

---

## 12. Success Metrics

Three tiers, in increasing time horizon.

**Leading indicators (do users understand the product?).** Median time from first `heyiam open` to first published portfolio under 20 minutes. Wizard completion rate (Overview to Done) above 60%. Less than 10% of users abandon the Portfolio workspace after their first visit without publishing to any target. Average time spent in the Portfolio workspace before first publish under 8 minutes (it should feel cheap, not effortful). Publish-to-export-target rate above 25% of users (signals Devon's persona is being served, not just Maya's).

**Lagging indicators (does it have real value?).** Percentage of published portfolios shared externally (link click from a non-heyi.am referrer) above 40% within 30 days of publish. Median sessions-per-published-project at 4-7 (inside the Triage sweet spot — too few suggests the wizard is frustrating, too many suggests no curation is happening). Percentage of portfolios with an AI Collaboration Profile (i.e., 8+ published sessions) above 15% at 90 days. Hiring manager engagement on public session pages (median time on page) above 45 seconds, up from the current estimated <10s on the legacy session viewer. Frequency of `Copy for AI` usage in the CLI session viewer (signal that the local tool is genuinely useful even before publishing).

**Business indicators (path to revenue).** Once Pro ships: free-to-Pro conversion rate at 2-4% within the first 90 days post-launch. Monthly churn under 5%. Number of portfolios with custom domains attached (signal that Devon's persona is willing to pay). At Team / Recruiter tier (post-launch + 12mo): 10+ paying teams of 5+ seats; 3+ paying recruiters at $99/mo.

A note on what we will *not* measure as success: total session counts, total LOC indexed, total tokens processed, total pageviews. Those are vanity metrics that look good in a deck and don't move with product quality. The qualitative signal — "did a developer who landed on a published session learn something about the author's judgment?" — is the only thing that matters, and it is best measured by the lagging indicators above.

---

## 13. Open Questions Blocking Final Scope

Five founder calls. Trade-offs only; no answers.

**1. `/:username` before first publish — 404 or claimed-empty placeholder?** Current code falls back to a legacy template-based portfolio view for users with `rendered_portfolio_html = null`. The PORTFOLIO_UX recommendation is a hard 404 to avoid leaking that an account exists. Trade-off: 404 means a prematurely shared link looks broken (the user's mistake, fix is "publish"); a placeholder makes every unclaimed account a mild privacy leak and creates an awkward first impression. *PM lean: 404, with a clear error message that says "this username isn't published yet" rather than a generic 404 page.*

**2. Project ordering — auto by recency or user-curated?** Curated requires a drag-to-reorder component in the Projects-on-portfolio edit rail section and a `projectOrder: string[]` field in the publish state. Auto-by-recency requires no new UI. Trade-off: auto is zero-effort but produces bad portfolios (latest is rarely best); curated is the right default for a portfolio product but adds Phase 3 scope. *PM lean: curated, with new projects auto-inserted at the top.*

**3. Custom domains on heyi.am in v1 — ship the UI stub or defer?** The UI field is collapsed in the heyi.am target config; backend can stub. Trade-off: shipping the field promises a feature the backend may not enforce yet; deferring loses Devon on day one. *PM lean: ship the stub with a "DNS configuration required" helper state.*

**4. GitHub token expiry handling — silent failure + Settings redirect, or inline re-auth?** Inline re-auth is more engineering in Phase 5; silent failure is faster to ship but is the moment that decides whether Devon trusts us with his repo. *PM lean: inline re-auth. The trust delta is worth the engineering.*

**5. Per-target unlisted visibility on heyi.am in v1?** The data model supports it; the workspace doesn't surface it. Trade-off: introduces a target-specific config option that slightly dents the "all targets are equal" framing, but unlisted is a real need for job-hunting scenarios. Adding it to heyi.am only is honest (the concept doesn't exist for folder/Pages). *PM lean: ship a Public/Unlisted radio in the heyi.am target config, accept the slight asymmetry.*

---

## 14. Risks and Mitigations

**Tonal collapse.** The anti-fluff principle is the load-bearing wall. If LLM quality drifts, prompts loosen, or a shortcut is taken in the enhancement pipeline, the product degenerates into another AI content generator and the entire premise dissolves. *Mitigation:* the banned-vocabulary filter runs both at prompt-construction and post-generation; published outputs are spot-audited weekly against the principle; the founder retains veto authority over any prompt change to the enhancement pipeline.

**Platform risk (vendor copies the feature).** Anthropic, Cursor, or GitHub could ship a session-curation feature in 12-18 months. Probability is medium for Anthropic and Cursor, low-but-strategic for GitHub. *Mitigation:* multi-tool support so no single vendor can lock us out; ship the export-to-folder target first to make ownership the differentiator a vendor cannot follow; build the identity moat fast (own the canonical `heyi.am/username` URL before anyone else owns the slug).

**Multi-target state complexity.** Mixed-state portfolios (heyi.am green, folder amber, Pages gray) are a state-management challenge that has to be invisible to Maya and legible to Devon at the same time. If we get the model wrong, users will not trust the dot. *Mitigation:* the status bar always shows exactly one target's state; per-target dots only appear on demand; every state has a single load-bearing copy phrase; we never lie about state (unknown is shown as unknown, not green).

**AI cost runaway.** Generous proxy quotas + viral growth = a six-figure inference bill. *Mitigation:* hard 10/enhancement-per-month free quota; BYOK is the encouraged path in onboarding for power users; Haiku 4.5 default keeps per-call costs at ~$0.03 for triage; truncation guards prevent wasted long generations.

**Local-first complexity bleeding into UX.** Three publish targets multiply documentation burden, support burden, and edge cases. *Mitigation:* same verb ("Publish") across all three targets; same artifact across all three targets; one primary action visible at a time; aggressively defer features that would require per-target differentiation.

**Onboarding failure for Priya.** First-run drops a user into a workspace whose preview is empty because they have no projects yet. The risk is that this feels like "you didn't actually do anything." *Mitigation:* the onboarding flow walks through session discovery first (so they see a count of real sessions before the workspace), and the workspace's empty state is the user's *real* portfolio rendered with a quiet nudge, not a "Create Your First Portfolio" CTA. The framing must be "refine," not "build."

**The session viewer is still on its old design.** Hiring managers landing on a published session today see a flat DEV/AI transcript and bounce. The SESSION_VIEWER_VISION rebuild is a separate workstream and won't ship in the v1 portfolio scope. *Mitigation:* do not promote v1 to a wide audience until at least Phase A and Phase C of the session viewer rebuild are shipped (phase-grouped transcript + decision callouts on the public surface). Internal testing only until then.

---

## 15. Glossary

**Session.** One AI coding conversation in one tool — one Claude Code conversation, one Cursor chat, one Codex run. Indexed locally as a row in the SQLite session DB.

**Project.** The primary curated unit. A directory's worth of sessions plus a narrative, arc, timeline, stats, and links. First-class in the database.

**Portfolio.** The user's public-facing artifact. Profile + listed projects + template, rendered to HTML and shipped to one or more targets. First-class in the user's mental model; functionally derived in the database.

**Triage.** The 3-layer process of selecting which sessions in a project are worth featuring: hard floor (skip <5 min, <3 turns), signal extraction (corrections, reasoning words, tool diversity), LLM ranking with fallback.

**Enhance.** The two-pass narrative generation: AI drafts from raw transcripts, user answers targeted questions, AI rewrites incorporating the user's voice.

**Narrative.** The 2-3 sentence project description generated by Enhance. Lives at project level. The output the editorial bar applies to most heavily.

**Target.** A publish destination. v1 ships three: Export-to-folder, heyi.am-hosted, GitHub-Pages. Stored client-side per portfolio.

**Template.** A Liquid layout file plus a CSS treatment file. 29 in v1. Liquid owns layout, CSS owns visual treatment, separation enables future custom themes.

**Vibe.** A howdoyouvibe result — stat blob, archetype, narrative. Anonymous, no FK to users, runs as a separate funnel product.

**Anti-fluff.** The editorial principle that every output must sound like a developer thinking out loud, never like an AI explaining what a developer did. Enforced through banned vocabulary in prompts and quality audits.

**Agent hours vs human hours.** Two different durations. Human hours merge overlapping active intervals across concurrent sessions (one person, one chair, one span of attention). Agent hours sum naively across all sessions. Three parallel agents working for one hour = 1 human hour, 3 agent hours. The ratio shows leverage.

**Published vs listed vs unlisted.** Three states for projects and sessions. Published-but-unlisted means link-only access; published-and-listed means it appears on the portfolio. Draft is owner-only.

**First-class vs derived.** First-class objects have their own DB table and lifecycle. Derived objects are projections of first-class data, materialized at render time. Projects are first-class. Portfolios are first-class in the user's mind, derived in storage.

**Draft-with-changes.** The portfolio state where the active target was previously published but the current profile hash no longer matches the stored hash. Detected via `sha256(sortedJson(profile))`. Surfaced as the amber dot in the status bar with a "View changes" popover for field-by-field diffs.

**The sentence that ends every internal product debate.** *If it sounds like a blog post, it's wrong. If it sounds like a dev thinking out loud, it's right.* Everything else is implementation detail.
