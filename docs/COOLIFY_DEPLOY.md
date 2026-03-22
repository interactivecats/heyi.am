# Deploying heyi.am to Coolify

## Prerequisites

- A Coolify instance (v4+)
- A PostgreSQL database (provision one inside Coolify or use an external provider)
- Your repo pushed to GitHub/GitLab (Coolify pulls from git)

## 1. Create a New Resource

1. In Coolify, click **New Resource** > **Application** > select your Git repo.
2. Set **Build Pack** to **Dockerfile**.
3. Set **Base Directory** to `/phoenix` — this scopes the build to the Phoenix app directory.
4. Set **Dockerfile Location** to `/Dockerfile` (relative to the base directory).
5. Set **Ports Exposes** to `4000`.

## 2. Environment Variables

Add these in the Coolify **Environment Variables** tab:

### Required

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `ecto://user:pass@host:5432/heyi_am_prod` | Use the Coolify-managed Postgres connection string |
| `SECRET_KEY_BASE` | *(64+ char random string)* | Generate with `mix phx.gen.secret` |
| `PHX_HOST` | `heyi.am` | Your public domain |
| `PHX_SERVER` | `true` | Starts the HTTP listener |

### GitHub OAuth

| Variable | Example |
|---|---|
| `GITHUB_CLIENT_ID` | `Iv1.abc123` |
| `GITHUB_CLIENT_SECRET` | `ghp_...` |

### OpenTelemetry / Signoz (optional)

| Variable | Example | Notes |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://signoz-otel-collector:4318` | OTLP HTTP endpoint of your Signoz collector |

When this variable is unset, tracing is disabled (no overhead). Set Signoz retention to 60 days max for GDPR compliance.

### Umami Analytics (optional)

| Variable | Example |
|---|---|
| `UMAMI_SCRIPT_URL` | `https://analytics.example.com/script.js` |
| `UMAMI_WEBSITE_ID` | `a1b2c3d4-...` |

When these are unset, no analytics script is injected.

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

heyi.am uses an S3-compatible store for session recording files. We use
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

### Other optional

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | HTTP listen port |
| `POOL_SIZE` | `10` | Ecto connection pool size |
| `ECTO_IPV6` | — | Set to `true` if your Postgres needs IPv6 |

## 3. Network / Ports

- Coolify's built-in Traefik proxy handles HTTPS termination. Configure your domain in the **Domains** tab.
- The container listens on port `4000` (set in step 1).

## 4. Health Check

The Dockerfile includes a `HEALTHCHECK` on `GET /`. Coolify uses this automatically to determine when the container is ready for traffic.

## 5. Database Migrations

Migrations run automatically on each deploy via the release migration overlay.

The migration infrastructure is already in place:
- `rel/overlays/bin/migrate` — shell script that calls the release migration task
- `lib/heyi_am/release.ex` — Elixir module that runs `Ecto.Migrator`

In Coolify, set **Pre-deploy Command** to:

```
/app/bin/migrate
```

This runs migrations before the new container starts receiving traffic.

## 6. Docker Build Optimization

The Dockerfile uses a multi-stage build optimized for layer caching:

1. **Dependencies first** — `mix.exs` and `mix.lock` are copied before app code, so `mix deps.get` and `mix deps.compile` are cached unless dependencies change.
2. **Config before code** — compile-time config is copied before `lib/`, so config-only changes don't invalidate the deps cache.
3. **Assets last** — `assets/` are copied and built after Elixir compilation, keeping the two pipelines independent.
4. **Slim runtime** — the final image is a bare Debian slim with only runtime dependencies (no Elixir, no build tools).

To maximize cache hits in Coolify:
- Enable **Docker BuildKit** (Coolify v4 does this by default)
- If available, enable **Build Cache** in the resource settings — this persists layer cache between deploys

The `.dockerignore` excludes `_build/`, `deps/`, `node_modules/`, and `test/` to keep the build context small.

## 7. Deploy

Push to your configured branch. Coolify will:

1. Pull the repo
2. Build the Docker image from `/phoenix/Dockerfile`
3. Run the pre-deploy migration command (`/app/bin/migrate`)
4. Start the container
5. Route traffic once the health check passes

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
| `HTTP_MAX_CONNECTIONS` | `16384` | Max simultaneous connections. Raise for high-traffic or many LiveView sessions |

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
PHX_SERVER=true

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# OpenTelemetry / Signoz (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-otel-collector:4318

# Umami Analytics (optional)
UMAMI_SCRIPT_URL=https://analytics.example.com/script.js
UMAMI_WEBSITE_ID=

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

# BEAM / HTTP tuning
ERL_FLAGS=+K true +Q 65536 +P 1048576 +A 32 +sbwt none +sbwtdcpu none +sbwtdio none
HTTP_NUM_ACCEPTORS=100
HTTP_MAX_CONNECTIONS=16384

# Other optional
PORT=4000
POOL_SIZE=10
ECTO_IPV6=
```

## Generating SECRET_KEY_BASE

If you don't have Elixir installed locally:

```bash
docker run --rm hexpm/elixir:1.18.2-erlang-27.2.4-alpine-3.21.3 \
  sh -c "mix local.hex --force > /dev/null && mix phx.gen.secret"
```
