# Deploying heyi.am to Coolify

## Prerequisites

- A Coolify instance (v4+)
- A PostgreSQL database (provision one inside Coolify or use an external provider)
- Your repo pushed to GitHub/GitLab (Coolify pulls from git)

## 1. Create a New Resource

1. In Coolify, click **New Resource** > **Application** > select your Git repo.
2. Set **Build Pack** to **Dockerfile**.
3. Set **Base Directory** to `/heyi_am_umbrella` — this scopes the build to the umbrella app directory.
4. Set **Dockerfile Location** to `/Dockerfile` (relative to the base directory).
5. Set **Ports Exposes** to `4000,4001,4002` (three endpoints: public_web, app_web, vibe_web).

## 2. Environment Variables

Add these in the Coolify **Environment Variables** tab:

### Required

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `ecto://user:pass@host:5432/heyi_am_prod` | Use the Coolify-managed Postgres connection string |
| `SECRET_KEY_BASE` | *(64+ char random string)* | Generate with `mix phx.gen.secret` |
| `PHX_HOST` | `heyi.am` | Primary domain (used for URL generation) |
| `PUBLIC_HOST` | `heyi.am` | Public portfolio domain (port 4000, pre-rendered HTML, strict CSP) |
| `APP_HOST` | `heyiam.com` | App domain (port 4001, auth, API, settings — session cookies scoped here) |
| `VIBE_HOST` | `howdoyouvibe.com` | Vibe domain (port 4002, anonymous vibes, no cookies) |
| `PHX_SERVER` | `true` | Starts the HTTP listeners (set automatically by `bin/server`, but required if using `bin/heyi_am start` directly) |

### GitHub OAuth

| Variable | Example |
|---|---|
| `GITHUB_CLIENT_ID` | `Iv1.abc123` |
| `GITHUB_CLIENT_SECRET` | `ghp_...` |

### OpenTelemetry / Signoz (optional)

| Variable | Example | Notes |
|---|---|---|
| `OTEL_ENDPOINT` | `http://signoz-otel-collector:4318` | OTLP HTTP endpoint of your Signoz collector |

When this variable is unset, tracing is disabled (no overhead). Set Signoz retention to 60 days max for GDPR compliance.

### Umami Analytics (optional)

Each app gets its own Umami website ID for separate tracking dashboards.

| Variable | Example | Notes |
|---|---|---|
| `UMAMI_SCRIPT_URL` | `https://analytics.example.com/script.js` | Shared across all apps |
| `UMAMI_PUBLIC_WEBSITE_ID` | `a1b2c3d4-...` | heyi.am (public portfolios) |
| `UMAMI_APP_WEBSITE_ID` | `e5f6g7h8-...` | heyiam.com (auth + API) |
| `UMAMI_VIBE_WEBSITE_ID` | `i9j0k1l2-...` | howdoyouvibe.com (vibes) |

When `UMAMI_SCRIPT_URL` is unset, no analytics script is injected on any app.

### LLM Proxy (optional)

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` or `anthropic` — which model to use for server-side enhancement |
| `GEMINI_API_KEY` | — | Required if provider is `gemini` |
| `LLM_ANTHROPIC_API_KEY` | — | Required if provider is `anthropic` (server-side key, separate from user BYOK) |
| `LLM_GEMINI_MODEL` | `gemini-2.5-flash` | Override Gemini model |
| `LLM_ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Override Anthropic model |
| `LLM_MONTHLY_QUOTA` | `10` | Free tier enhancement quota per user per month |

When no LLM API key is configured, the enhance endpoint returns 502. Users with their own `ANTHROPIC_API_KEY` bypass the proxy entirely.

### Object Storage (Cloudflare R2)

heyi.am uses an S3-compatible store for session recording files and screenshots. We use
Cloudflare R2 in production. All credentials are injected at runtime — never
hardcoded.

| Variable | Default | Notes |
|---|---|---|
| `OBJECT_STORAGE_ACCESS_KEY_ID` | — | R2 API token access key ID |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | — | R2 API token secret access key |
| `OBJECT_STORAGE_HOST` | — | R2 S3 endpoint: `<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `OBJECT_STORAGE_BUCKET` | `heyi-am-sessions` | R2 bucket name |
| `OBJECT_STORAGE_SCHEME` | `https://` | Leave as default for R2 |
| `OBJECT_STORAGE_PORT` | `443` | Leave as default for R2 |

#### R2 Setup

