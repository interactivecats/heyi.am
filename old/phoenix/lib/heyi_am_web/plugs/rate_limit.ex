defmodule HeyiAmWeb.Plugs.RateLimit do
  @moduledoc """
  Simple ETS-based rate limiter. No external deps.
  Limits by IP address within a time window.

  Includes probabilistic sweep of expired entries to prevent memory leaks.
  """
  import Plug.Conn

  @table :rate_limit_buckets
  # 1 in 100 requests triggers a sweep
  @sweep_probability 100

  def init(opts) do
    if :ets.whereis(@table) == :undefined do
      :ets.new(@table, [:set, :public, :named_table])
    end

    %{
      max_requests: Keyword.get(opts, :max_requests, 10),
      window_ms: Keyword.get(opts, :window_ms, 60_000),
      error_message: Keyword.get(opts, :error_message, "Too many requests")
    }
  end

  def call(conn, opts) do
    maybe_sweep(opts.window_ms)

    key = bucket_key(conn)
    now = System.monotonic_time(:millisecond)

    case :ets.lookup(@table, key) do
      [{^key, count, window_start}] when now - window_start < opts.window_ms ->
        if count >= opts.max_requests do
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(429, Jason.encode!(%{error: opts.error_message}))
          |> halt()
        else
          :ets.update_counter(@table, key, {2, 1})
          conn
        end

      _ ->
        :ets.insert(@table, {key, 1, now})
        conn
    end
  end

  defp bucket_key(conn) do
    ip =
      conn.remote_ip
      |> Tuple.to_list()
      |> Enum.join(".")

    {conn.request_path, ip}
  end

  # Probabilistic sweep: on ~1% of requests, delete entries older than 2x the window
  defp maybe_sweep(window_ms) do
    if :rand.uniform(@sweep_probability) == 1 do
      now = System.monotonic_time(:millisecond)
      cutoff = now - window_ms * 2

      :ets.foldl(
        fn {key, _count, start}, acc ->
          if start < cutoff, do: :ets.delete(@table, key)
          acc
        end,
        nil,
        @table
      )
    end
  end
end
