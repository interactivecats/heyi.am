# Portfolio Workspace: UX Design

> Supersedes `PORTFOLIO_PREVIEW_PRD.md` as the canonical source for portfolio surfaces in the CLI. The old doc described a preview route bolted onto the Projects page. This doc describes the real thing.

## The Core Insight

A portfolio is not a page. It is **a static site the developer owns**, that happens to have several valid destinations. The current UX treats the portfolio as a hosted artifact on heyi.am that the user can peek at through a debug tunnel. That framing is wrong and it is the reason the founder called the UX terrible. The portfolio is the product. Hosting is a delivery mechanism. The CLI is where the thing is made, previewed, and shipped — and "shipped" can mean a folder, a GitHub repo, an S3 bucket, or heyi.am. All of those are peers.

Everything below follows from that reframing.

---

## 1. Who is actually using this

**Maya, the side-project shipper.** Friday morning. She just wrapped a weekend thing — four sessions' worth of interesting work on a CLI she built for parsing GPX files. A recruiter pinged her on LinkedIn Thursday night and she said "let me send you something." She has until end-of-day. She does not want to learn a publishing system. She wants to open the CLI, pick a template that makes her work look sharp, confirm her bio isn't embarrassing, hit publish, copy a URL, paste it in the reply. Total budget: fifteen minutes. What she needs to feel: that the preview she sees is exactly what the recruiter will see, that the URL is stable, and that nothing in the flow makes her second-guess a decision she already made. If the app interrupts her with a template gallery she has to browse, or a publish wizard with four steps and a checklist, she bounces and sends a GitHub link instead. We lose.

**Devon, the indie dev with opinions.** Has run the CLI for three months. Does not trust hosted services on principle — his blog is on a Hetzner box he SSHes into, his dotfiles are on sourcehut, he thinks GitHub Pages is fine but prefers Cloudflare Pages. He wants heyi.am because the session rendering is genuinely good, but he will not let it own his URL. What Devon needs: a first-class "Export to folder" target that produces a real, inspectable, diffable directory he can `rsync` anywhere. He needs to see that heyi.am hosting is one option in a list of three, not the default with escape hatches. If export feels like a second-class feature — a button in a dropdown, a modal buried under Settings — he will conclude the local-first positioning is marketing and walk. The moment that wins Devon is seeing "Export to folder" as a top-level target on the publish bar, with the same visual weight as "heyi.am" and "GitHub Pages." That is a design decision disguised as a layout decision.

**Priya, the career-switcher with one project.** Bootcamp graduate, mid-transition, has exactly one real project and five sessions she's proud of. She is terrified of the blank slate. She opens the CLI, sees the Portfolio workspace, and the preview is already populated with her project — because the portfolio is derived from projects she's already listed, and she listed one yesterday. What she needs to feel at this moment: that the portfolio already exists and her job is to refine it, not build it. If the first thing she sees is an empty-state illustration and a "Create Your Portfolio" button, she's been dropped back at step zero of a process she thought she'd started. The design has to meet her where she already is.

---

## 2. Information architecture

The CLI sidebar has **five top-level destinations**, in this order:

1. **Dashboard** — the orientation surface. Current `/` view, unchanged in role: hero, stat cards, action row, recent projects grid, feature callouts. This is the post-onboarding landing page and the place users come back to when they want to see their data state at a glance and pick what to do next. Portfolio is something users navigate *into* from here, not a place they're dropped.
2. **Projects** — the list of projects grouped by project, unchanged in role, cleaned of the "My Portfolio" link that currently lives at its top-right.
3. **Portfolio** — new, first-class. This is where the user lives when thinking about the public-facing artifact.
4. **Sessions** — the existing cross-project chronological/searchable session browser, the home for the local SQLite session index and the local session detail viewer. **Untouched by this work** — it keeps working exactly as it does today. Sessions is a different cut of the same data (flat chronological across all projects), not a child of Projects.
5. **Settings** — shrunk back to actual app config: daemon, parser, data locations, auth tokens (see §4 for token storage), telemetry toggle. The profile editor leaves Settings entirely.

Plus a global **⌘K command palette** in the AppShell top bar (right side, mono pill), available from every destination. It's *added* as a global affordance, not as a replacement for the Sessions surface.

The Template Browser stops being a route. `/templates` is deleted. It becomes a modal invoked from one place: the Portfolio workspace, via a "Change template" button in the edit rail. This is a reduction in surface area, not a loss; the current standalone page has no context and therefore no purpose.