1. In the Cloudflare dashboard, go to **R2** and create a bucket (e.g. `heyi-am-sessions`)
2. Create an **R2 API token** with read/write permissions scoped to that bucket
3. Copy the **Access Key ID** and **Secret Access Key** from the token
4. Your account's S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` — set `OBJECT_STORAGE_HOST` to just the host part (without `https://`)
5. Find your Account ID in the Cloudflare dashboard URL or the R2 overview page

The app uses path-style bucket access (`/bucket/key`), which is the default for R2.

Presigned URLs expire after 15 minutes (configurable via `presign_expires_in`
in the app config). The `OBJECT_STORAGE_SECRET_ACCESS_KEY` is never logged or
returned in API responses.

### Email (Amazon SES) — optional

| Variable | Default | Notes |
|---|---|---|
| `SES_ACCESS_KEY_ID` | — | IAM access key with `ses:SendEmail` permission |
| `SES_SECRET_ACCESS_KEY` | — | IAM secret key |
| `SES_REGION` | `us-east-1` | AWS region where SES is configured |

When these are unset, the app falls back to `Swoosh.Adapters.Local` (emails are logged but not sent). Verify your sending domain is verified in SES before deploying.

### Other optional

| Variable | Default | Notes |
|---|---|---|
| `PUBLIC_PORT` | `4000` | public_web HTTP listen port |
| `APP_PORT` | `4001` | app_web HTTP listen port |
| `VIBE_PORT` | `4002` | vibe_web HTTP listen port |
| `POOL_SIZE` | `10` | Ecto connection pool size |
| `ECTO_IPV6` | — | Set to `true` if your Postgres needs IPv6 |

## 3. Network / Ports / Domains

Coolify's built-in Traefik proxy handles HTTPS termination and domain-to-port routing.

The container listens on three ports: `4000` (public_web), `4001` (app_web), `4002` (vibe_web).

### Domains Tab

In the Coolify **Domains** field, use comma-separated entries with the port after the domain:

```
https://heyi.am:4000,https://heyiam.com:4001,https://howdoyouvibe.com:4002
```

This tells Traefik: route `heyi.am` traffic to container port 4000, `heyiam.com` to 4001, and `howdoyouvibe.com` to 4002. Traefik provisions TLS certs for all three via Let's Encrypt automatically.

### DNS Setup

All three domains need A records pointing at your Coolify server IP:

```
heyi.am             A  → <server-ip>
heyiam.com          A  → <server-ip>
howdoyouvibe.com    A  → <server-ip>
```

### Security Model

- **heyi.am** (port 4000) — public portfolios. Serves pre-rendered HTML from DB. Strict CSP (`script-src 'self'`). No session cookies, no CSRF.
- **heyiam.com** (port 4001) — auth, API, settings, LiveView. Session cookies scoped to `heyiam.com` only. CSRF protection on all forms.
- **howdoyouvibe.com** (port 4002) — anonymous vibes. No session cookies, no auth.

XSS in user-generated portfolio HTML cannot steal auth cookies (different registrable domain = complete cookie isolation).

## 4. Health Check

