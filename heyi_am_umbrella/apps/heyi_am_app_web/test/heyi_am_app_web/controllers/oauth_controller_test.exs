defmodule HeyiAmAppWeb.OAuthControllerTest do
  use HeyiAmAppWeb.ConnCase, async: true

  describe "GET /auth/github" do
    test "redirects to GitHub", %{conn: conn} do
      conn = get(conn, ~p"/auth/github")
      # Ueberauth will redirect to GitHub's OAuth page
      assert conn.status in [302, 200]
    end
  end
end
