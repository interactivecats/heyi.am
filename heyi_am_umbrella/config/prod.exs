import Config

# Force SSL on all three endpoints
ssl_opts = [
  rewrite_on: [:x_forwarded_proto],
  hsts: [max_age: 63_072_000, preload: true, include_subdomains: true],
  exclude: [hosts: ["localhost", "127.0.0.1"]]
]

config :heyi_am_public_web, HeyiAmPublicWeb.Endpoint,
  cache_static_manifest: "priv/static/cache_manifest.json",
  force_ssl: ssl_opts

config :heyi_am_app_web, HeyiAmAppWeb.Endpoint,
  cache_static_manifest: "priv/static/cache_manifest.json",
  force_ssl: ssl_opts

config :heyi_am_vibe_web, HeyiAmVibeWeb.Endpoint,
  cache_static_manifest: "priv/static/cache_manifest.json",
  force_ssl: ssl_opts

config :swoosh, api_client: Swoosh.ApiClient.Req
config :swoosh, local: false

config :logger, level: :info
