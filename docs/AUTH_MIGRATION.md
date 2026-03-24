# Auth Migration: phx.gen.auth LiveView

## Context

The app_web (port 4001) had hand-rolled controller-based auth pages. We deleted it all, ran `mix phx.gen.auth` to get standard LiveView-based auth, then layered back custom features.

## Constraints

- **No magic links** as primary auth — email + password registration with auto-confirm
- **Auto-verify emails** — `registration_changeset` calls `confirm_changeset()` on insert
- **Preserve custom features**: GitHub OAuth, device auth, admin auth, username onboarding, GDPR export/delete, sudo mode, session reissue, API bearer auth
- **Custom CSS** — `auth-page`, `auth-card`, `auth-input` classes, not Tailwind
- **UTC DateTime** everywhere — existing migrations use `:utc_datetime`, not `:naive_datetime`

## What was done

### Step 1: Delete existing custom auth files

Deleted all controller-based auth (session, registration, settings controllers + HTML + templates), the UserAuth plug, context layer (accounts.ex, user.ex, user_token.ex, user_notifier.ex, scope.ex), and their tests.

Preserved: admin_auth.ex, oauth_controller.ex, device_api_controller.ex, device_auth_live.ex, claim_username_live.ex, device_code.ex, device_code_cleaner.ex, API auth plugs.

### Step 2: Run phx.gen.auth

```bash
cd apps/heyi_am_app_web
mix phx.gen.auth Accounts User users --live
```

Required `config :heyi_am_app_web, generators: [context_app: :heyi_am]` in config.exs for the umbrella to find the correct context app.

### Step 3: Handle migrations

Deleted the generator's migration (duplicate `users` + `users_tokens` tables). Kept existing migration with all custom fields. Ran `mix ecto.reset`.

Fixed all generated code to use `DateTime`/`:utc_datetime` instead of `NaiveDateTime`/`:naive_datetime` to match existing migrations.

### Step 4: Layer back custom features

**accounts.ex** — Added back:
- `get_user_by_username/1`, `find_or_create_from_github/1`
- Device auth: `create_device_code/1`, `authorize_device_code/2`, `poll_device_code/1`
- Profile: `change_user_profile/2`, `update_user_profile/2`
- HTML isolation: `update_user_rendered_html/2`, `update_user_time_stats/2`
- Username: `change_user_username/2`, `update_user_username/2`
- GDPR: `export_user_data/1`, `delete_user_account/1`
- Sudo mode: `sudo_mode?/2`
- Password reset: `deliver_user_reset_password_instructions/2`, `get_user_by_reset_password_token/1`, `reset_user_password/2`

**user.ex** — Added back custom fields (username, display_name, bio, avatar_url, github_id, github_url, location, status, portfolio_layout, portfolio_accent, time_stats, rendered_portfolio_html) and changesets (registration_changeset, github_changeset, profile_changeset, rendered_html_changeset, username_changeset).

**user_token.ex** — Added `verify_reset_password_token_query/1` for forgot password flow.

**user_notifier.ex** — Replaced generator's plain text emails with HTML email templates (table-based layout, Seal Blue palette, welcome email with CLI instructions).

**user_auth.ex** — Added `signed_in_path_for_user/1` (username check → onboarding redirect), kept session reissue logic and sudo mode on_mount hook.

**admin_auth.ex** — Updated `:ensure_authenticated` → `:require_authenticated` to match new on_mount naming.

**router.ex** — Fixed generator's misplaced `plug :fetch_current_scope_for_user` (injected inside CSP header map). Added back all API routes, OAuth routes, admin dashboard, device auth + claim username LiveViews. Added forgot password routes.

### Step 5: Custom UI

Replaced Tailwind classes in generated LiveViews with custom CSS classes (`auth-page`, `auth-card`, `auth-input`, `auth-field`, `auth-label`, `auth-divider`, `auth-error`, `auth-link`, `btn`, `btn-primary`, `btn-github`, `stack`).

