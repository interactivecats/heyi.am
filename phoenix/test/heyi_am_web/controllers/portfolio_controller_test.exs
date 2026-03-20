defmodule HeyiAmWeb.PortfolioControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  describe "GET /:username" do
    test "renders portfolio page for existing user", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "alice"})

      {:ok, _user} =
        HeyiAm.Accounts.update_user_profile(user, %{
          display_name: "Alice Builder",
          bio: "I build things"
        })

      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "Alice Builder"
      assert html =~ "I build things"
      assert html =~ "tpl-editorial"
      assert html =~ "No sessions yet"
      assert html =~ "heyiam open"
    end

    test "uses portfolio_layout for template class", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "bob"})
      {:ok, _} = HeyiAm.Accounts.update_user_profile(user, %{portfolio_layout: "minimal"})

      conn = get(conn, ~p"/bob")
      assert html_response(conn, 200) =~ "tpl-minimal"
    end

    test "falls back to username when no display_name", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "charlie"})

      conn = get(conn, ~p"/charlie")
      assert html_response(conn, 200) =~ "charlie"
    end

    test "shows location if set", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "dana"})
      {:ok, _} = HeyiAm.Accounts.update_user_profile(user, %{location: "San Francisco"})

      conn = get(conn, ~p"/dana")
      assert html_response(conn, 200) =~ "San Francisco"
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn = get(conn, "/nobody-here")
      assert html_response(conn, 404)
    end
  end
end
