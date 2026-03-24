defmodule HeyiAmPublicWeb.SecurityTest do
  @moduledoc """
  Security invariant tests for the public web endpoint.
  Verifies the structural ATO guarantees that make this endpoint safe.
  """
  use HeyiAmPublicWeb.ConnCase

  describe "no session cookies" do
    test "public endpoint does not set session cookies", %{conn: conn} do
      conn = get(conn, ~p"/")
      assert html_response(conn, 200)

      set_cookie_headers =
        conn.resp_headers
        |> Enum.filter(fn {name, _} -> name == "set-cookie" end)
        |> Enum.map(fn {_, value} -> value end)

      # No session cookies should be set at all
      assert set_cookie_headers == [],
             "Public endpoint must not set any cookies, got: #{inspect(set_cookie_headers)}"
    end

    test "terms page does not set session cookies", %{conn: conn} do
      conn = get(conn, ~p"/terms")
      set_cookies = for {"set-cookie", v} <- conn.resp_headers, do: v
      assert set_cookies == []
    end
  end

  describe "no CSRF token" do
    test "public endpoint does not expose CSRF token in HTML", %{conn: conn} do
      conn = get(conn, ~p"/")
      body = html_response(conn, 200)

      refute body =~ "csrf-token",
             "Public endpoint HTML must not contain csrf-token meta tag"

      refute body =~ "_csrf_token",
             "Public endpoint HTML must not contain _csrf_token"
    end

    test "terms page does not expose CSRF token", %{conn: conn} do
      conn = get(conn, ~p"/terms")
      body = html_response(conn, 200)
      refute body =~ "csrf-token"
    end
  end

  describe "strict CSP headers" do
    test "public endpoint serves strict CSP headers", %{conn: conn} do
      conn = get(conn, ~p"/")

      csp =
        conn.resp_headers
        |> Enum.find(fn {name, _} -> name == "content-security-policy" end)

      assert csp, "Public endpoint must set content-security-policy header"
      {_, csp_value} = csp

      assert csp_value =~ "frame-src 'none'",
             "CSP must block frames"

      assert csp_value =~ "frame-ancestors 'none'",
             "CSP must block framing by other sites"

      assert csp_value =~ "object-src 'none'",
             "CSP must block object embeds"
    end
  end

  describe "vibe redirects" do
    test "GET /v/* redirects to howdoyouvibe.com", %{conn: conn} do
      conn = get(conn, "/v/some-vibe-id")
      assert redirected_to(conn) == "https://howdoyouvibe.com/v/some-vibe-id"
    end

    test "GET /v/archetypes/foo redirects with nested path", %{conn: conn} do
      conn = get(conn, "/v/archetypes/foo")
      assert redirected_to(conn) == "https://howdoyouvibe.com/v/archetypes/foo"
    end
  end

  describe "no LiveView" do
    test "public endpoint does not serve /live websocket", %{conn: conn} do
      # The endpoint should not have a /live socket at all
      # We verify this by checking the HTML doesn't include LiveView JS hooks
      conn = get(conn, ~p"/")
      body = html_response(conn, 200)
      refute body =~ "phx-socket"
      refute body =~ "liveSocket"
    end
  end
end