Added GitHub OAuth button to login + registration pages. Added terms checkbox to registration (tracked in socket assigns to survive LiveView re-renders). Added GDPR export + account deletion to settings. Added forgot password link to login.

Removed duplicate nav menu from `root.html.heex` (generator injected one, but `app.html.heex` already had nav via AppShell).

Fixed `app.html.heex` scope check: `@current_scope` → `@current_scope && @current_scope.user` (Scope.for_user(nil) is truthy).

### Step 6: Forgot password flow (new)

Added two new LiveViews:
- `UserLive.ForgotPassword` — email input, sends reset token via email
- `UserLive.ResetPassword` — new password form, validates token, resets password and deletes all tokens

Uses same hashed-email-token pattern as magic links but with `"reset_password"` context and 1-day expiry.

### Step 7: Security hardening (done)

From security review + red team analysis. All items fixed in commits `0f7acfa` and `6b792c2`:

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | High | Missing sudo mode on `export` and `delete_account` controller actions | Fixed |
| 2 | Medium | Remember-me cookie missing `secure` and `http_only` flags | Fixed |
| 3 | Medium | Sudo check crashes with MatchError (500) instead of proper 403 | Fixed |
| 4 | Medium | No rate limiting on `POST /users/log-in` | Fixed |
| 5 | Medium | Share.rendered_html changeset separation (same pattern as User.rendered_portfolio_html) | Fixed |

## XSS Defense Architecture

The `rendered_html` (on Share) and `rendered_portfolio_html` (on User) fields store pre-rendered HTML from the CLI. These are served via `raw()` on the public domain.

**Defense layers:**
1. **CLI sanitization** — The CLI renderer never generates `<script>` tags, event handlers, or JS. It strips any JS from raw data before rendering. Output is pure static HTML + CSS.
2. **Server adds JS separately** — Trusted scripts are added by the server-side template above the rendered content. Data is passed via hidden fields / data attributes, not inline JS.
3. **Changeset separation** — `rendered_html` / `rendered_portfolio_html` are NOT in general changesets. They can only be written through dedicated functions (`update_user_rendered_html/2`, etc.), not via the profile or session create API.
4. **Domain isolation** — Public content on heyi.am (no cookies), auth on heyiam.com (session cookies). Even if HTML injection occurs, no cookies to steal.
5. **CSP** — `script-src 'self'` on public_web blocks inline script execution.
6. **Auth required** — Only authenticated users can publish. Attribution is traceable.
7. **Ed25519 signing** — Sealed sessions have cryptographic proof of origin.

## LiveView Pages

| Route | LiveView | Purpose |
|-------|----------|---------|
| `/users/log-in` | `UserLive.Login` | Password login + GitHub OAuth |
| `/users/register` | `UserLive.Registration` | Email + password + terms + GitHub OAuth |
| `/users/settings` | `UserLive.Settings` | Email/password change, GDPR export, account deletion |
| `/users/reset-password` | `UserLive.ForgotPassword` | Enter email for reset link |
| `/users/reset-password/:token` | `UserLive.ResetPassword` | Set new password |
| `/users/log-in/:token` | `UserLive.Confirmation` | Magic link confirmation (from generator) |
| `/onboarding/username` | `ClaimUsernameLive` | Claim username after registration |
| `/device` | `DeviceAuthLive` | Device auth for CLI |

## Controller-only routes (need conn access)

| Route | Action | Why controller |
|-------|--------|---------------|
| `POST /users/log-in` | `UserSessionController.create` | Sets session cookie |
| `DELETE /users/log-out` | `UserSessionController.delete` | Clears session |
| `POST /users/update-password` | `UserSessionController.update_password` | Session refresh after password change |
| `GET /users/settings/export` | `UserSessionController.export` | File download |
| `DELETE /users/settings/delete-account` | `UserSessionController.delete_account` | Session drop |

## Test coverage

434 tests across 4 apps, 0 failures.
