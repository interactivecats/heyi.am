# LLM Proxy: Server-Side AI Enhancement

**Status:** Draft — Awaiting founder review
**Date:** 2026-03-21
**Contributors:** PM, UX, Backend Dev

---

## Problem

AI enhancement (turning raw sessions into structured case studies) requires every user to have `ANTHROPIC_API_KEY` set. This creates three problems:

1. **Onboarding wall.** User clicks "Enhance," gets a cryptic SDK error. No graceful fallback.
2. **Cost anxiety.** Even devs with a key hesitate — each call hits their personal billing at ~$0.02/session (Sonnet).
3. **Zero telemetry.** Client-side calls mean we can't measure enhancement rate, failure rate, or output quality.

Enhancement is the last step before publish. If it's broken or gated behind API key setup, we lose users at the moment of highest commitment.

---

## Solution

Route enhancement through the Phoenix backend. CLI sends session data to Phoenix, Phoenix calls the LLM, returns the result. Users never touch an API key unless they want to.

```
Default (proxy):
  CLI React UI --> Express server --> Phoenix API --> LLM Provider
                   (localhost)        (Bearer auth)   (our key)

Fallback (BYOK):
  CLI React UI --> Express server --> Anthropic SDK --> Claude API
                   (localhost)        (user's key)
```

### Resolution priority (no toggle, no config)

| Local Key | Authenticated | Behavior |
|-----------|--------------|----------|
| Yes | Yes or No | Uses local key. Proxy not involved. |
| No | Yes | Uses proxy. Shows remaining count. |
| No | No | Shows setup card (login or set key). |

Local key always wins. Users with both never consume proxy quota.

---

## User Segments

| Segment | % of installs | Enhancement need | Pays? |
|---------|--------------|-----------------|-------|
| **Free explorer** — browsing, hasn't published | 70-80% | 1-3 to try it | No |
| **Active publisher** — 3+ published sessions | 15-25% | 5-15/month | Maybe |
| **Challenge responder** — submitting to a hiring challenge | 5-10% | 1 per challenge | No (challenge creator pays) |
| **Power user** — 20+ sessions, primary portfolio | 1-3% | 20+/month | Yes |

**Key insight:** Challenge responders may be anonymous. Gating their enhancement behind API key setup hurts our monetization path (challenge creators are the paying customer).

---

## Tier Structure

| | Free | Pro ($8/mo or bundled) |
|---|---|---|
| **Enhancements/month** | 10 | 100 |
| **Model** | Gemini 2.5 Flash | Claude Haiku 3.5 |
| **Challenge responses** | Unlimited (creator-funded) | Unlimited |
| **BYOK override** | Yes — bypasses quota | Yes |
| **Cost ceiling per user** | ~$0.03/mo | ~$0.18/mo |

### Cost at scale

| Scale | Free users | Pro users | Monthly LLM cost | Revenue |
|-------|-----------|-----------|-------------------|---------|
| 1K users | 900 | 100 | $45 | $800 |
| 10K users | 8,500 | 1,500 | $525 | $12,000 |
| 100K users | 85,000 | 15,000 | $5,250 | $120,000 |

Assumptions: 50% of free users enhance in a given month, average 6 of 10 quota. Pro users average 10 of 100.

### Model cost comparison (per 1M sessions, ~15K in / 1.5K out)

| Model | Cost | Notes |
|-------|------|-------|
| Gemini 2.5 Flash | $3,150 | Primary for free tier |
| GPT-4.1 mini | $8,400 | Alternative |
| Claude Haiku 3.5 | $18,000 | Pro tier |
| Gemini 2.5 Flash Lite | $1,575 | If Flash quality is sufficient |

---

## UX Flows

### First-time user (no key, not logged in)

"Enhance with AI" button always visible. On click, AnalyzingPanel shows inline setup card (no modal):

```
To run AI enhancement, either:

$ heyiam login
Uses our hosted AI (10 free per month)

-- or --

Set ANTHROPIC_API_KEY in your env
Uses your own Anthropic account

[Skip -- edit manually]
```

### Enhancement in progress

First line of the AI Logic Feed shows routing:

- Local key: `> Using local API key`
- Proxy: `> Using heyi.am proxy (7 of 10 remaining this month)`

Proxy uses non-streaming POST. The existing fake-streaming animation (`StreamingPanel` timers) provides perceived real-time generation. Simpler to implement, simpler to meter (one request = one count).

### Rate limit hit

Server returns 429. AnalyzingPanel shows:

```
Monthly limit reached

You've used all 10 proxy enhancements this month.
Resets April 1.

Set ANTHROPIC_API_KEY in your env
Uses your own account, no limits

[Edit manually]     [Back to session]
```

No upsell beyond one line if Pro exists later. No "please try again later."

### Error states

