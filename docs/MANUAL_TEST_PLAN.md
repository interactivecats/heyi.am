# heyi.am -- Manual Test Plan

> **Prerequisites**
> 1. Start the backend: `cd heyi_am_umbrella && mix phx.server` (starts all 3 endpoints + Postgres via docker-compose)
> 2. Start the CLI: `cd cli && HEYIAM_API_URL=http://localhost:4001 npm run dev`
> 3. Have at least one Claude Code project with sessions in `~/.claude/projects/`
> 4. Open the dev mailbox at `http://localhost:4001/dev/mailbox` in a separate tab
> 5. Have `curl` or a REST client available for API tests
> 6. Have a second browser or incognito window ready for "another user" tests
> 7. Optional: set `ANTHROPIC_API_KEY` in env for local AI enhancement

> **Port reference:**
> - `localhost:4000` — public_web (heyi.am) — portfolios, sessions, shares
> - `localhost:4001` — app_web (heyiam.com) — auth, API, settings
> - `localhost:4002` — vibe_web (howdoyouvibe.com) — vibes

---

## 1. Registration & Auth (app_web :4001)

### 1.1 Register -- email/password
1. Open `http://localhost:4001/users/register`
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
1. Go to `http://localhost:4001/users/log-in`, enter credentials from 1.1
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

## 2. Onboarding (app_web :4001)

### 2.1 Claim username -- happy path
1. Log in with a fresh account
2. Land at `/onboarding/username`
3. Type a valid username (3-39 chars, lowercase, hyphens OK)
4. **Expect:** Live availability check shows green/available
5. Submit
6. **Expect:** Username claimed

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

## 6. Public Pages -- Portfolio (public_web :4000)

### 6.1 Portfolio page
1. Visit `http://localhost:4000/:username`
2. **Expect:** Pre-rendered portfolio HTML served from DB
3. **Expect:** Project cards (title, narrative, stats, skills)

### 6.2 Non-existent username
1. Visit `http://localhost:4000/nobody-exists-here`
2. **Expect:** 404 page

### 6.3 Portfolio with no projects
1. Visit portfolio for user with no published projects
2. **Expect:** Empty state

### 6.4 No session cookies
1. Inspect cookies for `localhost:4000`
2. **Expect:** No session cookie set (security invariant)

---

## 7. Public Pages -- Project Detail (public_web :4000)

### 7.1 Project page
1. Visit `http://localhost:4000/:username/:project`
2. **Expect:** Pre-rendered project HTML with narrative, stats, timeline

### 7.2 Non-existent project slug
1. Visit `http://localhost:4000/:username/fake-project`
2. **Expect:** 404 page

---

## 8. Public Pages -- Session Case Study (public_web :4000)

### 8.1 Session via token URL
1. Visit `http://localhost:4000/s/:token`
2. **Expect:** Pre-rendered session case study

### 8.2 Session in project context
1. Visit `http://localhost:4000/:username/:project/:session`
2. **Expect:** Same session with project breadcrumb context

### 8.3 Transcript page
1. Visit `http://localhost:4000/s/:token/transcript`
2. **Expect:** Turn-by-turn transcript

### 8.4 Verification page
1. Visit `http://localhost:4000/s/:token/verify`
2. **Expect:** Content hash, signature status

---

## 9. API -- Project Publish (app_web :4001)

### 9.1 Create project
```bash
curl -X POST http://localhost:4001/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "project": {
      "title": "Test Project",
      "slug": "test-project",
      "narrative": "A test project.",
      "skills": ["Elixir", "Phoenix"],
      "total_sessions": 5,
      "total_loc": 1200,
      "total_duration_minutes": 180,
      "total_files_changed": 20
    }
  }'
```
**Expect:** 201 with `{"project_id": ..., "slug": "test-project"}`

### 9.2 Upsert project (same slug)
1. Repeat 9.1 with updated fields
2. **Expect:** Same project updated, not duplicated

### 9.3 Create project -- no auth
```bash
curl -X POST http://localhost:4001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"project": {"title": "test", "slug": "test"}}'
```
**Expect:** 401 Unauthorized

### 9.4 Publish session with project_id
```bash
curl -X POST http://localhost:4001/api/sessions \
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
      "project_id": "PROJECT_ID_FROM_9_1"
    }
  }'
```
**Expect:** 201 with `{"token": "...", "url": "/s/...", "sealed": false, "content_hash": "...", "upload_urls": {...}}`

### 9.5 Session publish -- no auth
1. Omit Authorization header
2. **Expect:** 401 Unauthorized

### 9.6 Verify session (public, no auth needed)
```bash
curl http://localhost:4001/api/sessions/TOKEN_HERE/verify
```
**Expect:** JSON with `token`, `content_hash`, `signed`, `verified`, `sealed`

