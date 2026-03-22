# Screen Specs — Project-First Upload

All screens live in `mockups/interactive-flow.html`. Open in browser, use the nav tabs to navigate. Line numbers reference the HTML source.

---

## CLI Happy Path

These are the screens a user walks through to upload a project. Build in this order.

---

### Screen 1: Empty State (line 851)

**Nav:** CLI Happy Path → Empty

**What it shows:** No sessions found. Prompts user to start a Claude Code session. Settings gear icon in topbar.

**When shown:** First launch, no `~/.claude/projects/` directory or empty.

**Component:** `ProjectDashboard.tsx` (empty state branch)

**State needed:** `projects: []` from `GET /api/projects`

**Transitions:**
- Settings gear → Screen 4

---

### Screen 2: Project Dashboard (line 884)

**Nav:** CLI Happy Path → Projects

**What it shows:** Project cards with stats (sessions, time, LOC, files), skills chips, "Upload" button per project. Bottom link: "Browse individual sessions." No sidebar, no session list — projects are the primary unit.

**When shown:** User has at least one project with sessions.

**Component:** `ProjectDashboard.tsx`

**State needed:**
- `projects: ProjectInfo[]` from `GET /api/projects` — needs `totalLoc`, `totalDuration`, `totalFiles`, `skills` (requires session stats cache from Phase 1)

**Transitions:**
- "Upload →" button → Screen 43 (`/project/:dirName/upload`)
- Settings gear → Screen 4

