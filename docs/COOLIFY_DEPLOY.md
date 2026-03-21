# Deploying heyi.am to Coolify

## Prerequisites

- A Coolify instance (v4+)
- A PostgreSQL database (provision one inside Coolify or use an external provider)
- Your repo pushed to GitHub/GitLab (Coolify pulls from git)

## 1. Create a New Resource

1. In Coolify, click **New Resource** > **Application** > select your Git repo.
2. Set **Build Pack** to **Dockerfile**.
3. Set **Dockerfile Location** to `phoenix/Dockerfile` (relative to repo root).
4. Set **Build Context** to `phoenix/` so Docker sees the right working directory.

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

### Object Storage (SeaweedFS)

heyi.am uses an S3-compatible store for session recording files. SeaweedFS is
recommended — it's a one-click deploy on Coolify. All credentials are injected
at runtime — never hardcoded.

| Variable | Default | Notes |
|---|---|---|
| `OBJECT_STORAGE_ACCESS_KEY_ID` | — | S3 access key ID (from SeaweedFS config) |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | — | S3 secret access key |
| `OBJECT_STORAGE_HOST` | — | Hostname of your SeaweedFS S3 gateway, e.g. `s3.internal.example.com` |
| `OBJECT_STORAGE_BUCKET` | `heyi-am-sessions` | Bucket name |
| `OBJECT_STORAGE_SCHEME` | `https://` | Use `http://` only on a private network |
| `OBJECT_STORAGE_PORT` | `443` | Port; SeaweedFS S3 gateway defaults to `8333` |

The app uses path-style bucket access (`/bucket/key`). Create the bucket before
the first deploy using the AWS CLI or any S3-compatible tool pointed at your
SeaweedFS instance:

```bash
aws --endpoint-url http://your-seaweedfs:8333 s3 mb s3://heyi-am-sessions
```

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

- Set the **Exposed Port** to `4000` (matches the Dockerfile `EXPOSE`).
- Coolify's built-in Traefik proxy will handle HTTPS termination. Make sure your domain is configured.

## 4. Health Check

The Dockerfile includes a `HEALTHCHECK` on `GET /`. Coolify will use this automatically.

## 5. Database Migrations

Migrations need to run on each deploy. The recommended approach is to use Ecto's release migration support.

Create `phoenix/rel/overlays/bin/migrate`:

```sh
#!/bin/sh
set -eu
/app/bin/heyi_am eval "HeyiAm.Release.migrate()"
```

And add `lib/heyi_am/release.ex`:

```elixir
defmodule HeyiAm.Release do
  @app :heyi_am

  def migrate do
    load_app()
    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  defp repos, do: Application.fetch_env!(@app, :ecto_repos)
  defp load_app, do: Application.ensure_all_started(:ssl)
end
```

Then in Coolify, set **Pre-deploy Command** to:

```
/app/bin/migrate
```

This runs migrations before the new container starts receiving traffic.

## 6. Deploy

Push to your configured branch. Coolify will:

1. Pull the repo
2. Build the Docker image from `phoenix/Dockerfile`
3. Run the pre-deploy migration command
4. Start the container
5. Route traffic once the health check passes

## Generating SECRET_KEY_BASE

If you don't have Elixir installed locally:

```bash
docker run --rm hexpm/elixir:1.18.2-erlang-27.2.4-alpine-3.21.3 \
  sh -c "mix local.hex --force > /dev/null && mix phx.gen.secret"
```
