defmodule HeyiAmWeb.Plugs.EnforceHost do
  @moduledoc """
  In production, ensures requests arrive on the correct domain:
  - Public pages (portfolios, sessions, vibes) must be served from PUBLIC_HOST (heyi.am)
  - App pages (auth, settings, API) must be served from APP_HOST (heyiam.com)

  In dev/test (when hosts are nil), this plug is a no-op.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, expected: :public) do
    enforce(conn, Application.get_env(:heyi_am, :public_host))
  end

  def call(conn, expected: :app) do
    enforce(conn, Application.get_env(:heyi_am, :app_host))
  end

  defp enforce(conn, nil), do: conn  # dev/test: no enforcement

  defp enforce(conn, expected_host) do
    if conn.host == expected_host do
      conn
    else
      conn
      |> put_status(:not_found)
      |> Phoenix.Controller.put_view(HeyiAmWeb.ErrorHTML)
      |> Phoenix.Controller.render(:"404")
      |> halt()
    end
  end
end
