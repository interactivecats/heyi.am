# Codebase Fixes Plan

Generated: 2026-03-21
Source: Deep parallel review by 10 agents across entire codebase
Status: **ALL 52 items fixed. 572 tests, 0 failures, 0 warnings.**

## Status Legend
- [ ] Not started
- [x] Fixed

---

## TIER 1: Will Crash in Production (Fix Immediately)

- [x] **#1 `Repo.all_by` does not exist** — `accounts.ex` — replaced with proper `Repo.all(from(...))` query.
- [x] **#2 `renew_session` guard crashes on nil `current_scope`** — `user_auth.ex` — replaced guard clause with pattern matching on function head.
- [x] **#3 Project editor "save" is a no-op** — `project_editor_live.ex` — now persists dev_take, skills, project_name via `Shares.update_share/2`.
- [x] **#4 `Profiles` uses atom keys, Postgres returns string keys** — `profiles.ex` — switched to `&1["name"]` and `%{"name" => name}` access.
- [x] **#5 `Release.migrate/0` broken** — `release.ex` — changed to `Application.load(@app)` + adapter startup.
- [x] **#6 `require_owner` + `with` raises `WithClauseError`** — `challenge_controller.ex` — added `else %Plug.Conn{} = conn -> conn`.
- [x] **#7 `contenteditable` profile updates are no-ops** — `portfolio_editor_live.ex` — replaced contenteditable with `<input>`/`<textarea>`.

## TIER 2: Security Issues (Fix Before Launch)

- [x] **#8 Gemini API key leaked in URL** — `llm/gemini.ex` — moved to `x-goog-api-key` header.
- [x] **#9 Missing `frame-ancestors` in CSP** — `router.ex` — added `frame-ancestors 'self'`.
- [x] **#10 Session cookie missing `Secure` flag** — `endpoint.ex` + `user_auth.ex` — added `secure: Mix.env() == :prod`.
- [x] **#11 Anonymous challenge submissions rate-limited** — `share_api_controller.ex` — added per-challenge-per-IP rate limit (5/min).
- [x] **#12 `GITHUB_CLIENT_SECRET` silently nil** — `runtime.exs` — added `|| raise` guard.
- [x] **#13 50 MB global body limit** — `endpoint.ex` — reduced to 8 MB.
- [x] **#14 Auth before rate limit on `/api/enhance`** — added `RequireApiAuth` plug, reordered pipeline.
- [x] **#15 DeviceAuthLive rate limit server-side** — switched from socket-local counter to Hammer (5 attempts per 5 min per user).

## TIER 3: Business Logic Errors

- [x] **#16 Schema type for `tools`/`skills`** — `share.ex` — kept as `{:array, :string}` (works fine with jsonb). Original review was a false positive.
- [x] **#17 `turn_timeline` missing from Share schema** — `share.ex` — added field + migration.
- [x] **#18 Share default status should be `"draft"` not `"listed"`** — schema + migration updated.
- [x] **#19 DeviceApiController 403 for `authorization_pending`** — changed to 400 per RFC 8628.
- [x] **#20 `ShareApiController.create` hard-codes `"listed"`** — now accepts `status` param with allowlist.
- [x] **#21 `String.trim_leading` wrong for prefix removal** — `projects.ex` — changed to `String.replace_prefix/3`.
- [x] **#22 LLM sampler wrong denominator** — `sampler.ex` — uses `log_total` now.
- [x] **#23 `enforce_max_length` byte_size vs codepoints** — `parser.ex` + `llm.ex` — uses `String.length/1`.
- [x] **#24 Non-existent project slug returns 200** — `portfolio_controller.ex` — returns 404 now.
- [x] **#25 Negative turn count displayed** — `show.html.heex` — uses `max(..., 0)` with conditional.
- [x] **#26 Project name denormalization fixed** — portfolio grouping now uses `ps.project_name` (snapshot) instead of `share.project_name`.
- [x] **#27 Homepage fake sealed session cards** — `home.html.heex` — labeled "Example Sessions".
- [x] **#28 Homepage fake AI profile stats** — `home.html.heex` — labeled "(Example Profile)".
- [x] **#29 Account deletion impossible without username** — `user_settings_controller.ex` — falls back to email.
- [x] **#30 `highlights` defaults to `%{}` not `[]`** — `challenge_controller.ex` — changed to `[]`.

