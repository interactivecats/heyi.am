import Config

# ── Core app (:heyi_am) ──────────────────────────────────────

config :heyi_am, :scopes,
  accounts_user: [
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

config :heyi_am, HeyiAm.Mailer, adapter: Swoosh.Adapters.Local

config :heyi_am, HeyiAm.ObjectStorage,
  bucket: "heyi-am-sessions",
  presign_expires_in: 900

config :heyi_am, public_host: "heyi.am.localhost"
config :heyi_am, app_host: "heyiam.com.localhost"
config :heyi_am, vibe_host: "howdoyouvibe.com.localhost"

# ── Public web (:heyi_am_public_web) — heyi.am, port 4000 ───

config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: HeyiAmPublicWeb.ErrorHTML],
    layout: false
  ],
  pubsub_server: HeyiAm.PubSub

# ── App web (:heyi_am_app_web) — heyiam.com, port 4001 ──────

config :heyi_am_app_web,
  generators: [context_app: :heyi_am],
  public_url: "http://localhost:4000"

config :heyi_am_app_web, HeyiAmAppWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: HeyiAmAppWeb.ErrorHTML, json: HeyiAmAppWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: HeyiAm.PubSub,
  live_view: [signing_salt: "p58Wlwha"]

# ── Vibe web (:heyi_am_vibe_web) — howdoyouvibe.com, port 4002

config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: HeyiAmVibeWeb.ErrorHTML, json: HeyiAmVibeWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: HeyiAm.PubSub

# ── Shared deps config ───────────────────────────────────────

config :esbuild,
  version: "0.25.4",
  heyi_am_app_web: [
    args: ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets/js
      --external:/fonts/* --external:/images/*
      --loader:.tsx=tsx --loader:.jsx=jsx --jsx=automatic),
    cd: Path.expand("../apps/heyi_am_app_web/assets", __DIR__),
    env: %{"NODE_PATH" => Path.expand("../deps", __DIR__)}
  ],
  heyi_am_app_web_css: [
    args: ~w(css/app.css --bundle --outdir=../priv/static/assets/css),
    cd: Path.expand("../apps/heyi_am_app_web/assets", __DIR__)
  ],
  heyi_am_public_web_js: [
    args: ~w(js/app.js --bundle --outdir=../priv/static/assets/js),
    cd: Path.expand("../apps/heyi_am_public_web/assets", __DIR__)
  ],
  heyi_am_public_web_css: [
    args: ~w(css/app.css --bundle --outdir=../priv/static/assets/css),
    cd: Path.expand("../apps/heyi_am_public_web/assets", __DIR__)
  ],
  heyi_am_vibe_web_css: [
    args: ~w(css/app.css --bundle --outdir=../priv/static/assets/css),
    cd: Path.expand("../apps/heyi_am_vibe_web/assets", __DIR__)
  ],
  heyi_am_vibe_web_js: [
    args: ~w(js/app.js --bundle --outdir=../priv/static/assets/js),
    cd: Path.expand("../apps/heyi_am_vibe_web/assets", __DIR__)
  ]

config :ueberauth, Ueberauth,
  providers: [
    github: {Ueberauth.Strategy.Github, [default_scope: "user:email"]}
  ]

config :hammer,
  backend: {Hammer.Backend.ETS,
            [expiry_ms: 60_000 * 60 * 4,
             cleanup_interval_ms: 60_000 * 10]}

config :opentelemetry,
  span_processor: :batch,
  traces_exporter: :none

config :ex_aws, json_codec: Jason

config :phoenix, :json_library, Jason

config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

import_config "#{config_env()}.exs"
