defmodule HeyiAmWeb.Plugs.RateLimitTest do
  use HeyiAmWeb.ConnCase, async: false

  alias HeyiAmWeb.Plugs.RateLimit

  setup do
    # Enable rate limiting for this test module
    original = Application.get_env(:heyi_am, :rate_limiting_enabled)
    Application.put_env(:heyi_am, :rate_limiting_enabled, true)
    on_exit(fn -> Application.put_env(:heyi_am, :rate_limiting_enabled, original) end)
    :ok
  end

  test "allows requests under the limit", %{conn: conn} do
    opts = RateLimit.init(action: "test_allow_#{System.unique_integer([:positive])}", limit: 3, period: 60_000)

    conn = RateLimit.call(conn, opts)
    refute conn.halted
  end

  test "blocks requests over the limit" do
    action = "test_block_#{System.unique_integer([:positive])}"
    opts = RateLimit.init(action: action, limit: 2, period: 60_000)

    _conn1 = RateLimit.call(build_conn(), opts)
    _conn2 = RateLimit.call(build_conn(), opts)
    conn3 = RateLimit.call(build_conn(), opts)

    assert conn3.halted
    assert conn3.status == 429

    body = Jason.decode!(conn3.resp_body)
    assert body["error"]["code"] == "RATE_LIMITED"
  end
end
