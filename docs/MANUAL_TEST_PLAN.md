# heyi.am -- Manual Test Plan

> **Prerequisites**
> 1. Start the backend: `docker compose -f docker-compose.dev.yml up -d` (Phoenix + Postgres + SeaweedFS)
> 2. Start the CLI: `cd cli && HEYIAM_API_URL=http://localhost:4000 npm run dev`
> 3. Have at least one Claude Code project with sessions in `~/.claude/projects/`
> 4. Open the dev mailbox at `http://localhost:4000/dev/mailbox` in a separate tab
> 5. Have `curl` or a REST client available for API tests
> 6. Have a second browser or incognito window ready for "another user" tests
> 7. Optional: set `ANTHROPIC_API_KEY` in env for local AI enhancement

---

## 1. Registration & Auth

### 1.1 Register -- email/password
1. Open `http://localhost:4000/users/register`
2. Enter a valid email and password (12+ characters)
3. Click **Register**
4. **Expect:** Redirected to `/onboarding/username`. Flash confirms account created.

### 1.2 Duplicate email
1. Go to `/users/register`, enter the same email
2. **Expect:** Error: "has already been taken"

### 1.3 Short password
1. Enter a new email and password under 12 chars
2. **Expect:** Validation error about minimum password length

### 1.4 Login -- happy path
1. Go to `/users/log-in`, enter credentials from 1.1
2. **Expect:** Logged in, redirected to home or onboarding

### 1.5 Login -- wrong password
1. Enter correct email, wrong password
2. **Expect:** Generic error "Invalid email or password"

### 1.6 Login -- rate limiting
1. Submit 6+ login attempts rapidly
2. **Expect:** After 5 attempts, rate limit kicks in (429 or error message)

### 1.7 GitHub OAuth
1. Go to `/users/log-in`, click "Continue with GitHub"
2. **Expect:** Redirects to GitHub, then back to `/auth/github/callback`. Account created/linked.

### 1.8 Logout
1. Click logout
2. **Expect:** Session destroyed, redirected to home

---

## 2. Onboarding

### 2.1 Claim username -- happy path
1. Log in with a fresh account
2. Land at `/onboarding/username`
3. Type a valid username (3-39 chars, lowercase, hyphens OK)
4. **Expect:** Live availability check shows green/available
5. Submit
6. **Expect:** Redirected to `/:username` portfolio page

### 2.2 Invalid usernames
Try each: `ab` (too short), `UPPERCASE`, `user@name` (special chars), 40+ chars
- **Expect:** Inline validation errors

### 2.3 Taken username
1. Claim username `taken` with one account
2. Try `taken` with another account
3. **Expect:** Shows unavailable

---

## 3. CLI -- Project Dashboard

### 3.1 Project cards
1. Open `http://localhost:17845`
2. **Expect:** Project cards with: name, session count, total time, LOC, files, skills chips, date range
3. Each card has an "Upload" button

### 3.2 Empty state
1. If no Claude Code sessions exist
2. **Expect:** Empty state message prompting to start a session

### 3.3 Settings navigation
1. Click the settings gear icon
2. **Expect:** Navigate to `/settings`

---

## 4. CLI -- Project Upload Flow

### 4.1 Session overview
1. Click "Upload" on a project card
2. **Expect:** Full session list in table (date, time, LOC, turns)
3. Project summary stats at top (4 cards)
4. "Let AI pick sessions" button (or "Enhance all" if < 5 sessions)

### 4.2 AI triage (requires API key or proxy)
1. Click "Let AI pick sessions"
2. **Expect:** Terminal-style progress: loading stats -> hard floor filter -> signal extraction -> LLM ranking -> done
3. **Expect:** Selected sessions with green border + significance tags
4. **Expect:** Skipped sessions in collapsible section with skip reasons ("Too small", "Mechanical")

### 4.3 Triage override
1. Uncheck a selected session
2. Check a skipped session
3. **Expect:** Selection updates, counts change

### 4.4 Small project auto-select
1. Open a project with < 5 sessions
2. **Expect:** All sessions auto-selected, triage step skipped or all selected

### 4.5 Enhance -- session processing
1. Click "Enhance project"
2. **Expect:** Left panel: per-session progress (pending -> enhancing -> done)
3. **Expect:** Sessions enhanced concurrently (up to 3)
4. Already-enhanced sessions show as "skipped" (not re-enhanced)

### 4.6 Enhance -- project narrative
1. After sessions complete, project narrative streams in
2. **Expect:** Right panel shows: project description, skills, arc phases, timeline periods progressively appearing

