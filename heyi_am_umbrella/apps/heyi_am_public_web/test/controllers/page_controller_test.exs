defmodule HeyiAmPublicWeb.PageControllerTest do
  use HeyiAmPublicWeb.ConnCase

  test "GET / renders the landing page", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "Proof-of-work for AI-native developers"
  end

  test "GET /terms renders the terms page", %{conn: conn} do
    conn = get(conn, ~p"/terms")
    assert html_response(conn, 200) =~ "Terms of Use"
  end

  test "GET /privacy renders the privacy page", %{conn: conn} do
    conn = get(conn, ~p"/privacy")
    assert html_response(conn, 200) =~ "Privacy Policy"
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