The Preview route (`/preview/portfolio`) stops being a user-visible feature. It continues to exist as the iframe source that the Portfolio workspace embeds, but no human navigates to it directly and the Projects page no longer links to it.

Export lives inside the Portfolio workspace, on the publish bar, as a target. There is no separate "Export" nav item and no `/export` route. Publishing and exporting are the same action with different destinations.

---

## 3. The Portfolio workspace

This is the central surface. It replaces every current portfolio-adjacent screen and it is the thing Maya, Devon, and Priya all land on.

**Layout.** Three regions. A status bar pinned to the top, 56px tall. A live preview pane taking the left 60% of the remaining viewport. An edit rail taking the right 40%, scrollable independently, with a hard max width of 480px (on ultrawide monitors, the preview pane grows and the rail caps). No tabs. No nested routes. Everything a user does to their portfolio happens on this one screen.

**The status bar.** Left side: the active publish target as a pill — icon, name ("heyi.am", "GitHub Pages", "Folder: ~/sites/portfolio"), small chevron to switch targets. Center: state indicator — a colored dot and a short phrase. The phrase is the load-bearing copy: "Published, in sync" (green), "Draft — 3 changes since last publish" (amber), "Never published to this target" (neutral gray), "Last publish failed — click to retry" (red). Right side: the primary action button, label changes with state. "Publish to heyi.am", "Re-publish (3 changes)", "Export to folder", "Retry publish". One primary action, visually dominant, full-height of the bar minus 8px padding. Keyboard shortcut ⌘↵ always fires whatever the current primary action is.

**The preview pane.** Iframe sourced from the internal render pipeline in `cli/src/routes/preview.ts`, no chrome, no URL bar, no scrollbar on the iframe itself — the outer pane scrolls. A small segmented control at the top of the pane with three options: Landing, Project, Session. Clicking Project shows a dropdown of real projects; Session shows a dropdown of real sessions within the selected project. The preview pane is not a browser. It is a mirror. It always shows real data, never mock. Re-renders are debounced 300ms after any edit in the rail; during re-render the pane dims to 70% opacity with no spinner (spinners at this latency feel worse than silence). Scroll position is preserved across re-renders within the same page.

**The edit rail.** Grouped sections, each collapsible, in this order: **Identity** (name, handle, bio — open by default), **Contact** (email, location, links — collapsed), **Photo & resume** (collapsed), **Projects on portfolio** (the list of projects and their order — open by default), **Template** (current template name, thumbnail, "Change template" button that opens the modal — collapsed), **Accent color** (5 preset swatches from the phase 6 decision). No "Save" button anywhere. Changes commit on blur for text fields, on selection for everything else. The status bar dot flips to amber the instant a change is committed to the draft.

**States the workspace must represent clearly:**

*Empty / first-run.* Priya's state. The preview pane is not empty — it shows her actual landing page with whatever projects she's listed, using the default template. The edit rail has a single gentle nudge at the top: "Add a bio so visitors know who they're reading." No illustrations, no "Get started" walkthrough, no modal. The status bar says "Never published" and the primary action says "Publish to heyi.am" (the default target for first-time users, overridable once they know what they want).

*Draft with unpublished changes.* Amber dot, copy reads "Draft — 3 changes since last publish to heyi.am", primary button reads "Re-publish to heyi.am". A subtle "View changes" text link sits next to the dot and opens a small popover listing the specific diffs ("Bio edited", "Project 'gpx-cli' added", "Template changed to Blueprint"). This popover is the only place diff information lives. It is not a full diff viewer; it is a receipt.

*Published, clean.* Green dot, "Published to heyi.am · 2m ago". Primary button changes to "View live" and opens the real URL in the default browser. This is a deliberate demotion of the publish button — when there's nothing to publish, the primary action is to go look at what you shipped. This is the Maya moment. She hit publish, saw the green dot, clicked "View live", copied the URL from her browser, pasted it to the recruiter. Five seconds from confirmation to shareable link.

*Published with divergence.* Same as draft-with-changes, but the diff receipt includes a "since last publish to heyi.am on Apr 2" timestamp, so the user understands the divergence is from a specific point in time.

*Multi-target mixed state.* This is the interesting one. User has published to heyi.am yesterday, exported to a folder last week, never touched GitHub Pages. The status bar shows whichever target is currently selected, but below the target pill (and only when the user hovers or clicks it) a small dropdown reveals all three targets with per-target dots: heyi.am green, Folder amber (draft diverged from last export), GitHub Pages gray (never published). Switching the active target switches the entire status bar context. The primary action is always about the currently active target. We do not try to show three publish buttons at once.