### 9.7 API rate limiting
1. Send 31+ requests to `/api/sessions` within a minute
2. **Expect:** 429 after 30

---

## 10. AI Enhancement API (app_web :4001)

### 10.1 Enhance via proxy
```bash
curl -X POST http://localhost:4001/api/enhance \
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
**Expect:** 200 with enhanced session data

### 10.2 Enhance -- rate limiting
1. Send 6+ enhance requests in a minute
2. **Expect:** 429 after 5

### 10.3 Enhance -- no auth
1. Omit Authorization header
2. **Expect:** 401

---

## 11. Device Auth Flow (app_web :4001)

### 11.1 Request device code
```bash
curl -X POST http://localhost:4001/api/device/code \
  -H "Content-Type: application/json"
```
**Expect:** `{"device_code": "...", "user_code": "...", "verification_uri": "...", "expires_in": 900, "interval": 5}`

### 11.2 Poll before authorization
```bash
curl -X POST http://localhost:4001/api/device/token \
  -H "Content-Type: application/json" \
  -d '{"device_code": "DEVICE_CODE_FROM_11_1"}'
```
**Expect:** 400 with `{"error": "authorization_pending"}`

### 11.3 Complete device auth
1. Open `verification_uri` from 11.1 in browser (on :4001)
2. Log in and authorize
3. Poll again
4. **Expect:** 200 with `{"access_token": "...", "token_type": "Bearer"}`

---

## 12. User Settings (app_web :4001)

### 12.1 Change email
1. Go to `http://localhost:4001/users/settings`, enter new email + current password
2. **Expect:** Confirmation email sent (check dev mailbox at :4001/dev/mailbox)
3. Click confirmation link
4. **Expect:** Email updated

### 12.2 Change password
1. Enter current password + new password (12+ chars) + confirmation
2. **Expect:** Password changed

### 12.3 Export data
1. Visit `http://localhost:4001/users/settings/export`
2. **Expect:** JSON export of account data

### 12.4 Delete account
1. Follow delete account flow
2. **Expect:** Account, projects, and shares deleted

---

## 13. Vibe Web (vibe_web :4002)

### 13.1 Vibe landing
1. Visit `http://localhost:4002/`
2. **Expect:** Vibe quiz landing page

### 13.2 Create vibe
1. Complete the quiz
2. **Expect:** Result page at `/:short_id` with archetype

### 13.3 Archetype page
1. Visit `http://localhost:4002/archetypes/:id`
2. **Expect:** Archetype detail page

### 13.4 API -- create vibe
```bash
curl -X POST http://localhost:4002/api/vibes \
  -H "Content-Type: application/json" \
  -d '{"answers": [1,2,3,4,5,1,2,3,4,5]}'
```
**Expect:** 201 with vibe result

### 13.5 Rate limiting
1. Send 6+ create requests in a minute
2. **Expect:** 429 after 5

### 13.6 No session cookies
1. Inspect cookies for `localhost:4002`
2. **Expect:** No session cookie set (security invariant)

---

## 14. Security & Cross-Domain

### 14.1 CSRF on app_web
1. Submit any form on :4001, check for `_csrf_token` in request
2. **Expect:** CSRF token present and validated

### 14.2 No CSRF on public_web
1. Inspect :4000 response headers
2. **Expect:** No CSRF token in HTML (no forms, no sessions)

### 14.3 CSP headers -- public_web
1. Inspect response headers on :4000
2. **Expect:** Strict CSP with `script-src 'self'`

### 14.4 CSP headers -- app_web
1. Inspect response headers on :4001
2. **Expect:** CSP allows analytics script sources

### 14.5 XSS isolation
1. Publish a session with `<script>alert('xss')</script>` in rendered HTML
2. Visit on :4000
3. **Expect:** Script executes (raw HTML), but no session cookies available to steal

---

## 15. End-to-End: Full Project Upload

1. Open `http://localhost:17845` (CLI)
2. Click "Upload" on a project
3. Complete triage + enhance + questions + review
4. Click "Publish project" (CLI posts to :4001 API)
5. Visit `http://localhost:4000/:username` (public_web)
6. **Expect:** Portfolio shows published project
7. Click project, verify page renders
8. Click session, verify case study renders

---

## Notes

- **API key modes:** Tests in sections 4, 10, and 15 require either `ANTHROPIC_API_KEY` (BYOK) or a configured proxy endpoint with a Gemini/Anthropic key on Phoenix.
- **CLI targets app_web:** The CLI sends all API requests to `:4001` (app_web). Set `HEYIAM_API_URL=http://localhost:4001`.
- **SSE streams:** CLI triage, enhance, and publish use Server-Sent Events. Test via the CLI React UI, not curl.
