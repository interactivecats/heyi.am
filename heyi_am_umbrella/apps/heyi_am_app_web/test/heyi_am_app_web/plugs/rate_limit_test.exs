defmodule HeyiAmAppWeb.Plugs.RateLimitTest do
  use HeyiAmAppWeb.ConnCase, async: true

  alias HeyiAmAppWeb.Plugs.RateLimit

  test "allows requests within limit", %{conn: conn} do
    opts = RateLimit.init(action: "test_allow", limit: 10, period: 60_000)
    conn = RateLimit.call(conn, opts)
    refute conn.halted
  end

  test "rate limiting can be disabled via config", %{conn: conn} do
    Application.put_env(:heyi_am, :rate_limiting_enabled, false)

    opts = RateLimit.init(action: "test_disabled", limit: 0, period: 1)
    conn = RateLimit.call(conn, opts)
    refute conn.halted
  after
    Application.put_env(:heyi_am, :rate_limiting_enabled, false)
  end
end
