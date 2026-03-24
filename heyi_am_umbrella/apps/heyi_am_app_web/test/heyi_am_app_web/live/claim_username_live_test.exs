defmodule HeyiAmAppWeb.ClaimUsernameLiveTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures

  setup %{conn: conn} do
    user = user_fixture()
    %{conn: log_in_user(conn, user), user: user}
  end

  describe "mount" do
    test "renders claim username page for user without username", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/onboarding/username")
      assert html =~ "Pick your permanent URL"
    end

    test "redirects user who already has a username", %{conn: conn, user: user} do
      {:ok, _user} = HeyiAm.Accounts.update_user_username(user, %{username: "taken#{System.unique_integer([:positive])}"})
      assert {:error, {:live_redirect, _}} = live(conn, ~p"/onboarding/username")
    end
  end
end
