# heyi.am -- Manual Test Plan

> **Prerequisites**
> 1. Start the dev server: `cd phoenix && mix phx.server` (runs at `http://localhost:4000`)
> 2. Ensure Postgres is running with `heyi_am_dev` database (`mix ecto.setup` if needed)
> 3. Open the dev mailbox at `http://localhost:4000/dev/mailbox` in a separate tab (for email confirmations)
> 4. Have a second browser or incognito window ready for "another user" tests
> 5. Have `curl` or a REST client available for API tests

---

## 1. Registration

### 1.1 Happy path -- email/password
1. Open `http://localhost:4000/users/register`
2. Enter a valid email (e.g. `test@example.com`) and a password (12+ characters)
3. Click **Register**
4. **Expect:** Redirected to `/onboarding/username`. Flash message confirms account created.

### 1.2 Duplicate email
1. Go to `/users/register` again
2. Enter the **same email** you just used with any password
3. Click **Register**
4. **Expect:** Stay on register page. Error: "has already been taken"

### 1.3 Short password
1. Go to `/users/register`
2. Enter a new email and password `short` (under 12 chars)
3. Click **Register**
4. **Expect:** Validation error about minimum password length

### 1.4 Empty fields
1. Go to `/users/register`
2. Submit the form with both fields blank
3. **Expect:** Required field errors on both email and password

### 1.5 Already logged in
1. While logged in, navigate directly to `/users/register`
2. **Expect:** Redirected away (to `/` or onboarding) since `redirect_if_user_is_authenticated` pipe is active

---

## 2. Login

### 2.1 Happy path
1. Go to `http://localhost:4000/users/log-in`
2. Enter the credentials from test 1.1
3. Click **Log in**
4. **Expect:** Logged in, redirected to home or onboarding

### 2.2 Wrong password
1. Go to `/users/log-in`
2. Enter correct email, wrong password
3. **Expect:** Error "Invalid email or password" -- no hint about which field is wrong

### 2.3 Non-existent email
1. Enter `nobody@example.com` with any password
2. **Expect:** Same generic error "Invalid email or password" (no user enumeration)

### 2.4 Rate limiting
1. Rapidly submit 6+ login attempts in under 60 seconds
2. **Expect:** After 5 attempts, rate limit kicks in (429 or error message). The `rate_limit_auth` pipeline limits to 5/minute.

### 2.5 Logout
1. While logged in, trigger `DELETE /users/log-out` (click logout link/button)
2. **Expect:** Session destroyed, redirected to home page
3. Try navigating to `/onboarding/username`
4. **Expect:** Redirected to `/users/log-in`

---

## 3. Onboarding -- Username Claim

### 3.1 Happy path
1. Log in with a fresh account that hasn't claimed a username
2. You should land at `/onboarding/username`
3. Type a valid username: `testuser` (3-39 chars, lowercase, hyphens OK)
4. **Expect:** Live availability check shows green/available indicator
5. Submit
6. **Expect:** Redirected to `/onboarding/vibe`

### 3.2 Invalid usernames
Try each of these in the username field and check for validation errors:
- `ab` (too short -- under 3 chars)
- `UPPERCASE` (must be lowercase)
- `user@name` (special characters not allowed)
- `a-very-very-very-very-very-very-very-very-long-name` (over 39 chars)
- **Expect:** Each shows an inline validation error, submit is blocked

### 3.3 Taken username
1. In a second browser, register a different account and claim username `taken`
2. In first browser, try to claim `taken`
3. **Expect:** Live check shows unavailable. Submit either blocked or returns error.

### 3.4 Auth guard
1. Log out
2. Navigate directly to `/onboarding/username`
3. **Expect:** Redirected to `/users/log-in`

---

## 4. Onboarding -- Vibe Picker

### 4.1 Happy path
1. After claiming username, you should be at `/onboarding/vibe`
2. **Expect:** 6 template cards visible: Editorial, Terminal, Minimal, Brutalist, Campfire, Neon Night
3. Click each card -- **Expect:** Visual selection indicator (border, highlight, etc.)
4. Look for accent color options (seal-blue, violet, rose, teal, amber, sky)
5. Pick a color -- **Expect:** Preview updates with that accent
6. Click Save/Continue
7. **Expect:** Redirected to `/:username` (your portfolio page)

### 4.2 Skip check
1. Navigate directly to `/onboarding/vibe` without having claimed a username first
2. **Expect:** Redirected back to `/onboarding/username`