All errors render inside AnalyzingPanel as cards with heading, explanation, optional terminal block, and action buttons.

| Error | Code | Retryable? | Primary action |
|-------|------|-----------|----------------|
| Proxy unreachable | `PROXY_UNREACHABLE` | Yes | Retry |
| Upstream model error | `UPSTREAM_ERROR` | Yes | Try again |
| Invalid session data | `INVALID_SESSION` | No | Edit manually |
| Auth expired | `AUTH_EXPIRED` | No | `heyiam login` |

### Settings page evolution

Replace "API Configuration" section with "AI Enhancement":

- **Mode row** (read-only): "heyi.am proxy" (green dot), "Local API key" (blue dot), or "Not configured" (gray dot)
- **Usage row** (proxy only): "7 of 10 this month"
- **Collapsible "Use your own API key"**: existing password input with show/hide toggle, saves on blur

Remove `hasApiKey` prop from `SessionDetail`. Error handling moves entirely into `EnhanceFlow`'s AnalyzingPanel.

---

## Technical Architecture

### CLI: Provider Abstraction

**New files:**

| File | Purpose |
|------|---------|
| `cli/src/llm/provider.ts` | `LLMProvider` interface: `complete(system, user)` and `stream(system, user)` |
| `cli/src/llm/anthropic-provider.ts` | Wraps existing `@anthropic-ai/sdk` calls (BYOK path) |
| `cli/src/llm/proxy-provider.ts` | Calls Phoenix `POST /api/enhance` with Bearer token |
| `cli/src/llm/index.ts` | Factory: if `ANTHROPIC_API_KEY` set, return Anthropic; else return Proxy |

**Modified files:**

| File | Change |
|------|--------|
| `cli/src/summarize.ts` | Replace direct Anthropic SDK with `LLMProvider` interface. Prompts and parsing unchanged. |
| `cli/src/server.ts` | Pass resolved provider to summarize functions |
| `cli/src/config.ts` | Add `ENHANCE_MODE` export (informational) |

### Phoenix: Proxy Endpoint

**New modules:**

| File | Purpose |
|------|---------|
| `phoenix/lib/heyi_am/llm.ex` | Context module: orchestrates provider selection, validation, truncation, usage logging |
| `phoenix/lib/heyi_am/llm/provider.ex` | Behaviour: `@callback complete/3`, `@callback stream/3` |
| `phoenix/lib/heyi_am/llm/gemini.ex` | Gemini 2.5 Flash via `Req` — `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| `phoenix/lib/heyi_am/llm/anthropic.ex` | Fallback provider via `Req` (server-side key) |
| `phoenix/lib/heyi_am/llm/prompt.ex` | Port prompt templates from `summarize.ts` to Elixir |
| `phoenix/lib/heyi_am/llm/circuit_breaker.ex` | ETS counter tracking daily spend, trips at configurable ceiling ($10 default) |
| `phoenix/lib/heyi_am/llm/usage.ex` | Usage schema + logging (see migration below) |
| `phoenix/lib/heyi_am_web/controllers/enhance_api_controller.ex` | `create/2` (POST JSON) and `stream/2` (POST SSE) |
| `phoenix/lib/heyi_am_web/plugs/api_auth.ex` | Extract Bearer token -> user_id from `ShareApiController` into reusable plug |
| `phoenix/lib/heyi_am_web/plugs/enhance_rate_limit.ex` | Per-user tiered rate limiting with Hammer |

**Router changes** (`router.ex`):

```elixir
scope "/api", HeyiAmWeb do
  pipe_through [:api, :require_api_auth, :rate_limit_enhance]

  post "/enhance", EnhanceApiController, :create
  post "/enhance/stream", EnhanceApiController, :stream
