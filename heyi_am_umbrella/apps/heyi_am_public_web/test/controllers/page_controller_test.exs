defmodule HeyiAmPublicWeb.PageControllerTest do
  use HeyiAmPublicWeb.ConnCase

  test "GET / redirects to app domain", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert redirected_to(conn) =~ "/"
  end

  test "GET /terms redirects to app domain", %{conn: conn} do
    conn = get(conn, ~p"/terms")
    assert redirected_to(conn) =~ "/terms"
  end

  test "GET /privacy redirects to app domain", %{conn: conn} do
    conn = get(conn, ~p"/privacy")
    assert redirected_to(conn) =~ "/privacy"
  end

  test "GET /v/some-id redirects to howdoyouvibe.com", %{conn: conn} do
    conn = get(conn, "/v/some-id")
    assert redirected_to(conn) == "https://howdoyouvibe.com/v/some-id"
  end

  test "GET /v/nested/path redirects with full path", %{conn: conn} do
    conn = get(conn, "/v/archetypes/foo")
    assert redirected_to(conn) == "https://howdoyouvibe.com/v/archetypes/foo"
  end
end
