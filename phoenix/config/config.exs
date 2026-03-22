# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :heyi_am, :scopes,
  user: [
    default: true,
    module: HeyiAm.Accounts.Scope,
    assign_key: :current_scope,
    access_path: [:user, :id],
    schema_key: :user_id,
    schema_type: :id,
    schema_table: :users,
    test_data_fixture: HeyiAm.AccountsFixtures,
    test_setup_helper: :register_and_log_in_user
  ]

config :heyi_am,
  ecto_repos: [HeyiAm.Repo],
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :heyi_am, HeyiAmWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: HeyiAmWeb.ErrorHTML, json: HeyiAmWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: HeyiAm.PubSub,
  live_view: [signing_salt: "p58Wlwha"]

# Configure the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :heyi_am, HeyiAm.Mailer, adapter: Swoosh.Adapters.Local

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Configure esbuild (the version is required)
config :esbuild,
  version: "0.25.4",
  heyi_am: [
    args: ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets/js
      --external:/fonts/* --external:/images/*
      --loader:.tsx=tsx --loader:.jsx=jsx),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => Path.expand("../deps", __DIR__)}
  ],
  css: [
    args: ~w(css/app.css --bundle --outdir=../priv/static/assets/css),
    cd: Path.expand("../assets", __DIR__)
  ]

# Configure Ueberauth for GitHub OAuth
config :ueberauth, Ueberauth,
  providers: [
    github: {Ueberauth.Strategy.Github, [default_scope: "user:email"]}
  ]

# Configure Hammer rate limiter
config :hammer,
  backend: {Hammer.Backend.ETS,
            [expiry_ms: 60_000 * 60 * 4,
             cleanup_interval_ms: 60_000 * 10]}

# OpenTelemetry — disabled by default, enabled via OTEL_EXPORTER_OTLP_ENDPOINT at runtime
config :opentelemetry,
  resource: [service: [name: "heyi-am"]],
  span_processor: :batch,
  traces_exporter: :none

# ExAws — use Jason for JSON decoding (e.g. STS responses)
config :ex_aws, json_codec: Jason

# Object storage — defaults used in dev; overridden per environment below
config :heyi_am, HeyiAm.ObjectStorage,
  bucket: "heyi-am-sessions",
  presign_expires_in: 900

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
