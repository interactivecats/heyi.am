import Config

# Only in tests, remove the complexity from the password hashing algorithm
config :bcrypt_elixir, :log_rounds, 1

config :bcrypt_elixir, :log_rounds, 1

# ── Database ─────────────────────────────────────────────────

if database_url = System.get_env("DATABASE_URL") do
  config :heyi_am, HeyiAm.Repo,
    url: database_url,
    pool: Ecto.Adapters.SQL.Sandbox,
    pool_size: System.schedulers_online() * 2
else
  config :heyi_am, HeyiAm.Repo,
    username: "postgres",
    password: "postgres",
    hostname: "localhost",
    database: "heyi_am_test#{System.get_env("MIX_TEST_PARTITION")}",
    pool: Ecto.Adapters.SQL.Sandbox,
    pool_size: System.schedulers_online() * 2
end

# ── Endpoints (no server in test) ────────────────────────────

test_secret = "7FPRi+AD4mu5k8FSS5kXuKJ8yktg0BJtid3Y7TgMARU+aAP45zbyqR52d/xAjxJ9"

config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: test_secret,
  server: false

config :heyi_am_app_web, HeyiAmAppWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4003],
  secret_key_base: test_secret,
  server: false

config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4004],
  secret_key_base: test_secret,
  server: false

# ── Test-only settings ───────────────────────────────────────

config :heyi_am, HeyiAm.Mailer, adapter: Swoosh.Adapters.Test
config :swoosh, :api_client, false

config :ueberauth, Ueberauth.Strategy.Github.OAuth,
  client_id: "test_client_id",
  client_secret: "test_client_secret"

config :heyi_am, HeyiAm.LLM, provider: "mock", monthly_quota: 10

config :heyi_am, HeyiAm.ObjectStorage,
  adapter: HeyiAm.ObjectStorage.Mock

config :heyi_am, public_host: nil
config :heyi_am, app_host: nil
config :heyi_am, vibe_host: nil

config :heyi_am, rate_limiting_enabled: false
config :heyi_am_vibe_web, rate_limiting_enabled: false

config :logger, level: :warning

config :phoenix, :plug_init_mode, :runtime

config :phoenix_live_view,
  enable_expensive_runtime_checks: true

config :phoenix,
  sort_verified_routes_query_params: true
