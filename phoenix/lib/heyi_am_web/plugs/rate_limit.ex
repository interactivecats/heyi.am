defmodule HeyiAmWeb.Plugs.RateLimit do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, opts) do
    if Application.get_env(:heyi_am, :rate_limiting_enabled, true) == false do
      conn
    else
      do_rate_limit(conn, opts)
    end
  end

  defp do_rate_limit(conn, opts) do
    limit = Keyword.fetch!(opts, :limit)
    period = Keyword.get(opts, :period, 60_000)
    bucket = bucket_key(conn, Keyword.fetch!(opts, :action))

    case Hammer.check_rate(bucket, period, limit) do
      {:allow, _count} ->
        conn

      {:deny, _limit} ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(429, Jason.encode!(%{error: %{code: "RATE_LIMITED", message: "Too many requests. Try again later."}}))
        |> halt()
    end
  end

  defp bucket_key(conn, action) do
    ip =
      conn.remote_ip
      |> :inet.ntoa()
      |> to_string()

    "rate_limit:#{action}:#{ip}"
  end
end