### 4.7 Questions step
1. After enhance completes, see 2-3 questions
2. **Expect:** Questions reference specific patterns from sessions (not generic)
3. **Expect:** Category tags: "Pattern detected", "Architecture", "Evolution"
4. Answer one question, skip others
5. Click "Weave into narrative"
6. **Expect:** Narrative updates with developer's voice

### 4.8 Skip questions
1. Click "Skip questions" instead
2. **Expect:** Draft narrative used as-is, proceed to timeline

### 4.9 Timeline review
1. **Expect:** Vertical timeline grouped by time period
2. Featured sessions as expanded cards with titles + tags
3. Small sessions collapsed ("N smaller sessions")

### 4.10 Review step
1. **Expect:** Project card preview (narrative, stats, skills)
2. **Expect:** "What gets published" checklist
3. **Expect:** Repository URL field (auto-detected from git remote)
4. Project URL field (manual entry)
5. Screenshot upload zone (optional)

### 4.11 Publish (requires auth)
1. Click "Publish project"
2. **Expect:** Progress: creating project -> uploading sessions (N of M) -> done
3. **Expect:** Success page with project URL + copy button
4. **Expect:** "View Project Page" and "View Portfolio" buttons

### 4.12 Publish -- not authenticated
1. Try to publish without running `heyiam login`
2. **Expect:** Auth prompt / redirect to login flow

---

## 5. CLI -- Settings

### 5.1 API key management
1. Go to `/settings`
2. Enter an Anthropic API key
3. **Expect:** Key saved, masked display
4. Toggle show/hide
5. **Expect:** Key revealed/hidden

### 5.2 Auth status
1. **Expect:** Shows authentication status (connected username or "not connected")

### 5.3 Enhancement mode
1. With API key set: **Expect:** "Using local API key"
2. Without API key: **Expect:** "Not configured" or proxy mode indicator

---

## 6. Public Pages -- Portfolio

### 6.1 Portfolio page
1. Visit `http://localhost:4000/:username`
2. **Expect:** User hero (name, bio, location, skills)
3. **Expect:** AI Collaboration Profile bars (4 dimensions)
4. **Expect:** Project cards (title, narrative, stats, skills)
5. **Expect:** Aggregate metrics at bottom

### 6.2 Non-existent username
1. Visit `/nobody-exists-here`
2. **Expect:** 404 page

### 6.3 Portfolio with no projects
1. Visit portfolio for user with no published projects
2. **Expect:** Empty state (no project cards, terminal install prompt)

---

## 7. Public Pages -- Project Detail

### 7.1 Project page
1. Click a project card on the portfolio
2. **Expect:** Breadcrumb (username / project)
3. **Expect:** Project title + narrative (border-left accent)
4. **Expect:** Skills row, hero stats (time, sessions, LOC, files)
5. **Expect:** Project timeline with featured + collapsed sessions
6. **Expect:** Growth chart (SVG, cumulative LOC)
7. **Expect:** Directory heatmap

### 7.2 Project links
1. If project has repo_url: **Expect:** Repository link visible
2. If project has project_url: **Expect:** Live site link visible

### 7.3 Non-existent project slug
1. Visit `/:username/fake-project`
2. **Expect:** 404 page

### 7.4 Session links in timeline
1. Click a featured session in the project timeline
2. **Expect:** Navigate to `/:username/:project/:session-slug`

---

## 8. Public Pages -- Session Case Study

### 8.1 Session via friendly URL
1. Visit `/:username/:project/:session-slug`
2. **Expect:** Full case study: title, dev take, stats, Q&A, execution path, tool breakdown

### 8.2 Session via token URL
1. Visit `/s/:token`
2. **Expect:** Same session renders (no breadcrumb context)

### 8.3 Template switching
1. Visit `/s/:token?template=terminal`
2. Try each: `editorial`, `terminal`, `minimal`, `brutalist`, `campfire`, `neon-night`
3. **Expect:** Each renders with distinct visual style
4. Try `?template=nonexistent` -- **Expect:** Falls back to editorial

### 8.4 Agent timeline (orchestrated session)
1. View a session that used subagents
2. **Expect:** Fork/join SVG timeline with colored agent lanes
3. **Expect:** Agent contributions table (role, LOC, duration)

### 8.5 "Gone" tokens
1. Visit `/s/deleted`, `/s/expired`, `/s/removed`
2. **Expect:** 410 Gone page