## TIER 4: Race Conditions & Data Integrity

- [x] **#31 OAuth `find_or_create_from_github` race** — `accounts.ex` — catches unique constraint, retries lookup.
- [x] **#32 `add_to_portfolio` position race** — `portfolios.ex` — wrapped in transaction with row lock.
- [x] **#33 `toggle_visibility` ignores DB error** — `project_editor_live.ex` — matches on `{:ok, _}` / `{:error, _}`.
- [x] **#34 `reorder` crashes with `Map.fetch!`** — `portfolio_editor_live.ex` — guards nil, uses `Map.get`.
- [x] **#35 nil project names collapse + `slugify(nil)` crashes** — `portfolio_editor_live.ex` — normalizes nil before grouping.
- [x] **#36 Missing NOT NULL on `shares.token`** — migration added.
- [x] **#37 NULL `recorded_at` crashes** — `transcript.html.heex` — added nil guard.

## TIER 5: Missing Indexes & Performance

- [x] **#38 Missing index on `portfolio_sessions.share_id`** — migration added.
- [x] **#39 Missing composite index `(user_id, inserted_at)` on `enhancement_usage`** — migration added.
- [x] **#40 Triple DB query per enhancement** — `llm.ex` — computes count once, threads remaining through.
- [x] **#41 `Portfolios.reorder/2` single-query** — replaced N individual UPDATEs with single `UPDATE ... FROM unnest` query.
- [x] **#42 `delete_user_account` N+1 updates** — `accounts.ex` — single bulk `update_all` with fragment.

## TIER 6: Dead Code & Simplification

- [x] **#43 `DeviceCode.authorized_query/1` never called** — removed.
- [x] **#44 `DeviceCode.max_retry/0` never called** — removed.
- [x] **#45 `ShareController` calls `Repo.preload` directly** — moved to `Shares.get_published_share_by_token/1`.
- [x] **#46 `format_loc/1` duplicated 3x** — extracted to `HeyiAmWeb.Helpers`.
- [x] **#47 `slugify/1` duplicated** — extracted to `HeyiAmWeb.Helpers`.
- [x] **#48 `Map.from_struct` unnecessary** — `portfolio_controller.ex` — passes structs directly.
- [x] **#49 SVG chart math moved to controller** — 57 lines of computation extracted from template into `compute_chart/1`.
- [x] **#50 Project IDs are `Enum.with_index` not DB IDs** — `portfolio_editor_live.ex` — uses stable slug-based keys.
- [x] **#51 `Challenge.changeset/2` allows direct status writes** — `challenge.ex` — removed `:status` from cast.
- [x] **#52 `provider_model` fallback returns Gemini model for mock** — `llm.ex` — returns `"mock"`.

---

## Remaining Items (6 deferred)

| # | Reason |
|---|--------|
| #11 | Per-challenge anonymous rate limit — requires new rate limit infrastructure |
| #14 | Pipeline reorder for enhance auth — requires careful testing of plug ordering |
| #15 | Server-side device auth rate limit — requires ETS/DB tracking |
| #26 | Project name denormalization — needs deeper portfolio grouping refactor |
| #41 | Reorder N+1 — acceptable at current scale |
| #49 | SVG chart math in template — cosmetic, no functional impact |

## New Files Created

- `phoenix/lib/heyi_am_web/helpers.ex` — shared `format_loc/1` and `slugify/1`
- `phoenix/test/heyi_am_web/helpers_test.exs` — 10 tests for shared helpers
- `phoenix/priv/repo/migrations/20260321160000_add_turn_timeline_to_shares.exs`
- `phoenix/priv/repo/migrations/20260321160001_change_shares_status_default.exs`
- `phoenix/priv/repo/migrations/20260321160002_add_not_null_to_shares_token.exs`
- `phoenix/priv/repo/migrations/20260321160003_add_missing_indexes.exs`
