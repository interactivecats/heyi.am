defmodule HeyiAmWeb.UserSettingsGDPRTest do
  use HeyiAmWeb.ConnCase, async: true

  alias HeyiAm.Accounts
  alias HeyiAm.Repo

  setup :register_and_log_in_user

  setup %{user: user} do
    {:ok, user} = Accounts.update_user_username(user, %{username: "testuser"})
    %{user: user}
  end

  describe "GET /users/settings/export" do
    test "returns JSON file download", %{conn: conn} do
      conn = get(conn, ~p"/users/settings/export")

      assert response(conn, 200)
      assert get_resp_header(conn, "content-type") |> hd() =~ "application/json"

      assert get_resp_header(conn, "content-disposition") |> hd() =~
               "attachment"

      body = Jason.decode!(conn.resp_body)
      assert Map.has_key?(body, "profile")
      assert Map.has_key?(body, "shares")
      assert Map.has_key?(body, "challenges")
      assert Map.has_key?(body, "portfolio_sessions")
    end

    test "filename includes username", %{conn: conn} do
      conn = get(conn, ~p"/users/settings/export")

      assert get_resp_header(conn, "content-disposition") |> hd() =~
               "testuser"
    end

    test "redirects if not logged in" do
      conn = build_conn()
      conn = get(conn, ~p"/users/settings/export")
      assert redirected_to(conn) == ~p"/users/log-in"
    end

    @tag token_authenticated_at: DateTime.add(DateTime.utc_now(:second), -11, :minute)
    test "redirects if not in sudo mode", %{conn: conn} do
      conn = get(conn, ~p"/users/settings/export")
      assert redirected_to(conn) == ~p"/users/log-in"
    end
  end

  describe "DELETE /users/settings" do
    test "anonymizes account when username matches", %{conn: conn, user: user} do
      conn = delete(conn, ~p"/users/settings", %{"username" => "testuser"})
      assert redirected_to(conn) == ~p"/"

      anon = Repo.get(Accounts.User, user.id)
      assert anon.status == "deleted"
      assert anon.username == nil
    end

    test "rejects deletion when username does not match", %{conn: conn, user: user} do
      conn = delete(conn, ~p"/users/settings", %{"username" => "wrong"})
      assert redirected_to(conn) == ~p"/users/settings"

      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~
               "Username did not match"

      assert Repo.get(Accounts.User, user.id)
    end

    test "redirects if not logged in" do
      conn = build_conn()
      conn = delete(conn, ~p"/users/settings", %{"username" => "testuser"})
      assert redirected_to(conn) == ~p"/users/log-in"
    end

    @tag token_authenticated_at: DateTime.add(DateTime.utc_now(:second), -11, :minute)
    test "redirects if not in sudo mode", %{conn: conn} do
      conn = delete(conn, ~p"/users/settings", %{"username" => "testuser"})
      assert redirected_to(conn) == ~p"/users/log-in"
    end
  end
end
