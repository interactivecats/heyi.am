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
  live_view: [signing_salt: "qk986SVM"]

# Configure the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :heyi_am, HeyiAm.Mailer, adapter: Swoosh.Adapters.Local

# Configure esbuild (the version is required)
config :esbuild,
  version: "0.25.4",
  heyi_am: [
    args:
      ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets/js --external:/fonts/* --external:/images/* --alias:@=.),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path()]}
  ]

# Configure tailwind (the version is required)
config :tailwind,
  version: "4.1.12",
  heyi_am: [
    args: ~w(
      --input=assets/css/app.css
      --output=priv/static/assets/css/app.css
    ),
    cd: Path.expand("..", __DIR__)
  ]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# GitHub OAuth (keys set via env vars in runtime.exs)
config :ueberauth, Ueberauth,
  providers: [
    github: {Ueberauth.Strategy.Github, [default_scope: "user:email"]}
  ]

# Suppress Tesla deprecation warning
config :tesla, :adapter, {Tesla.Adapter.Hackney, []}

# MinIO / S3 storage
config :heyi_am, :storage,
  bucket: "heyi-public",
  public_base_url: "http://localhost:9000/heyi-public"

config :ex_aws,
  access_key_id: "heyi_admin",
  secret_access_key: "heyi_secret_key",
  region: "us-east-1",
  json_codec: Jason

config :ex_aws, :s3,
  scheme: "http://",
  host: "localhost",
  port: 9000

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