The Dockerfile includes a `HEALTHCHECK` that curls the app_web landing page:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:4001/ || exit 1
```

Coolify uses this automatically to determine when the container is ready for traffic.

## 5. Database Migrations

Migrations run automatically on container startup. The Dockerfile CMD runs `bin/migrate` before starting the server:

```dockerfile
CMD ["/bin/sh", "-c", "/app/bin/migrate && /app/bin/server"]
```

The migration infrastructure:
- `rel/overlays/bin/migrate` — shell script that calls `HeyiAm.Release.migrate`
- `apps/heyi_am/lib/heyi_am/release.ex` — Elixir module that runs `Ecto.Migrator`

No Coolify pre-deploy command is needed — migrations are handled by the container entrypoint.

## 6. Docker Build Optimization

The Dockerfile uses a multi-stage build optimized for layer caching:

1. **Dependencies first** — all `mix.exs` and `mix.lock` are copied before app code, so `mix deps.get` and `mix deps.compile` are cached unless dependencies change.
2. **Config before code** — compile-time config (`config.exs`, `prod.exs`) is copied before `apps/`, so config-only changes don't invalidate the deps cache.
3. **Code compilation** — all four umbrella apps are compiled together.
4. **Assets** — npm dependencies are installed for `app_web` (React for LiveView islands), then `mix assets.deploy` runs esbuild for all web apps (JS + CSS) and `phx.digest` for fingerprinting.
5. **Release** — `mix release heyi_am` bundles all four apps into a single OTP release.
6. **Slim runtime** — the final image is a bare Debian slim with only runtime dependencies (no Elixir, no build tools).

To maximize cache hits in Coolify:
- Enable **Docker BuildKit** (Coolify v4 does this by default)
- If available, enable **Build Cache** in the resource settings — this persists layer cache between deploys

The `.dockerignore` excludes `_build/`, `deps/`, `node_modules/`, and `test/` to keep the build context small.

## 7. Deploy

Push to your configured branch. Coolify will:

1. Pull the repo
2. Build the Docker image from `/heyi_am_umbrella/Dockerfile`
3. Start the container (runs migrations, then `bin/server` sets `PHX_SERVER=true` and starts the BEAM)
4. Route traffic once the health check passes

## 8. Production Tuning

### BEAM VM Flags

Add `ERL_FLAGS` to your environment variables. These optimize how the Erlang VM runs inside a container:

```
ERL_FLAGS=+K true +Q 65536 +P 1048576 +A 32 +sbwt none +sbwtdcpu none +sbwtdio none
```

| Flag | What it does |
|------|-------------|
| `+K true` | Use epoll for I/O polling (faster than default) |
| `+Q 65536` | Allow up to 65k open ports/connections. Match to your ulimit |
| `+P 1048576` | Allow up to 1M lightweight BEAM processes |
| `+A 32` | 32 async I/O threads (default is 1) |
| `+sbwt none` | **Important for containers**: stops busy-waiting when idle, prevents wasted CPU |

### HTTP Listener Tuning

The app reads these optional env vars to configure Bandit (the HTTP server):

| Variable | Default | Notes |
|---|---|---|
| `HTTP_NUM_ACCEPTORS` | `100` | Number of concurrent accept loops. Default is fine for most loads |

### Container ulimits

The BEAM needs file descriptors for every connection. Docker defaults are too low. In Coolify, set container ulimits:

```
nofile soft: 65536
nofile hard: 65536
```

Or set it server-wide in `/etc/docker/daemon.json`:

```json
{
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 }
  }
}
```

> **Important**: `+Q` in ERL_FLAGS must not exceed your `nofile` ulimit.

### Linux Kernel Tuning (optional)

On the Coolify server, create `/etc/sysctl.d/99-heyi-am.conf`:

```ini
fs.file-max = 1048576
fs.nr_open = 1048576
net.core.somaxconn = 32768
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
vm.swappiness = 1
```

Apply with `sudo sysctl --system`. No reboot needed.

## Quick Reference: All Environment Variables (raw)

Copy-paste into Coolify's **Developer** / raw env editor:

```env
# Required
DATABASE_URL=ecto://user:pass@host:5432/heyi_am_prod
SECRET_KEY_BASE=
PHX_HOST=heyi.am
PUBLIC_HOST=heyi.am
APP_HOST=heyiam.com
VIBE_HOST=howdoyouvibe.com
PHX_SERVER=true

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# OpenTelemetry / Signoz (optional)
OTEL_ENDPOINT=http://signoz-otel-collector:4318

# Umami Analytics (optional, per-app website IDs)
UMAMI_SCRIPT_URL=https://analytics.example.com/script.js
UMAMI_PUBLIC_WEBSITE_ID=
UMAMI_APP_WEBSITE_ID=
UMAMI_VIBE_WEBSITE_ID=

# LLM Proxy (optional)
LLM_PROVIDER=gemini
GEMINI_API_KEY=
LLM_ANTHROPIC_API_KEY=
LLM_GEMINI_MODEL=gemini-2.5-flash
LLM_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
LLM_MONTHLY_QUOTA=10

# Object Storage (Cloudflare R2)
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_HOST=
OBJECT_STORAGE_BUCKET=heyi-am-sessions
OBJECT_STORAGE_SCHEME=https://
OBJECT_STORAGE_PORT=443

# Email (Amazon SES, optional)
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
SES_REGION=us-east-1

# BEAM / HTTP tuning
ERL_FLAGS=+K true +Q 65536 +P 1048576 +A 32 +sbwt none +sbwtdcpu none +sbwtdio none
HTTP_NUM_ACCEPTORS=100

# Ports (optional, defaults shown)
PUBLIC_PORT=4000
APP_PORT=4001
VIBE_PORT=4002

# Other optional
POOL_SIZE=10
ECTO_IPV6=
```

## Generating SECRET_KEY_BASE

If you don't have Elixir installed locally:

```bash
docker run --rm hexpm/elixir:1.18.3-erlang-27.3.3-alpine-3.21.3 \
  sh -c "mix local.hex --force > /dev/null && mix phx.gen.secret"
```
