defmodule HeyiAmWeb.Plugs.CORS do
  @moduledoc """
  CORS for the API. Only allows requests from the local CLI app.
  """
  import Plug.Conn

  @allowed_origins [
    "http://localhost:51778",
    "http://127.0.0.1:51778",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]

  def init(opts), do: opts

  def call(conn, _opts) do
    origin = get_req_header(conn, "origin") |> List.first()

    if origin in @allowed_origins do
      conn
      |> put_resp_header("access-control-allow-origin", origin)
      |> put_resp_header("access-control-allow-methods", "GET, POST, DELETE, OPTIONS")
      |> put_resp_header(
        "access-control-allow-headers",
        "authorization, content-type, x-delete-token, x-machine-token, x-signature, x-api-key"
      )
      |> put_resp_header("vary", "Origin")
      |> handle_preflight()
    else
      handle_preflight(conn)
    end
  end

  defp handle_preflight(%{method: "OPTIONS"} = conn) do
    conn |> send_resp(204, "") |> halt()
  end

  defp handle_preflight(conn), do: conn
end
