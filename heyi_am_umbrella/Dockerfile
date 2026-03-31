# --- Build stage ---
ARG BUILDER_IMAGE="docker.io/hexpm/elixir:1.18.3-erlang-27.3.3-debian-bookworm-20250407-slim"
ARG RUNNER_IMAGE="docker.io/debian:bookworm-20250407-slim"

FROM ${BUILDER_IMAGE} AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential git nodejs npm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mix local.hex --force && mix local.rebar --force

ENV MIX_ENV="prod"

# --- Dependencies (cached unless mix files change) ---
COPY mix.exs mix.lock ./
COPY apps/heyi_am/mix.exs apps/heyi_am/
COPY apps/heyi_am_public_web/mix.exs apps/heyi_am_public_web/
COPY apps/heyi_am_app_web/mix.exs apps/heyi_am_app_web/
COPY apps/heyi_am_vibe_web/mix.exs apps/heyi_am_vibe_web/

RUN mix deps.get --only $MIX_ENV

# --- Config (cached unless config changes) ---
COPY config/config.exs config/prod.exs config/
RUN mix deps.compile

# Install esbuild binary
RUN mix esbuild.install --if-missing

# --- App code ---
COPY apps apps

RUN mix compile

# --- Assets ---
# Install npm deps for app_web (React for LiveView islands)
RUN cd apps/heyi_am_app_web/assets && npm install

# Build and digest all static assets
RUN mix assets.deploy

# --- Release ---
COPY config/runtime.exs config/
COPY rel rel

RUN mix release heyi_am

# --- Runtime stage ---
FROM ${RUNNER_IMAGE} AS final

RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 locales ca-certificates curl librsvg2-bin fonts-jetbrains-mono \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -f

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8
ENV MIX_ENV="prod"

WORKDIR /app
RUN chown nobody /app

COPY --from=builder --chown=nobody:root /app/_build/prod/rel/heyi_am ./

USER nobody

EXPOSE 4000 4001 4002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:4001/ || exit 1

CMD ["/bin/sh", "-c", "/app/bin/migrate && /app/bin/server"]
