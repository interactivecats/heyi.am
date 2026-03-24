defmodule HeyiAmAppWeb.PageControllerTest do
  use HeyiAmAppWeb.ConnCase

  test "GET /home renders the landing page", %{conn: conn} do
    conn = get(conn, ~p"/home")
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

  test "GET / redirects unauthenticated users to /home", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert redirected_to(conn) == "/home"
  end
end
