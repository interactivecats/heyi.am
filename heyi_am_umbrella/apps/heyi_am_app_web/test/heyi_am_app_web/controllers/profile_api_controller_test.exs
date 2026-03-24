defmodule HeyiAmAppWeb.ProfileApiControllerTest do
  use HeyiAmAppWeb.ConnCase

  describe "PATCH /api/profile" do
    test "updates user profile with valid data", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()
      {:ok, _user} = HeyiAm.Accounts.update_user_username(user, %{username: "profileuser#{System.unique_integer([:positive])}"})

      conn = patch(conn, ~p"/api/profile", %{
        profile: %{display_name: "New Name"}
      })

      resp = json_response(conn, 200)
      assert resp["ok"] == true
      assert resp["display_name"] == "New Name"
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> patch(~p"/api/profile", %{profile: %{display_name: "Test"}})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 400 without profile param", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = patch(conn, ~p"/api/profile", %{})
      assert %{"error" => %{"code" => "MISSING_PROFILE"}} = json_response(conn, 400)
    end
  end
end
