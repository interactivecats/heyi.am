defmodule HeyiAmPublicWeb.SecurityTest do
  @moduledoc """
  Security invariant tests for the public web endpoint.
  Verifies the structural ATO guarantees that make this endpoint safe.
  """
  use HeyiAmPublicWeb.ConnCase

  describe "landing redirects to app domain" do
    test "GET / redirects (landing is on app domain now)", %{conn: conn} do
      conn = get(conn, ~p"/")
      assert conn.status == 302
    end

    test "GET /terms redirects to app domain", %{conn: conn} do
      conn = get(conn, ~p"/terms")
      assert conn.status == 302
    end
  end

  describe "no session cookies" do
    test "public endpoint does not set session cookies on redirect", %{conn: conn} do
      conn = get(conn, ~p"/")

      set_cookie_headers =
        conn.resp_headers
        |> Enum.filter(fn {name, _} -> name == "set-cookie" end)
        |> Enum.map(fn {_, value} -> value end)

      # No session cookies should be set at all
      assert set_cookie_headers == [],
             "Public endpoint must not set any cookies, got: #{inspect(set_cookie_headers)}"
    end

    test "terms redirect does not set session cookies", %{conn: conn} do
      conn = get(conn, ~p"/terms")
      set_cookies = for {"set-cookie", v} <- conn.resp_headers, do: v
      assert set_cookies == []
    end
  end

  describe "strict CSP headers" do
    test "public endpoint serves strict CSP headers", %{conn: conn} do
      # Test against a route that still renders on public_web (vibe redirect also goes through pipeline)
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
end
