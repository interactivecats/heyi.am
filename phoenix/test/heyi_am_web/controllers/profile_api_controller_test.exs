defmodule HeyiAmWeb.ProfileApiControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  describe "PATCH /api/profile" do
    test "updates rendered_portfolio_html", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      conn = patch(conn, ~p"/api/profile", %{
        profile: %{rendered_portfolio_html: "<div>My Portfolio</div>"}
      })

      assert %{"ok" => true} = json_response(conn, 200)

      updated = HeyiAm.Accounts.get_user!(user.id)
      assert updated.rendered_portfolio_html == "<div>My Portfolio</div>"
    end

    test "updates display_name and bio", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      conn = patch(conn, ~p"/api/profile", %{
        profile: %{display_name: "New Name", bio: "New bio text"}
      })

      assert %{"ok" => true, "display_name" => "New Name"} = json_response(conn, 200)

      updated = HeyiAm.Accounts.get_user!(user.id)
      assert updated.display_name == "New Name"
      assert updated.bio == "New bio text"
    end

    test "returns username in response", %{conn: _conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "testuser"})
      {conn, _user} = api_conn_with_auth(user)

      conn = patch(conn, ~p"/api/profile", %{
        profile: %{display_name: "Test User"}
      })

      assert %{"ok" => true, "username" => "testuser"} = json_response(conn, 200)
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> patch(~p"/api/profile", %{profile: %{display_name: "No Auth"}})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 400 without profile param", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = patch(conn, ~p"/api/profile", %{})

      assert %{"error" => %{"code" => "MISSING_PROFILE"}} = json_response(conn, 400)
    end

    test "returns 422 for invalid portfolio_layout", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = patch(conn, ~p"/api/profile", %{
        profile: %{portfolio_layout: "invalid-layout"}
      })

      assert %{"error" => %{"code" => "VALIDATION_FAILED"}} = json_response(conn, 422)
    end

    test "is idempotent -- same update twice yields same result", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      html = "<div>Portfolio v2</div>"

      conn1 = patch(conn, ~p"/api/profile", %{profile: %{rendered_portfolio_html: html}})
      assert %{"ok" => true} = json_response(conn1, 200)

      conn2 = patch(conn, ~p"/api/profile", %{profile: %{rendered_portfolio_html: html}})
      assert %{"ok" => true} = json_response(conn2, 200)

      updated = HeyiAm.Accounts.get_user!(user.id)
      assert updated.rendered_portfolio_html == html
    end
  end
end