---

## 4. The publish flow with multiple targets

The founder cares most about this section so it gets the most ink.

**First-time target selection.** The first time a user clicks anything in the publish bar on a fresh install, they see a target picker — a sheet that slides down from the status bar, not a modal, not a new route. Three cards, equal size, equal visual weight: **Export to folder** ("A self-contained static site you can host anywhere. Files land on disk, you decide what happens next."), **Publish to heyi.am** ("Hosted on heyi.am under your handle. One click, shareable URL, no config."), **Publish to GitHub Pages** ("Commits to a GitHub repo and serves from Pages. Requires a one-time GitHub connection."). The order is deliberate. Export is first because the local-first bet demands it. heyi.am is second because it is the shortest path for Maya. GitHub Pages is third because it requires setup.

The three cards are not a wizard. Picking one configures that target and makes it the active target in the status bar. The user can add more targets later from the same target pill dropdown, which grows a "+ Add target" row.

**Target-specific config, without a wizard.** Config for a target is collected inline in the target card the first time it is chosen, then stored and never asked again unless the user edits it. For **Export**: one field, the output directory, with a native folder picker button. For **heyi.am**: handle (prefilled from profile), optional custom domain (collapsed behind a disclosure). For **GitHub Pages**: "Connect GitHub" button that kicks OAuth, then repo name (with an auto-suggest based on handle), then branch (defaults to `gh-pages`), then optional CNAME. All of these fields render in the sheet, not a new screen. If the sheet gets taller than ~500px, it scrolls internally. No multi-step next/back navigation.

**Credentials storage.** GitHub OAuth tokens are stored in the OS keychain (Keychain on macOS, libsecret on Linux, Credential Manager on Windows) via `keytar` or equivalent. They are never written to `~/.heyiam/config.json` in plaintext. A "Connected accounts" section in Settings lists connected providers with a disconnect button. This is the *only* reason credentials appear in Settings; they are not configured from Settings, they are managed there after being created inline during publish setup.

**Communicating that all three targets produce the same artifact.** Language is the lever. Every target uses the same verb architecture: each target has a "Publish" action (even Export, even though it writes to disk — calling it "Export" as the verb cleaves it off from the other targets and implies it's different). The card copy, status bar copy, and diff receipts all use "publish" uniformly. The target pill visually shows *where*, the verb consistently shows *what*. A small line of secondary text under the active target in the status bar reads "Same portfolio, different destination" on hover. (Yes, tooltips are doing work here; this is one of the moments it's worth it.)

**Post-publish moments.** Each target gets its own, and they are different on purpose. **Export** opens the output folder in Finder/Explorer and shows a toast in the CLI: "Exported 47 files to ~/sites/portfolio. [Reveal in Finder]". **heyi.am** does not open a browser automatically — it flips the status bar to green and changes the primary button to "View live". This is counterintuitive and correct; auto-opening a browser yanks the user out of the app, and Maya wants to decide when she leaves. **GitHub Pages** shows the commit SHA and a "View commit" link in a toast, plus "Pages builds in ~30s" as a status sublabel; the green dot waits until the Pages build succeeds (polled). If polling fails or times out, the dot stays amber with "Pushed, Pages build unknown" — we never lie about state.

**Re-publish semantics.** Every target does a clean re-render from current data on every publish. We do not do incremental publishes in v1. This is a conscious choice: incremental publishes introduce a state diff problem the user has to understand, and the only win is speed on a render pipeline that already takes under two seconds. When the render pipeline gets slow enough to matter, revisit. Not now.

---

## 5. The Template Browser as a modal

The standalone `/templates` page in `TemplateBrowser.tsx` becomes a modal invoked from the Portfolio workspace edit rail. Full-viewport modal with a close affordance top-right, not a centered card — 27 templates need room to breathe. Two-column layout inside the modal: left is a filterable grid of template cards (3 across, each card shows a wireframe thumbnail and template name, no marketing copy), right is a large live preview of the currently hovered-or-selected template. A toggle above the preview: "Mock data" (default, on) / "My data" (off by default). Mock data is honest here because it shows the template's *capacity* — a Priya with one project should still be able to evaluate a template designed to showcase twelve.

**Selection commits back to the workspace.** A "Use this template" button in the preview pane's footer is the only commit path. It closes the modal and updates the Portfolio workspace's Template section in the edit rail. The status bar flips to amber. No intermediate confirmation. The user's previous template is not destroyed — an "Undo" toast sits in the workspace for 15 seconds after the modal closes.

