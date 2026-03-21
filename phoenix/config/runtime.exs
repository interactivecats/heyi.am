import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/heyi_am start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :heyi_am, HeyiAmWeb.Endpoint, server: true
end

# Umami analytics — only active when both env vars are set
if umami_url = System.get_env("UMAMI_SCRIPT_URL") do
  config :heyi_am, umami_script_url: umami_url
  config :heyi_am, umami_website_id: System.get_env("UMAMI_WEBSITE_ID")
end

# LLM proxy — server-side AI enhancement (skipped in test; configured in test.exs)
if config_env() != :test do
  config :heyi_am, HeyiAm.LLM,
    provider: System.get_env("LLM_PROVIDER", "gemini"),
    gemini_api_key: System.get_env("GEMINI_API_KEY"),
    anthropic_api_key: System.get_env("LLM_ANTHROPIC_API_KEY"),
    gemini_model: System.get_env("LLM_GEMINI_MODEL", "gemini-2.5-flash"),
    anthropic_model: System.get_env("LLM_ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
    monthly_quota: String.to_integer(System.get_env("LLM_MONTHLY_QUOTA", "10"))
end

# OpenTelemetry — enable OTLP export when endpoint is configured (e.g. Signoz)
if otel_endpoint = System.get_env("OTEL_EXPORTER_OTLP_ENDPOINT") do
  config :opentelemetry,
    traces_exporter: {:otlp, endpoint: otel_endpoint}
end

# GitHub OAuth — required in prod, optional in dev/test
if client_id = System.get_env("GITHUB_CLIENT_ID") do
  client_secret =
    System.get_env("GITHUB_CLIENT_SECRET") ||
      raise "GITHUB_CLIENT_SECRET must be set when GITHUB_CLIENT_ID is present"

  config :ueberauth, Ueberauth.Strategy.Github.OAuth,
    client_id: client_id,
    client_secret: client_secret
end

config :heyi_am, HeyiAmWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))]

if config_env() == :prod do
  # Object Storage (Garage / S3-compatible) — credentials injected at runtime
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

  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :heyi_am, HeyiAm.Repo,
    # ssl: true,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    # For machines with several cores, consider starting multiple pools of `pool_size`
    # pool_count: 4,
    socket_options: maybe_ipv6

  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :heyi_am, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :heyi_am, HeyiAmWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://hexdocs.pm/bandit/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :heyi_am, HeyiAmWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://hexdocs.pm/plug/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :heyi_am, HeyiAmWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.

  # ## Configuring the mailer
  #
  # In production you need to configure the mailer to use a different adapter.
  # Here is an example configuration for Mailgun:
  #
  #     config :heyi_am, HeyiAm.Mailer,
  #       adapter: Swoosh.Adapters.Mailgun,
  #       api_key: System.get_env("MAILGUN_API_KEY"),
  #       domain: System.get_env("MAILGUN_DOMAIN")
  #
  # Most non-SMTP adapters require an API client. Swoosh supports Req, Hackney,
  # and Finch out-of-the-box. This configuration is typically done at
  # compile-time in your config/prod.exs:
  #
  #     config :swoosh, :api_client, Swoosh.ApiClient.Req
  #
  # See https://hexdocs.pm/swoosh/Swoosh.html#module-installation for details.
end
