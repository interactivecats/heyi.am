import Config

config :heyi_am, env: config_env()

# ── Start servers when PHX_SERVER=true ───────────────────────

if System.get_env("PHX_SERVER") do
  config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint, server: true
  config :heyi_am_app_web, HeyiAmAppWeb.Endpoint, server: true
  config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint, server: true
end

# ── Umami analytics ──────────────────────────────────────────

if umami_url = System.get_env("UMAMI_SCRIPT_URL") do
  config :heyi_am, umami_script_url: umami_url
  config :heyi_am, umami_website_id: System.get_env("UMAMI_WEBSITE_ID")
end

# ── LLM proxy ────────────────────────────────────────────────

if config_env() != :test do
  config :heyi_am, HeyiAm.LLM,
    provider: System.get_env("LLM_PROVIDER", "gemini"),
    gemini_api_key: System.get_env("GEMINI_API_KEY"),
    anthropic_api_key: System.get_env("LLM_ANTHROPIC_API_KEY"),
    gemini_model: System.get_env("LLM_GEMINI_MODEL", "gemini-2.5-flash"),
    anthropic_model: System.get_env("LLM_ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
    monthly_quota: String.to_integer(System.get_env("LLM_MONTHLY_QUOTA", "10"))
end

# ── OpenTelemetry ────────────────────────────────────────────

if otel_endpoint = System.get_env("OTEL_ENDPOINT") do
  config :opentelemetry, :resource, service: %{name: "heyi-am"}

  config :opentelemetry, :processors,
    otel_batch_processor: %{
      exporter:
        {:opentelemetry_exporter,
         %{endpoints: [otel_endpoint]}}
    }
end

# ── GitHub OAuth ─────────────────────────────────────────────

if client_id = System.get_env("GITHUB_CLIENT_ID") do
  client_secret =
    System.get_env("GITHUB_CLIENT_SECRET") ||
      raise "GITHUB_CLIENT_SECRET must be set when GITHUB_CLIENT_ID is present"

  config :ueberauth, Ueberauth.Strategy.Github.OAuth,
    client_id: client_id,
    client_secret: client_secret
end

# ── Per-endpoint port config ─────────────────────────────────

config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PUBLIC_PORT", "4000"))]

config :heyi_am_app_web, HeyiAmAppWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("APP_PORT", "4001"))]

config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("VIBE_PORT", "4002"))]

# ── Production ───────────────────────────────────────────────

if config_env() == :prod do
  # Object Storage
  object_storage_access_key_id =
    System.get_env("OBJECT_STORAGE_ACCESS_KEY_ID") ||
      raise "OBJECT_STORAGE_ACCESS_KEY_ID must be set in production"

  object_storage_secret_access_key =
    System.get_env("OBJECT_STORAGE_SECRET_ACCESS_KEY") ||
      raise "OBJECT_STORAGE_SECRET_ACCESS_KEY must be set in production"

  object_storage_host =
    System.get_env("OBJECT_STORAGE_HOST") ||
      raise "OBJECT_STORAGE_HOST must be set in production"

  config :ex_aws,
    access_key_id: object_storage_access_key_id,
    secret_access_key: object_storage_secret_access_key,
    s3: [
      scheme: System.get_env("OBJECT_STORAGE_SCHEME", "https://"),
      host: object_storage_host,
      port: String.to_integer(System.get_env("OBJECT_STORAGE_PORT", "443")),
      virtual_hosted_style_bucket: false
    ]

  config :heyi_am, HeyiAm.ObjectStorage,
    bucket: System.get_env("OBJECT_STORAGE_BUCKET", "heyi-am-sessions")

  # Database
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :heyi_am, HeyiAm.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: maybe_ipv6

  # Secrets
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  public_host = System.get_env("PUBLIC_HOST") || "heyi.am"
  app_host = System.get_env("APP_HOST") || "heyiam.com"
  vibe_host = System.get_env("VIBE_HOST") || "howdoyouvibe.com"

  config :heyi_am, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")
  config :heyi_am, public_host: public_host
  config :heyi_am, app_host: app_host
  config :heyi_am, vibe_host: vibe_host

  shared_http = [
    ip: {0, 0, 0, 0, 0, 0, 0, 0},
    thousand_island_options: [
      num_acceptors: String.to_integer(System.get_env("HTTP_NUM_ACCEPTORS", "100"))
    ]
  ]

  config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint,
    url: [host: public_host, port: 443, scheme: "https"],
    http: shared_http,
    secret_key_base: secret_key_base

  config :heyi_am_app_web,
    public_url: "https://#{public_host}"

  config :heyi_am_app_web, HeyiAmAppWeb.Endpoint,
    url: [host: app_host, port: 443, scheme: "https"],
    check_origin: ["https://#{app_host}"],
    http: shared_http,
    secret_key_base: secret_key_base

  config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint,
    url: [host: vibe_host, port: 443, scheme: "https"],
    http: shared_http,
    secret_key_base: secret_key_base

  # Swoosh mailer for production (Amazon SES)
  if ses_key = System.get_env("SES_ACCESS_KEY_ID") do
    config :heyi_am, HeyiAm.Mailer,
      adapter: Swoosh.Adapters.AmazonSES,
      region: System.get_env("SES_REGION", "us-east-1"),
      access_key: ses_key,
      secret: System.get_env("SES_SECRET_ACCESS_KEY") ||
        raise("SES_SECRET_ACCESS_KEY must be set when SES_ACCESS_KEY_ID is present")
  end
end