**When a template breaks on real data.** This is the Priya problem. She picks a template designed for 5+ projects and she has 1. Solution: when "My data" is toggled on and the data underfills the template, the preview renders the template honestly (with gaps, short lists, blank sections) and a non-blocking banner at the top of the preview reads "This template expects at least 5 projects. You have 1. It will look sparse until you add more." No hiding, no fallback to mock. The user has to be able to see the truth to make a real decision. The "Use this template" button is not disabled — we do not paternalize.

**27 templates without a scroll graveyard.** The grid has a persistent filter strip above it: density (minimal / balanced / dense), tone (serious / playful / neutral), layout (single-column / multi-column / sidebar). Three filters, each a segmented control, each with an "all" option. No search box — search implies the user knows what they want, and template browsing is by definition a browsing activity. Filters reduce 27 to 6-9 in most combinations, which is the right number for a decision.

---

## 6. Moments of truth

**The first paint of the Portfolio workspace.** Success: within 200ms of clicking Portfolio in the sidebar, the preview pane shows the real landing page with real data, the edit rail is populated, and the status bar has resolved to a real state (not "Loading…"). Failure: a flash of empty state, a spinner in the preview pane, a status bar that says "Checking…" and then resolves. Implementation: the portfolio render and state check must happen during sidebar click, not after route mount. Preload on hover if necessary. If the render is genuinely slow, show the preview pane with the previous render's cached HTML, dimmed, rather than blank.

**The transition from draft to published.** Success: user clicks the primary button, the button shows an inline progress state (the button itself fills left-to-right with a subtle darker shade, no spinner, no modal), 1-3 seconds later the button label changes to "View live" and the status bar dot flips green. Focus stays on the button. No celebration, no confetti, no toast announcing success — the state change *is* the confirmation. Failure: a modal pops up, or the page navigates away, or a toast appears saying "Success!" while the button is still in its old state, creating two conflicting signals. Implementation detail that makes or breaks it: the state transition in the status bar must be driven by the same event that unlocks the button, not a separate re-fetch. Race conditions here feel like bugs.

**The preview re-render on edit.** Success: user types in the bio field, stops, 300ms later the preview pane updates in place with scroll position preserved. Failure: preview jumps to top, flashes white, or updates on every keystroke. Implementation: 300ms debounce, postMessage-based scroll preservation between the outer pane and the iframe, no full reload — a render-and-swap of the iframe's document content.

**The target switch.** Success: user clicks the target pill, sees all three targets with their individual states in a dropdown, picks GitHub Pages, the status bar updates in under 50ms to reflect the GitHub Pages state, the primary button relabels. Failure: the workspace re-mounts, the preview pane reloads, the user loses scroll position in the preview. Implementation: target state lives in a single store, the workspace reads from it reactively, target switching updates a single field.

**The first-time publish to a new target.** Success: user adds GitHub Pages, connects their account, picks a repo, hits publish, the sheet closes, the status bar shows the publish in progress, 30 seconds later the dot goes green. They never saw more than two screens (the target picker sheet and the workspace itself). Failure: a 4-step wizard, a "configuration saved" screen, a "you're ready to publish!" screen, and then the actual publish as a separate action. Implementation: the "Connect and publish" button in the target picker sheet does both — OAuth, config save, and initial publish — in one chain, with a single progress affordance.

**The export-to-folder reveal.** Success: user picks Export, picks a folder, clicks publish, the CLI writes the files, opens Finder at that path, and shows a toast with a "Reveal in Finder" link for users who missed the auto-open. The folder contents are obviously a real static site — `index.html`, `assets/`, `projects/`, human-readable directory names. Failure: a zip file, an opaque bundle, a "click here to download" link, or a folder full of hashed filenames. Implementation: the export writes files with the same layout the Phoenix server would serve, so a user who inspects the folder sees exactly what a hosted version would look like. This is the trust moment for Devon.

---

## 7. Anti-patterns in the current design

`Projects.tsx` links "My Portfolio" to `/preview/portfolio` in a new tab. This is a debug tunnel pretending to be a feature. Replaced by: Portfolio as a sidebar destination, preview as an embedded iframe inside it.

`Settings.tsx` owns the profile editor (bio, photo, email, location, links, resume) with no preview and no feedback beyond a "saved" chip. This conflates app config with portfolio content. Replaced by: the edit rail in the Portfolio workspace. Settings returns to being about the app.

`TemplateBrowser.tsx` lives at `/templates` as a standalone page. It has no context for what the user is templating — they picked a template, then what? Replaced by: a modal invoked from the Portfolio workspace, committing back to the workspace on selection.