### 8.6 Transcript page
1. Visit `/s/:token/transcript`
2. **Expect:** Turn-by-turn transcript with timestamps

### 8.7 Verification page
1. Visit `/s/:token/verify`
2. **Expect:** Content hash, signature status, verification result

---

## 9. Portfolio Editor (LiveView)

### 9.1 Access as owner
1. Log in, go to `/:username/edit`
2. **Expect:** LiveView editor with profile fields, project list, expertise section

### 9.2 Edit profile
1. Change display name, bio, location, status
2. Save
3. **Expect:** Changes persisted. Visit `/:username` to verify.

### 9.3 Access as non-owner
1. Log in as a different user, go to `/other-user/edit`
2. **Expect:** Blocked (error or redirect)

### 9.4 Access when not logged in
1. Log out, go to `/any-user/edit`
2. **Expect:** Redirected to `/users/log-in`

---

## 10. API -- Project Publish

### 10.1 Create project
```bash
curl -X POST http://localhost:4000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "project": {
      "title": "Test Project",
      "slug": "test-project",
      "narrative": "A test project for manual testing.",
      "skills": ["Elixir", "Phoenix"],
      "total_sessions": 5,
      "total_loc": 1200,
      "total_duration_minutes": 180,
      "total_files_changed": 20,
      "timeline": [],
      "skipped_sessions": []
    }
  }'
```
**Expect:** 201 with `{"project_id": ..., "slug": "test-project"}`

### 10.2 Upsert project (same slug)
1. Repeat 10.1 with updated fields
2. **Expect:** Same project updated, not duplicated

### 10.3 Create project -- no auth
```bash
curl -X POST http://localhost:4000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"project": {"title": "test", "slug": "test"}}'
```
**Expect:** 401 Unauthorized

### 10.4 Publish session with project_id
```bash
curl -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "session": {
      "title": "Test session",
      "dev_take": "Testing the publish flow",
      "duration_minutes": 30,
      "turns": 42,
      "files_changed": 10,
      "loc_changed": 500,
      "template": "editorial",
      "project_id": PROJECT_ID_FROM_10_1
    }
  }'
```
**Expect:** 201 with `{"token": "...", "url": "/s/...", "sealed": false, "content_hash": "...", "upload_urls": {"raw": "...", "log": "..."}}`

### 10.5 Session publish -- no auth
1. Omit Authorization header
2. **Expect:** 401 Unauthorized

### 10.6 Session publish -- wrong project owner
1. Publish session with a project_id owned by a different user
2. **Expect:** Rejected (project ownership verified)

### 10.7 Verify session
```bash
curl http://localhost:4000/api/sessions/TOKEN_HERE/verify
```
**Expect:** JSON with `token`, `content_hash`, `signed`, `verified`, `sealed`

### 10.8 Non-existent token verify
```bash
curl http://localhost:4000/api/sessions/nonexistent/verify
```
**Expect:** 404

### 10.9 API rate limiting
1. Send 31+ requests to `/api/sessions` within a minute
2. **Expect:** 429 after 30 (rate_limit_publish pipeline)

---

## 11. AI Enhancement API

### 11.1 Enhance via proxy (Phoenix)
```bash
curl -X POST http://localhost:4000/api/enhance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "session": {
      "title": "Test",
      "turns": 20,
      "duration_minutes": 30,
      "files_changed": 5,
      "raw_log": ["user: fix the auth", "ai: I will review..."]
    }
  }'
```
**Expect:** 200 with enhanced session data (title, dev_take, beats, skills, etc.)

### 11.2 Enhance -- rate limiting
1. Send 6+ enhance requests in a minute
2. **Expect:** 429 after 5 (rate_limit_enhance pipeline)

### 11.3 Enhance -- no auth
1. Omit Authorization header
2. **Expect:** 401

---

## 12. Device Auth Flow

### 12.1 Request device code
```bash
curl -X POST http://localhost:4000/api/device/code \
  -H "Content-Type: application/json"
```
**Expect:** `{"device_code": "...", "user_code": "...", "verification_uri": "...", "expires_in": 900, "interval": 5}`

### 12.2 Poll before authorization
```bash
curl -X POST http://localhost:4000/api/device/token \
  -H "Content-Type: application/json" \
  -d '{"device_code": "DEVICE_CODE_FROM_12_1"}'
```
**Expect:** 400 with `{"error": "authorization_pending"}`

### 12.3 Complete device auth
1. Open `verification_uri` from 12.1 in browser
2. Log in and authorize
3. Poll again
4. **Expect:** 200 with `{"access_token": "...", "token_type": "Bearer"}`

