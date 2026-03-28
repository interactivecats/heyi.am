defmodule HeyiAmVibeWeb.Plugs.RateLimit do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, opts) do
    if Application.get_env(:heyi_am_vibe_web, :rate_limiting_enabled, true) == false do
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
        retry_after = div(period, 1_000)

        conn = put_resp_header(conn, "retry-after", to_string(retry_after))

        accepts_html =
          case get_req_header(conn, "accept") do
            [accept | _] -> String.contains?(accept, "text/html")
            _ -> false
          end

        if accepts_html do
          conn
          |> put_resp_content_type("text/html")
          |> send_resp(429, "Too many requests. Try again in #{retry_after}s.")
          |> halt()
        else
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(429, Jason.encode!(%{
            error: %{
              code: "RATE_LIMITED",
              message: "Too many requests.",
              retry_after: retry_after
            }
          }))
          |> halt()
        end
    end
  end

  defp bucket_key(conn, action) do
    ip =
      case get_req_header(conn, "x-forwarded-for") do
        [forwarded | _] ->
          forwarded |> String.split(",") |> List.first() |> String.trim()

        _ ->
          conn.remote_ip |> :inet.ntoa() |> to_string()
      end

    "rate_limit:#{action}:#{ip}"
  end
end