`PublishReview.tsx` is a per-project publish wizard. This made sense when projects were the only publishable unit. With portfolio as a first-class object, publish is an action on the portfolio workspace, and the project-level flow becomes "add to portfolio, then publish the portfolio." The per-project publish route should be deleted, not maintained in parallel.

`cli/src/routes/publish.ts` never uploads the portfolio landing page itself — only individual projects. The backend model assumes projects are atoms. The new model: a publish is a complete render of the portfolio (landing + all listed projects + all visible sessions + assets), and every target receives the full artifact. The server-side handler needs to reflect this; individual project publish is a special case (a filter) of a full portfolio publish, not the normal path.

---

## 8. What this UX actively rejects

**No celebration modal on publish.** Wrong tone for a tool that wants to feel like a professional instrument. The state change is the reward.

**No separate `/publish` wizard route.** Publish is an action on the Portfolio workspace. Giving it its own route implies it's a destination you travel to, which implies it's rare and effortful. It should feel cheap and local.

**No "Preview" button separate from the live preview pane.** The preview is always visible. A button that opens a preview implies the visible one is fake. It isn't.

**No mock data in the Portfolio workspace itself.** Mock data belongs in the Template Browser modal, where the user is evaluating a template's capacity. In the workspace, the preview must always be real data, even if it's sparse. Priya has to see the truth of her portfolio.

**No per-target feature differentiation.** We do not offer "extras" on heyi.am that export cannot produce. The moment heyi.am has capabilities the folder export doesn't, the local-first positioning becomes a lie. Every target produces the same artifact. Period.

**No auto-publish on edit.** Every edit updates the preview; only the user hits publish. Autosave to draft, manual publish to targets. The line between "I'm editing" and "I'm shipping" must stay crisp.

---

## 9. Open questions for the founder

**What does `/:username` show on heyi.am before a user's first publish?** Recommendation: a 404, not a placeholder. A placeholder "This developer hasn't published yet" page is an invitation to awkwardness — it leaks the existence of an account that the user hasn't chosen to make public. Tradeoff: 404 means a link shared prematurely looks broken, but that's the user's mistake and the fix is "publish." A placeholder makes every un-published account a mild privacy leak. Lean toward 404.

**How are projects ordered on the portfolio — auto by recency, or user-curated?** Recommendation: user-curated with recency as the initial order. The edit rail's "Projects on portfolio" section supports drag-to-reorder. New projects get added to the top. Tradeoff: auto-by-recency is zero-effort but produces bad portfolios (the latest thing isn't always the best thing). Manual curation is the right default for a portfolio product; we are not a blog.

**Does "Export to folder" remember the last folder or prompt every time?** Recommendation: remember per-target. Each Export target is a named, configured thing with a bound folder; re-publishing to it never re-prompts. Users who want two different folders create two Export targets. Tradeoff: conceptually heavier (Export is a target you configure, not a fleeting action) but consistent with how heyi.am and GitHub Pages work, and consistency is worth more than one saved click.

**Do we support custom domains on heyi.am in v1?** Recommendation: yes, as a collapsed field in the heyi.am target config, because Devon will ask for it on day one. Implementation can be stubbed if backend isn't ready — the UI collects the value and stores it, backend enforces when available. Tradeoff: UI promises a feature the backend may not support yet; mitigate with a "DNS configuration required" helper state.

**What happens when a user's GitHub token expires mid-publish?** Recommendation: the publish fails with a targeted error ("GitHub token expired — reconnect to publish") and a "Reconnect" button inline in the error state that kicks re-auth and retries the publish on success. Do not silently fail. Do not dump the user into Settings. Tradeoff: extra engineering for graceful re-auth, but this is the exact moment that decides whether Devon trusts us with his repo.

**Does the Portfolio workspace support multiple portfolios per user (e.g., one for job hunting, one for client work)?** Recommendation: no in v1. One portfolio per user. The flexibility belongs in *what projects are listed on the portfolio*, not in *how many portfolios exist*. Tradeoff: power users will want this; tell them to wait. Shipping one good portfolio surface beats shipping two confused ones.

**Where does the "unlisted" / "shareable link" state live?** Current data model supports it (see `project_publish_states.md`) but this design doesn't surface it. Recommendation: a per-target visibility toggle in the target config (heyi.am gets "Public / Unlisted" as a radio; export and GitHub Pages don't have this concept). Tradeoff: introduces a target-specific option, which slightly dents the "all targets are equal" framing, but unlisted is a real need for job-hunting scenarios and the alternative is worse.