### 12.4 Poll rate limiting
1. Poll rapidly (more than 5 times per 5 min for same user)
2. **Expect:** Rate limit response

---

## 13. User Settings

### 13.1 Change email
1. Go to `/users/settings`, enter new email + current password
2. **Expect:** Confirmation email sent (check dev mailbox)
3. Click confirmation link
4. **Expect:** Email updated

### 13.2 Change password
1. Enter current password + new password (12+ chars) + confirmation
2. **Expect:** Password changed

### 13.3 Export data
1. Click export link at `/users/settings/export`
2. **Expect:** JSON export of account data

### 13.4 Delete account
1. Follow delete account flow
2. **Expect:** Account, projects, and shares deleted

---

## 14. Security & Edge Cases

### 14.1 CSRF protection
1. Submit any form, check for `_csrf_token` in request
2. **Expect:** CSRF token present and validated

### 14.2 CSP headers
1. Inspect response headers
2. **Expect:** `content-security-policy` with `default-src 'self'` + font/style exceptions

### 14.3 XSS in user fields
1. Set display name to `<script>alert('xss')</script>`
2. Visit portfolio
3. **Expect:** Script tag escaped, not executed

### 14.4 Session fixation
1. Note session cookie before login, log in
2. **Expect:** Cookie changes (new session)

### 14.5 Sealed session immutability
1. Publish a sealed session
2. Try to update it via API
3. **Expect:** Update rejected (sealed sessions are immutable)

---

## 15. Mobile Responsiveness

> Open Chrome DevTools -> toggle device toolbar (Cmd+Shift+M)

### 15.1 Portfolio page -- iPhone SE (375px)
1. Visit `/:username`
2. **Expect:** Content stacks vertically, readable, no horizontal scroll

### 15.2 Project page -- iPhone SE
1. Visit `/:username/:project`
2. **Expect:** Timeline, stats, growth chart all render mobile-friendly

### 15.3 Session case study -- iPhone SE
1. Visit `/s/:token`
2. **Expect:** Two-column layout collapses to single column

### 15.4 Forms -- iPhone SE
1. Visit `/users/register`, `/users/log-in`
2. **Expect:** All inputs full-width, tappable, no overflow

### 15.5 CLI -- iPhone SE
1. Open `localhost:17845` on mobile viewport
2. **Expect:** Project cards stack vertically, upload flow usable

### 15.6 Tablet (768px)
1. Check portfolio + session + project pages
2. **Expect:** Reasonable intermediate layout

---

## 16. End-to-End: Full Project Upload

This test verifies the complete happy path from CLI to public page.

1. Open `http://localhost:17845`
2. See project cards with real Claude Code session data
3. Click "Upload" on a project
4. See session overview with stats
5. Click "Let AI pick sessions" (or "Enhance all" for small projects)
6. Wait for triage to complete, verify selection looks reasonable
7. Optionally override selection (check/uncheck sessions)
8. Click "Enhance project"
9. Watch sessions enhance (left panel) and narrative stream in (right panel)
10. Answer at least one question, click "Weave into narrative"
11. Review the timeline (featured sessions should be the most interesting)
12. On Review step, verify repo URL auto-detected
13. Click "Publish project"
14. Wait for publish to complete
15. Click "View Project Page"
16. **Expect:** Project page at `/:username/:project` shows:
    - Narrative matching what was generated
    - Correct total stats (all sessions, not just published)
    - Timeline with featured sessions clickable
    - Skills row
17. Click a featured session
18. **Expect:** Session case study page renders with full detail
19. Click "View full transcript"
20. **Expect:** Transcript page renders
21. Go back to `/:username` portfolio
22. **Expect:** Project card visible with narrative and stats

---

## Notes

- **API key modes:** Tests in sections 4, 11, and 16 require either `ANTHROPIC_API_KEY` (BYOK) or a configured proxy endpoint with a Gemini/Anthropic key on the Phoenix side. Without either, triage falls back to scoring-only and enhancement is unavailable.
- **Presigned uploads:** Session publish (10.4) returns `upload_urls` with presigned S3 PUT URLs. The CLI uploads raw JSONL and log JSON directly to SeaweedFS. If SeaweedFS is not running, shares still work but transcripts won't be available.
- **SSE streams:** The CLI triage, enhance, and publish endpoints use Server-Sent Events. These can't be tested with plain curl -- use the CLI React UI or an SSE client.
