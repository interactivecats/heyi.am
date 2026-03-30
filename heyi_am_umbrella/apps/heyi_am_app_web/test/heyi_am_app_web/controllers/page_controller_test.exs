defmodule HeyiAmAppWeb.PageControllerTest do
  use HeyiAmAppWeb.ConnCase

  test "GET / renders the landing page for unauthenticated users", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "Archive your coding sessions"
  end

  test "GET /terms renders the terms page", %{conn: conn} do
    conn = get(conn, ~p"/terms")
    assert html_response(conn, 200) =~ "Terms of Use"
  end

  test "GET /privacy renders the privacy page", %{conn: conn} do
    conn = get(conn, ~p"/privacy")
    assert html_response(conn, 200) =~ "Privacy Policy"
  end
end
