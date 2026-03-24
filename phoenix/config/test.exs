import Config

# Only in tests, remove the complexity from the password hashing algorithm
config :bcrypt_elixir, :log_rounds, 1

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
# DATABASE_URL overrides defaults when running in docker-compose
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

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :heyi_am, HeyiAmWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "7FPRi+AD4mu5k8FSS5kXuKJ8yktg0BJtid3Y7TgMARU+aAP45zbyqR52d/xAjxJ9",
  server: false

# In test we don't send emails
config :heyi_am, HeyiAm.Mailer, adapter: Swoosh.Adapters.Test

# Disable swoosh api client as it is only required for production adapters
config :swoosh, :api_client, false

# Dummy GitHub OAuth config for test
config :ueberauth, Ueberauth.Strategy.Github.OAuth,
  client_id: "test_client_id",
  client_secret: "test_client_secret"

# Use mock LLM provider in tests
config :heyi_am, HeyiAm.LLM, provider: "mock", monthly_quota: 10

# Use mock object storage adapter in tests — never touches a real S3 endpoint
config :heyi_am, HeyiAm.ObjectStorage,
  adapter: HeyiAm.ObjectStorage.Mock

# Disable host-based routing in tests (no /etc/hosts needed)
config :heyi_am, public_host: nil
config :heyi_am, app_host: nil

# Disable rate limiting in tests (tested explicitly in rate_limit_test.exs)
config :heyi_am, rate_limiting_enabled: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Enable helpful, but potentially expensive runtime checks
config :phoenix_live_view,
  enable_expensive_runtime_checks: true

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
