defmodule HeyiAmPublicWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :heyi_am_public_web

  # NO @session_options — this endpoint has no sessions
  # NO socket "/live" — this endpoint has no LiveView

  plug Plug.Static,
    at: "/",
    from: :heyi_am_public_web,
    gzip: not code_reloading?,
    only: HeyiAmPublicWeb.static_paths(),
    raise_on_missing_only: code_reloading?

  if code_reloading? do
    socket "/phoenix/live_reload/socket", Phoenix.LiveReloader.Socket
    plug Phoenix.LiveReloader
    plug Phoenix.CodeReloader
  end

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head

  # NO Plug.Session — this is a public-only endpoint with no auth cookies

  plug HeyiAmPublicWeb.Router
end