**Key detail:** Each project card has a colored dot, project name as `h3`, 2-line description (first session's `dev_take` or auto-generated), 4-column stat grid, skills row.

---

### Screen 43: Project Upload — Session Overview (line 3822)

**Nav:** CLI Happy Path → Upload

**What it shows:** Full session list for the selected project in a scrollable table (session name, time, LOC, turns). Project summary stats at top (4 cards). "Let AI pick sessions" CTA.

**When shown:** User clicked "Upload" on a project card.

**Component:** `ProjectUploadFlow.tsx` — step `overview`

**State needed:**
- `project: ProjectInfo` — the selected project
- `sessionStats: SessionMetaWithStats[]` — all sessions with cached stats

**Transitions:**
- "Let AI pick sessions →" → triggers triage API call, then Screen 44
- "Cancel" → back to Screen 2

---

### Screen 44: AI Triage — Session Selection (line 3902)

**Nav:** CLI Happy Path → Triage

**What it shows:** AI's selection with override controls. Selected sessions (checked, green border, significance tags). Skipped sessions in collapsible `<details>` (unchecked, grey, skip reason chips like "Too small", "Mechanical"). Phase bar (2 of 6 filled).

**When shown:** Triage API returns results.

**Component:** `ProjectUploadFlow.tsx` — step `triage`

**State needed:**
- `triageResult: TriageResult` — from `POST /api/projects/:dirName/triage`
- `selectedSessions: Set<string>` — initialized from triage, user can toggle

**Transitions:**
- Checkbox toggle → updates `selectedSessions`
- "Enhance project →" → triggers enhance API call, then Screen 45
- "Back" → Screen 43

**Key detail:** Each selected session has a green tag explaining WHY it was selected ("Key decision: full rewrite over patch", "Cryptographic integrity layer", "Data visualization from scratch"). Each skipped session has a grey tag explaining WHY it was skipped ("Too small", "Mechanical", "Minor fix").

---

### Screen 45: Project Enhance — AI Building Narrative (line 4020)

**Nav:** CLI Happy Path → Enhance

**What it shows:** Split panel. Left: dark terminal-style session processing feed with checkmarks, spinner, and pending indicators. Right: draft project narrative streaming in — project name, description, skills, timeline periods appearing progressively. Phase bar (3 of 6 filled).

**When shown:** User confirmed session selection.

**Component:** `ProjectUploadFlow.tsx` — step `enhance`

**State needed:**
- `selectedSessions` — which sessions to enhance
- SSE stream from `POST /api/projects/:dirName/enhance-project`
- Progressive updates to `enhanceResult: ProjectEnhanceResult`

**Transitions:**
- "Answer a few questions →" → Screen 48 (when enhance completes)

**Key detail:** Left panel shows per-session progress (checkmark = done, spinner = in progress, greyed = pending). Bottom of left panel shows "PROJECT NARRATIVE" with blinking dot while generating. Right panel progressively reveals the narrative, skills, and timeline as they stream in.

---

### Screen 48: Questions — Context-Aware (line 4152)

**Nav:** CLI Happy Path → Questions

**What it shows:** 2-3 AI-generated questions with category tags ("Pattern detected", "Architecture", "Evolution"). Each question has a textarea for the user's answer. Questions are specific to patterns the AI found in the sessions. Phase bar (4 of 6 filled).

**When shown:** After enhance completes.

**Component:** `ProjectUploadFlow.tsx` — step `questions`

**State needed:**
- `enhanceResult.questions: Array<{ id, category, question, context }>` — from enhance step
- `questionAnswers: Map<string, string>` — user's typed answers

**Transitions:**
- "Skip questions" → Screen 46 (draft narrative used as-is)
- "Weave into narrative →" → triggers `POST /api/projects/:dirName/refine-narrative`, then Screen 46 with updated narrative

**Key detail:** Questions are NOT generic. They reference specific things the AI found:
- "You overrode the AI's suggestion 4 times..." (high correction count detected)
- "You spent 52 minutes on Ed25519 sealing..." (longest single-agent session)
- "The auth rewrite and sealing sessions share zero files..." (zero file overlap detected)

Each question has a colored category tag. Textareas have contextual placeholder text. All questions are optional — user can skip any or all.

**Two-pass narrative:** If user answers and clicks "Weave into narrative", a second LLM call takes the draft narrative + answers and produces a refined narrative that sounds like the dev's voice, not AI slop.

---

### Screen 46: Project Timeline (line 4221)

**Nav:** CLI Happy Path → Timeline

**What it shows:** Vertical timeline grouped by time period ("Week 1 — Foundation", "Week 2 — Security & Identity"). Featured sessions as expanded cards with title, description, duration tag, and optional "KEY DECISION" badge. Small/skipped sessions collapsed as "N smaller sessions — setup, deps, config". Phase bar (5 of 6 filled).

**When shown:** After questions step (or skip).

**Component:** `ProjectUploadFlow.tsx` — step `timeline`

**State needed:**
- `enhanceResult.timeline` (or `finalNarrative` if refined)
- Timeline data: `Array<{ period, label, sessions[] }>` where each session has `featured: boolean`

**Transitions:**
- "Review & publish →" → Screen 47
- "Back" → Screen 48

**Key detail:** The timeline period headers ("Week 1 — Foundation") ARE the project arc — there is no separate arc section. Featured sessions have a large colored dot on the timeline spine; collapsed groups have a small grey dot. Featured session cards are clickable (preview the session). The auth rewrite session has a tertiary-colored (orange) dot and border to highlight it as a key decision.

---

### Screen 47: Review — Final Before Publish (line 4372)

**Nav:** CLI Happy Path → Review

**What it shows:** Project card preview (title, narrative, stats grid, skills). "What gets published" checklist. Project details section (all optional): repository URL (auto-detected, editable), project URL (manual), screenshot upload (drag-and-drop). "Publish project" CTA.

**When shown:** User reviewed the timeline.

**Component:** `ProjectUploadFlow.tsx` — step `review`

**State needed:**
- `enhanceResult` or `finalNarrative` — the narrative to publish
- `selectedSessions` — count for display
- `repoUrl: string` — from `GET /api/projects/:dirName/git-remote`, editable
- `projectUrl: string` — manual entry
- `screenshotPath: string | null` — local file from upload

**Transitions:**
- "Publish project →" → triggers two-step publish, shows publishing progress, then Screen 12
- "Back to timeline" → Screen 46

**Key detail:** The repo URL field shows "auto-detected" badge if it was populated from git remote. The screenshot upload is a dashed-border drop zone. All three project detail fields are optional. The "What gets published" checklist shows exactly what will be sent to the server.

---

### Screen 12: Success (line 1602)

**Nav:** CLI Happy Path → Success

**What it shows:** "Project Published" confirmation. Project card preview with title, narrative snippet, and stats. Project URL (`heyi.am/ben/heyi-am`) with copy button. Two buttons: "View Project Page" and "View Portfolio".

**When shown:** All sessions published successfully.

**Component:** `ProjectUploadFlow.tsx` — step `done`

**State needed:**
- `projectPageUrl` — from publish response
- Project stats for the preview card

**Transitions:**
- "View Project Page" → opens browser to project URL
- "View Portfolio" → opens browser to portfolio URL

---

## CLI Edge Cases

### Screen 4: Settings (line 1135)

Anthropic API key management. Status indicators for connection, auth, and key.

### Screen 5: No API Key (line 1182)

Shown when user tries to enhance without an API key. Two options: "Go to Settings" or "Upload without AI" (publishes with basic metadata, no narrative).

### Screen 10: Auth Prompt (line 1542)

Device auth flow — shown when user tries to publish without being authenticated.

---

## Public Pages (Phoenix-rendered)

### Screen 24: Portfolio (line 2427)

**What it shows:** User profile hero (name, bio, location, skills). AI Collaboration Profile bars. Project cards (narrative, stats, skills — NOT individual sessions). Sidebar: project links, recent activity.

**Phoenix template:** `portfolio_html/show.html.heex`

**Data source:** `projects` table (query by user_id)

**Key detail:** Portfolio is a project index, not a session index. Each project card shows narrative, 4-column stat grid ("21 sessions (8 published)"), and skills. Clicking a card goes to the project page.

---

### Screen 25: Project Detail (line 2533)

**What it shows:** Breadcrumb (ben / heyi-am). Title with repo link + project link. Narrative (border-left accent). Developer's take (if present). Skills row. Screenshot (if present). Hero stats (4 cards). Agent activity SVG (per-session fork/join timelines). Project timeline (vertical, period headers, featured + collapsed sessions). Growth chart (SVG). Directory heatmap. Top files.

**Phoenix template:** `portfolio_html/project.html.heex`

**Data source:** `projects` table for narrative/stats/timeline; `shares` table (where `project_id = project.id`) for growth chart, heatmap, top files, and individual session links.

**Key detail:** Featured sessions in the timeline link to `/:username/:project/:session-slug`. Agent activity section shows which sessions were orchestrated (fork/join SVG) vs single-agent (simple line), with summary stats: "3 of 8 orchestrated", "4 unique roles", "3.2k of 8.4k agent LOC".

---

### Screen 23: Session Case Study (line 2131)

**What it shows:** Two-column layout. Left: title, dev take, stats, Q&A pairs, highlights. Right sidebar: execution path, raw log preview, source info. Below: agent timeline SVG (fork/join for orchestrated, simple line for single-agent), tool breakdown bars, turn timeline (collapsible), files changed (collapsible), full narrative (collapsible).

**Phoenix template:** `share_html/show.html.heex`

**Data source:** `shares` table (single share by token or by project+slug)

**URL:** Both `/:username/:project/:session-slug` and `/s/:token` resolve here. The friendly URL shows breadcrumbs; the `/s/` URL is for sharing.

**Key detail:** The agent timeline SVG is inline (not collapsible). It shows the fork/join pattern with colored lanes per agent role, labeled with agent name + LOC. For single-agent sessions, it shows a simple line with activity tick marks. The "View full transcript →" link goes to Screen 26.

---

### Screen 26: Transcript (line 2912)

Full turn-by-turn raw transcript. Accessed via "View full transcript →" from Screen 23. Shows every user prompt, AI response, and tool call with timestamps.

---

### Screen 27: Sealed Verification (line 2993)

Ed25519 signature verification page. Shows content hash, signature status, and verification result.
