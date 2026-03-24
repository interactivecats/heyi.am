defmodule HeyiAmVibeWeb.SecurityTest do
  use HeyiAmVibeWeb.ConnCase

  describe "session security" do
    test "vibe endpoint does NOT set any cookies", %{conn: conn} do
      conn = get(conn, ~p"/")
      assert html_response(conn, 200)

      set_cookie_headers = get_resp_header(conn, "set-cookie")

      assert set_cookie_headers == [],
             "Vibe endpoint must not set any cookies, got: #{inspect(set_cookie_headers)}"
    end

    test "vibe endpoint does NOT expose CSRF token in HTML", %{conn: conn} do
      conn = get(conn, ~p"/")
      body = html_response(conn, 200)
      refute body =~ "csrf-token"
      refute body =~ "_csrf_token"
    end
  end

  describe "security headers" do
    test "sets content-security-policy on browser routes", %{conn: conn} do
      conn = get(conn, ~p"/")
      [csp] = get_resp_header(conn, "content-security-policy")
      assert csp =~ "default-src 'self'"
      assert csp =~ "frame-ancestors 'none'"
    end

    test "CSP prevents framing (frame-ancestors 'none')", %{conn: conn} do
      conn = get(conn, ~p"/")
      [csp] = get_resp_header(conn, "content-security-policy")
      assert csp =~ "frame-ancestors 'none'"
    end
  end

  describe "rate limiting" do
    test "blocks excessive vibe creation", %{conn: conn} do
      Application.put_env(:heyi_am_vibe_web, :rate_limiting_enabled, true)

      attrs = %{
        "archetype_id" => "night-owl",
        "modifier_id" => "codes-at-3am",
        "headline" => "Test",
        "narrative" => "Test narrative.",
        "stats" => %{"expletives" => 1},
        "sources" => ["test"],
        "session_count" => 1,
        "total_turns" => 10
      }

      statuses =
        for _i <- 1..7 do
          conn = post(conn, ~p"/api/vibes", attrs)
          conn.status
        end

      assert 429 in statuses

      Application.put_env(:heyi_am_vibe_web, :rate_limiting_enabled, false)
    end
  end
end
