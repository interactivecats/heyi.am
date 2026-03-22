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

COPY mix.exs mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config

COPY config/config.exs config/${MIX_ENV}.exs config/
RUN mix deps.compile

# Install esbuild binary with deps (cached unless mix.exs changes)
RUN mix esbuild.install --if-missing

COPY priv priv
COPY lib lib

RUN mix compile

# Cache npm dependencies separately (only re-runs when package.json changes)
COPY assets/package.json assets/package-lock.json assets/
RUN cd assets && npm install && npm update @heyiam/ui
COPY assets assets
RUN rm -rf priv/static/assets && mix assets.deploy

COPY config/runtime.exs config/
COPY rel rel
RUN mix release

# --- Runtime stage ---
FROM ${RUNNER_IMAGE} AS final

RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 locales ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8
ENV MIX_ENV="prod"

WORKDIR /app
RUN chown nobody /app

COPY --from=builder --chown=nobody:root /app/_build/prod/rel/heyi_am ./

USER nobody

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD /app/bin/heyi_am pid || exit 1

CMD ["/app/bin/server"]
