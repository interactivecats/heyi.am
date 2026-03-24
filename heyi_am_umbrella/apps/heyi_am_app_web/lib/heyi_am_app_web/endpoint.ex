defmodule HeyiAmAppWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :heyi_am_app_web

  @session_options [
    store: :cookie,
    key: "_heyi_am_app_web_key",
    signing_salt: "mQDCBKnW",
    same_site: "Lax",
    secure: Mix.env() == :prod,
    http_only: true
  ]

  socket "/live", Phoenix.LiveView.Socket,
    websocket: [connect_info: [session: @session_options]],
    longpoll: [connect_info: [session: @session_options]]

  plug Plug.Static,
    at: "/",
    from: :heyi_am_app_web,
    gzip: not code_reloading?,
    only: HeyiAmAppWeb.static_paths(),
    raise_on_missing_only: code_reloading?

  if code_reloading? do
    socket "/phoenix/live_reload/socket", Phoenix.LiveReloader.Socket
    plug Phoenix.LiveReloader
    plug Phoenix.CodeReloader
    plug Phoenix.Ecto.CheckRepoStatus, otp_app: :heyi_am
  end

  plug Phoenix.LiveDashboard.RequestLogger,
    param_key: "request_logger",
    cookie_key: "request_logger"

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    length: 8_000_000,
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug HeyiAmAppWeb.Router
end