end
```

### Migrations

**Add tier to users:**

```sql
ALTER TABLE users ADD COLUMN tier varchar(20) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD CONSTRAINT users_tier_check CHECK (tier IN ('free', 'pro'));
```

**Create enhancement_usage:**

```sql
CREATE TABLE enhancement_usage (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  provider varchar(20) NOT NULL,
  model varchar(50) NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  estimated_cost_cents integer NOT NULL,
  duration_ms integer NOT NULL,
  status varchar(20) NOT NULL,
  idempotency_key uuid,
  error_code varchar(50),
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enhancement_usage_user_id ON enhancement_usage(user_id);
CREATE INDEX idx_enhancement_usage_inserted_at ON enhancement_usage(inserted_at);
CREATE UNIQUE INDEX idx_enhancement_usage_idempotency
  ON enhancement_usage(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

### Abuse Prevention

| Layer | Mechanism |
|-------|-----------|
| Auth required | `ApiAuth` plug halts with 401 before processing |
| Per-user quota | Monthly counter in `enhancement_usage` table |
| Burst protection | Hammer: 5 enhancements/minute per user |
| Input size | Plug.Parsers `:length` at 100KB, field-level truncation |
| Input validation | Required keys, max lengths, min turn count |
| Cost ceiling | Circuit breaker trips at $10/day, pauses free-tier |
| Token cap | Estimate tokens as `byte_size / 4`, cap at 8K, truncate `raw_log` first |

### Input Truncation (graceful, not rejection)

1. `raw_log`: keep first 30 entries, each max 1500 chars
2. `turn_timeline`: keep first 15 entries
3. `files_changed`: keep top 10 by additions + deletions
4. Recalculate token estimate after truncation

### Configuration (`runtime.exs`)

```elixir
config :heyi_am, HeyiAm.LLM,
  gemini_api_key: System.get_env("GEMINI_API_KEY"),
  anthropic_api_key: System.get_env("ANTHROPIC_API_KEY"),
  gemini_model: "gemini-2.5-flash",
  anthropic_model: "claude-haiku-4-5-20251001",
  max_input_tokens: 8_000,
  request_timeout_ms: 30_000,
  daily_spend_cap_cents: 1000
```

---

## Implementation Order

Each commit is independently reviewable and leaves the codebase working.

### Phase A: Phoenix Infrastructure (prerequisites)

1. **Extract `ApiAuth` plug** from `ShareApiController` — small refactor, no behavior change
2. **Add `tier` column to users** — migration + schema field
3. **Create `enhancement_usage` table** — migration + schema + logging functions

### Phase B: Phoenix LLM Integration

4. **Implement `HeyiAm.LLM.Gemini` provider** — Gemini API integration with `Req`, mocked tests
5. **Port prompt templates to Elixir** — `llm/prompt.ex`, validate parity with TS prompts
6. **Implement `HeyiAm.LLM` context** — orchestration, input validation, truncation, circuit breaker
7. **Implement `EnhanceApiController`** — endpoint with auth, rate limiting, error responses

### Phase C: CLI Provider Abstraction

8. **Create `cli/src/llm/` module** — provider interface, Anthropic provider, Proxy provider, factory
9. **Wire `summarize.ts` to provider abstraction** — replace direct SDK, update server routes
10. **Update Settings UI** — new "AI Enhancement" section, remove `hasApiKey` gate

### Phase D: Quality Validation

11. **Blind quality comparison** — 50 sessions through Gemini Flash vs Haiku, scored by 3 devs
12. **Integration tests** — full proxy round-trip, quota enforcement, error states, BYOK fallback

---

## Success Metrics

| Metric | Target (30 days) |
|--------|-----------------|
| Enhancement completion rate | >85% |
| Enhance-to-publish conversion | >40% within 24h |
| Time from install to first enhancement | <10 minutes |
| Free-tier quota utilization | 30-60% average |
| BYOK fallback rate | <5% |
| Error rate | <2% |
| P95 latency (non-streaming) | <8 seconds |

**Anti-metrics** (do NOT optimize): enhancement volume per user, model cost per session.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Cost runaway (abuse/bugs) | Medium | Circuit breaker ($10/day), per-user burst limit (5/min), provider dashboard hard cap ($500/mo) |
| Gemini Flash quality too low for dev-take | Medium-high | Blind comparison before launch; if <70% of Haiku quality on tone, use Haiku for all ($0.18/user/mo still viable) |
| Challenge response abuse | Low | Global per-IP rate limit, flag challenges with >50 responses |
| Privacy concerns (session data through our servers) | Medium | In-memory processing only, not stored; BYOK always available; document in privacy policy |
| Vendor lock-in | High (6mo) | Phoenix endpoint uses our own schema, provider is an implementation detail |

---

## Open Questions (need founder input)

1. **Is $8/month the right Pro price?** Could bundle with broader Pro plan (custom domains, analytics, private portfolios) or sell standalone.
2. **Launch with free tier or BYOK-only first?** Free tier is the goal but higher risk. Recommendation: free tier behind feature flag.
3. **Port prompts to Elixir or extract to shared JSON?** Recommendation: port to Elixir (~100 lines of string construction).
4. **Streaming protocol:** SSE for v1 (matches existing CLI implementation).
5. **How many times does a typical user enhance before publishing?** Need to instrument current BYOK flow. If >2x average, 10/month free may be tight.

---

## Secrets

| Secret | Where | Notes |
|--------|-------|-------|
| `GEMINI_API_KEY` | Runtime env, injected at deploy | Server-side only, CLI never sees it |
| `ANTHROPIC_API_KEY` (server) | Runtime env, injected at deploy | Fallback/Pro tier only |
| User's own `ANTHROPIC_API_KEY` | User's local env | Never sent to our servers |
| User session tokens | Hashed in `user_tokens` table | Existing system, no changes |
