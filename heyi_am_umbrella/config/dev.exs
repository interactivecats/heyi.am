import Config

# ── Database ─────────────────────────────────────────────────

if database_url = System.get_env("DATABASE_URL") do
  config :heyi_am, HeyiAm.Repo,
    url: database_url,
    stacktrace: true,
    show_sensitive_data_on_connection_error: true,
    pool_size: 10
else
  config :heyi_am, HeyiAm.Repo,
    username: "postgres",
    password: "postgres",
    hostname: "localhost",
    database: "heyi_am_dev",
    stacktrace: true,
    show_sensitive_data_on_connection_error: true,
    pool_size: 10
end

# ── Dev shared ───────────────────────────────────────────────

dev_secret_key_base = "e9OPp6ipXBwRBRpQlq9Cw0HhPMEFhBI8lfYVYOfrmOj0KxLqTtfJwpWjRsJjLZuy"
dev_ip = if(System.get_env("PHX_IP") == "0.0.0.0", do: {0, 0, 0, 0}, else: {127, 0, 0, 1})

# ── Public web (port 4000) ───────────────────────────────────

config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint,
  http: [ip: dev_ip, port: 4000],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: dev_secret_key_base,
  watchers: [
    esbuild_css: {Esbuild, :install_and_run, [:heyi_am_public_web_css, ~w(--sourcemap=inline --watch)]}
  ]

config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint,
  live_reload: [
    patterns: [
      ~r"priv/static/(?!uploads/).*\.(js|css|png|jpeg|jpg|gif|svg)$",
      ~r"lib/heyi_am_public_web/(controllers|components)/.*\.(ex|heex)$"
    ]
  ]

# ── App web (port 4001) ──────────────────────────────────────

config :heyi_am_app_web, HeyiAmAppWeb.Endpoint,
  http: [ip: dev_ip, port: 4001],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: dev_secret_key_base,
  watchers: [
    esbuild: {Esbuild, :install_and_run, [:heyi_am_app_web, ~w(--sourcemap=inline --watch)]},
    esbuild_css: {Esbuild, :install_and_run, [:heyi_am_app_web_css, ~w(--sourcemap=inline --watch)]}
  ]

config :heyi_am_app_web, HeyiAmAppWeb.Endpoint,
  live_reload: [
    web_console_logger: true,
    patterns: [
      ~r"priv/static/(?!uploads/).*\.(js|css|png|jpeg|jpg|gif|svg)$",
      ~r"lib/heyi_am_app_web/(controllers|live|components)/.*\.(ex|heex)$"
    ]
  ]

# ── Vibe web (port 4002) ─────────────────────────────────────

config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint,
  http: [ip: dev_ip, port: 4002],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: dev_secret_key_base,
  watchers: [
    esbuild_css: {Esbuild, :install_and_run, [:heyi_am_vibe_web_css, ~w(--sourcemap=inline --watch)]}
  ]

config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint,
  live_reload: [
    patterns: [
      ~r"priv/static/(?!uploads/).*\.(js|css|png|jpeg|jpg|gif|svg)$",
      ~r"lib/heyi_am_vibe_web/(controllers|components)/.*\.(ex|heex)$"
    ]
  ]

config :heyi_am_vibe_web, narrative_rate_limit: 500

# ── Dev-only settings ────────────────────────────────────────

config :heyi_am_app_web, dev_routes: true

config :logger, :default_formatter, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime

config :opentelemetry, traces_exporter: :none

config :phoenix_live_view,
  debug_heex_annotations: true,
  debug_attributes: true,
  enable_expensive_runtime_checks: true

config :swoosh, :api_client, false

# Object Storage (SeaweedFS)
config :ex_aws,
  access_key_id: System.get_env("OBJECT_STORAGE_ACCESS_KEY_ID", "heyi_admin"),
  secret_access_key: System.get_env("OBJECT_STORAGE_SECRET_ACCESS_KEY", "heyi_secret_key"),
  s3: [
    scheme: System.get_env("OBJECT_STORAGE_SCHEME", "http://"),
    host: System.get_env("OBJECT_STORAGE_HOST", "localhost"),
    port: String.to_integer(System.get_env("OBJECT_STORAGE_PORT", "8333")),
    virtual_hosted_style_bucket: false
  ]

config :heyi_am, HeyiAm.ObjectStorage,
  bucket: System.get_env("OBJECT_STORAGE_BUCKET", "heyi-am-sessions"),
  external_endpoint: [
    scheme: System.get_env("OBJECT_STORAGE_EXTERNAL_SCHEME", "http://"),
    host: System.get_env("OBJECT_STORAGE_EXTERNAL_HOST", "localhost"),
    port: String.to_integer(System.get_env("OBJECT_STORAGE_EXTERNAL_PORT", "8333"))
  ]