---

## 5. Session Pages (Mock Data)

> **Note:** The ShareController currently serves mock data for all tokens. These tests verify template rendering and page structure, not data integrity.

### 5.1 Session show page
1. Go to `http://localhost:4000/s/any-token-here`
2. **Expect:** Session page renders with the mock "Ripping out auth" session. Shows: title, dev_take, duration (47m), turns (77), files (34), LOC (2.4k), beats timeline, Q&A pairs, highlights, tool breakdown, top files.

### 5.2 Template switching via query param
1. Visit `/s/test123?template=terminal`
2. **Expect:** Terminal template styling applied
3. Try each template: `?template=editorial`, `?template=minimal`, `?template=brutalist`, `?template=campfire`, `?template=neon-night`
4. **Expect:** Each renders with distinct visual style. No broken CSS, proper typography.
5. Try `?template=nonexistent`
6. **Expect:** Falls back to editorial (default)

### 5.3 "Gone" tokens
1. Visit `/s/deleted`
2. **Expect:** 410 Gone page renders (not 404)
3. Also try `/s/expired` and `/s/removed`
4. **Expect:** Same gone page for all three

### 5.4 Transcript page
1. Visit `/s/any-token/transcript`
2. **Expect:** Full mock transcript with dev/AI message pairs, timestamps, decision callouts

### 5.5 Verify page
1. Visit `/s/any-token/verify`
2. **Expect:** Verification page showing content hash, signature status "unverified" (mock session has no signature), recorded_at and verified_at timestamps

---

## 6. API -- Publish Session

### 6.1 Happy path (no auth)
```bash
curl -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "session": {
      "title": "Test session",
      "dev_take": "Just testing the publish flow",
      "duration_minutes": 30,
      "turns": 42,
      "files_changed": 10,
      "loc_changed": 500,
      "template": "editorial"
    }
  }'
```
**Expect:** 201 response with `{"token": "...", "url": "/s/...", "sealed": false, "content_hash": "..."}`

### 6.2 Missing session param
```bash
curl -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "wrong shape"}'
```
**Expect:** 400 with `{"error": {"code": "MISSING_SESSION", "message": "Missing 'session' parameter"}}`

### 6.3 Missing required fields
```bash
curl -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"session": {}}'
```
**Expect:** 422 with `{"error": {"code": "VALIDATION_FAILED", "details": {...}}}` listing missing field errors

### 6.4 Rate limiting
```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/sessions \
    -H "Content-Type: application/json" \
    -d '{"session": {"title": "rate test '$i'", "dev_take": "test"}}'
done
```
**Expect:** First 10 return 201 or 422, then 429 (rate limited at 10/minute)

### 6.5 Verify via API
1. Take a token from test 6.1's response
2. ```bash
   curl http://localhost:4000/api/sessions/TOKEN_HERE/verify
   ```
3. **Expect:** JSON with `token`, `content_hash`, `signed: false`, `verified: false`, `sealed: false`

### 6.6 Non-existent token verify
```bash
curl http://localhost:4000/api/sessions/nonexistent/verify
```
**Expect:** 404 with `{"error": {"code": "NOT_FOUND"}}`

---

## 7. Challenges

### 7.1 Create a challenge
1. Log in, go to `/challenges/new`
2. Fill in:
   - **Title:** "Elixir GenServer Challenge"
   - **Problem statement:** "Build a GenServer that manages a shopping cart"
   - **Criteria** (one per line): "Proper GenServer callbacks\nError handling\nTest coverage"
   - **Time limit:** 60 (minutes)
   - **Max responses:** 5
   - **Access code:** (leave blank for now)
3. Submit
4. **Expect:** Redirected to `/challenges/SLUG` with flash "Challenge created." Challenge is in **draft** status.

### 7.2 Create challenge with access code
1. Go to `/challenges/new`
2. Fill in fields + set access code to `secret123`
3. Submit
4. **Expect:** Challenge created. Access code is bcrypt-hashed (not stored in plain text).

### 7.3 View draft challenge (as owner)
1. Navigate to `/challenges/SLUG` for the challenge you created
2. **Expect:** Challenge details visible. Status shows "draft."

### 7.4 View draft challenge (as another user)
1. In incognito, log in as a different user
2. Navigate to the same `/challenges/SLUG`
3. **Expect:** The page renders (public show page), but challenge should indicate it's not yet active. No submission option.

