defmodule HeyiAmWeb.PageControllerTest do
  use HeyiAmWeb.ConnCase

  test "GET / renders 200 with landing page content", %{conn: conn} do
    conn = get(conn, ~p"/")
    response = html_response(conn, 200)

    assert response =~ "Proof-of-work for AI-native developers"
    assert response =~ "npx heyiam"
  end

  test "GET / contains auth links", %{conn: conn} do
    conn = get(conn, ~p"/")
    response = html_response(conn, 200)

    assert response =~ ~p"/users/log-in"
    assert response =~ ~p"/users/register"
  end
end
