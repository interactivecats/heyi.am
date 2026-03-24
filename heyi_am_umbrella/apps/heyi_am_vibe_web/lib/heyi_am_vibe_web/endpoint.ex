defmodule HeyiAmVibeWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :heyi_am_vibe_web

  # No Plug.Session — vibes are anonymous
  # No LiveView socket — no interactive features

  plug Plug.Static,
    at: "/",
    from: :heyi_am_vibe_web,
    gzip: not code_reloading?,
    only: HeyiAmVibeWeb.static_paths(),
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
  plug HeyiAmVibeWeb.Router
end