### 7.5 Access code flow
1. In incognito (not logged in), visit the access-code-protected challenge from 7.2
2. **Expect:** See an access code input form (challenge is locked)
3. Enter wrong code `wrong`
4. **Expect:** Error displayed, still locked
5. Enter correct code `secret123`
6. **Expect:** Page refreshes, now unlocked. Session cookie stores `challenge_unlocked_<id>`
7. Refresh the page
8. **Expect:** Still unlocked (session persists)

### 7.6 Challenge with no access code
1. Visit the challenge from 7.1 (no access code)
2. **Expect:** Problem statement visible immediately, no unlock step

### 7.7 Publish a response to a challenge
1. First, activate the challenge via IEx:
   ```bash
   # In a separate terminal in the phoenix/ directory:
   iex -S mix
   # Then:
   challenge = HeyiAm.Challenges.get_challenge_by_slug!("YOUR-SLUG")
   HeyiAm.Challenges.activate_challenge(challenge)
   ```
2. Publish a session linked to the challenge:
   ```bash
   curl -X POST http://localhost:4000/api/sessions \
     -H "Content-Type: application/json" \
     -d '{
       "session": {
         "title": "My GenServer solution",
         "dev_take": "Used handle_call for sync ops",
         "duration_minutes": 45,
         "turns": 30
       },
       "challenge_slug": "YOUR-SLUG"
     }'
   ```
3. **Expect:** 201, share created with `challenge_id` linked

### 7.8 Challenge at max responses
1. Publish responses up to the `max_responses` limit (5 from test 7.1)
2. Attempt one more
3. **Expect:** Error `{"error": {"code": "MAX_RESPONSES_REACHED"}}`

### 7.9 Response to non-existent challenge
```bash
curl -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "session": {"title": "test", "dev_take": "test"},
    "challenge_slug": "does-not-exist"
  }'
```
**Expect:** 404 with `{"error": {"code": "CHALLENGE_NOT_FOUND"}}`

### 7.10 Compare view (owner only)
1. Log in as the challenge creator
2. Go to `/challenges/SLUG/compare`
3. **Expect:** All responses listed with summary (title, duration, turns, sealed status, truncated hash)

### 7.11 Compare view (non-owner)
1. Log in as a different user
2. Go to `/challenges/SLUG/compare`
3. **Expect:** Redirected to `/` with flash "You do not have access to this challenge."

### 7.12 Deep dive
1. As the challenge owner, go to `/challenges/SLUG/responses/TOKEN` (use a response token from compare view)
2. **Expect:** Detailed view: title, dev_take, skills, beats, Q&A pairs, narrative, tool breakdown
3. Check prev/next navigation links
4. **Expect:** First response has no "prev" link, last has no "next" link

### 7.13 Non-existent challenge slug
1. Visit `/challenges/totally-fake-slug`
2. **Expect:** 404 error (Ecto.NoResultsError raises)

---

## 8. Portfolio

### 8.1 View portfolio (mock data)
1. Go to `http://localhost:4000/YOUR-USERNAME`
2. **Expect:** Portfolio page renders with mock projects (DataFlow Engine, heyi.am), collab profile radar, metrics, recent activity. Uses the template/accent you chose in onboarding.

### 8.2 Non-existent username
1. Go to `/nobody-exists-here`
2. **Expect:** 404 page

### 8.3 Project detail (mock data)
1. Go to `/YOUR-USERNAME/dataflow-engine`
2. **Expect:** Project detail page with mock data -- description, stats, session list (3 mock sessions)

### 8.4 Project with non-existent slug
1. Go to `/YOUR-USERNAME/fake-project`
2. **Expect:** Page renders (mock data is hardcoded for any slug). Note: this is expected behavior while mock data is in use.

---

## 9. Portfolio Editor (LiveView)

### 9.1 Access as owner
1. Log in, go to `/YOUR-USERNAME/edit`
2. **Expect:** LiveView editor loads with profile fields (display_name, bio, location, status), session list, expertise section

### 9.2 Edit profile fields
1. Change display name, bio, location, status
2. Save
3. **Expect:** Changes persisted. Visit `/YOUR-USERNAME` to verify they appear.

### 9.3 Access as non-owner
1. In incognito, log in as a different user
2. Navigate to `/FIRST-USERS-USERNAME/edit`
3. **Expect:** Blocked by `ensure_owner` mount hook -- error or redirect

### 9.4 Access when not logged in
1. Log out, navigate to `/ANY-USERNAME/edit`
2. **Expect:** Redirected to `/users/log-in`

---

## 10. Project Editor (LiveView)

### 10.1 Access as owner
1. Log in, go to `/YOUR-USERNAME/projects/some-project/edit`
2. **Expect:** LiveView loads with project editing UI (mock data)

### 10.2 Access as non-owner
1. Log in as different user, try `/FIRST-USERS-USERNAME/projects/some-project/edit`
2. **Expect:** Blocked by `ensure_owner`

---

## 11. User Settings

### 11.1 View settings
1. Log in, go to `/users/settings`
2. **Expect:** Settings form with email change and password change sections

### 11.2 Change email
1. Enter new email + current password
2. Submit
3. **Expect:** Flash says confirmation email sent
4. Open `http://localhost:4000/dev/mailbox`
5. **Expect:** Email with confirmation link
6. Click the confirmation link
7. **Expect:** Email updated, flash confirms

### 11.3 Change email -- wrong password
1. Enter new email + wrong current password
2. **Expect:** Error "is not valid"

### 11.4 Change password
1. Enter current password + new password (12+ chars) + confirmation
2. Submit
3. **Expect:** Password changed. May need to re-login.

### 11.5 Expired confirmation token
1. Start an email change
2. Wait or manually invalidate the token (or use it twice)
3. **Expect:** "link is invalid or it has expired"

---

## 12. Error Pages

### 12.1 404 page
1. Visit `http://localhost:4000/this/path/does/not/exist`
2. **Expect:** Catches at the portfolio catch-all route (`/:username/:project`). Since no user "this" exists, returns custom 404 page.

### 12.2 Gone page
1. Visit `/s/deleted`, `/s/expired`, `/s/removed`
2. **Expect:** 410 Gone page with appropriate messaging

### 12.3 API error format
1. Send malformed JSON to the API:
   ```bash
   curl -X POST http://localhost:4000/api/sessions \
     -H "Content-Type: application/json" \
     -d 'not json'
   ```
2. **Expect:** 400 error with JSON error body

---

## 13. Security and Edge Cases

### 13.1 CSRF protection
1. Open browser dev tools -> Network tab
2. Submit any form (login, register, challenge create)
3. **Expect:** Request includes `_csrf_token` parameter. The `:protect_from_forgery` plug is active.

### 13.2 CSP headers
1. In dev tools -> Network, inspect any page response headers
2. **Expect:** `content-security-policy` header present with `default-src 'self'` and the font/style exceptions defined in the router

### 13.3 Session fixation
1. Note your session cookie value before login
2. Log in
3. **Expect:** Session cookie changes (new session issued on auth)

### 13.4 XSS in user-controlled fields
1. Set your display name to `<script>alert('xss')</script>` via the portfolio editor
2. Visit your portfolio page
3. **Expect:** Script tag is HTML-escaped, not executed. Renders as literal text.

### 13.5 API without Content-Type
```bash
curl -X POST http://localhost:4000/api/sessions -d 'title=test'
```
**Expect:** 406 Not Acceptable or 400 -- the `:api` pipeline requires `accepts: ["json"]`

---

## 14. Mobile Responsiveness

> Open Chrome DevTools -> toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M)

### 14.1 Portfolio page -- iPhone SE (375px)
1. Visit `/:username`
2. **Expect:** Content stacks vertically, readable, no horizontal scroll

### 14.2 Session page -- iPhone SE
1. Visit `/s/any-token`
2. **Expect:** Beats timeline, Q&A, tool breakdown all render mobile-friendly

### 14.3 Forms -- iPhone SE
1. Visit `/users/register`, `/users/log-in`, `/challenges/new`
2. **Expect:** All inputs are full-width, tappable, no overflow

### 14.4 Tablet (768px)
1. Check portfolio + session pages at tablet width
2. **Expect:** Reasonable intermediate layout, nothing broken

---

## Notes

- **Mock data caveat:** The ShareController and PortfolioController serve hardcoded mock data. `/s/:token` renders the same session regardless of token, and `/:username` shows the same projects for any real user. Tests in sections 5 and 8 verify rendering, not data integrity.
- **API vs views gap:** The API controller (`POST /api/sessions`) writes to the DB, but the share view pages don't read from it yet. There's a gap between "publish" and "view" that will need wiring up.
- **Challenge flows are fully wired:** Challenges are the most "real" feature to test end-to-end right now, hitting the DB for both writes and reads.
