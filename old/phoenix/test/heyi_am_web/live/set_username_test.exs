defmodule HeyiAmWeb.UserLive.SetUsernameTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures

  setup :register_and_log_in_user

  describe "GET /users/set-username" do
    test "renders the set username page with mockup design", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/users/set-username")

      assert html =~ "Pick your"
      assert html =~ "permanent"
      assert html =~ "how the world finds your work"
      assert html =~ "heyi.am/"
      assert html =~ "auth-page"
      assert html =~ "username-input-row"
      assert html =~ "username-prefix"
      assert html =~ "username-protocol-note"
      assert html =~ "Claim &amp; Continue"
      assert html =~ "auth-btn auth-btn--primary"
    end

    test "redirects to edit page if username already set", %{conn: conn, user: user} do
      {:ok, _user} =
        HeyiAm.Accounts.update_profile(user, %{"username" => "existinguser"})

      {:error, {:redirect, %{to: path}}} = live(conn, ~p"/users/set-username")
      assert path == "/existinguser/edit"
    end

    test "validates username on change and shows availability", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/users/set-username")

      html =
        view
        |> element("#username_form")
        |> render_change(%{"user" => %{"username" => "validusername"}})

      assert html =~ "is available"
      assert html =~ "username-check--ok"
    end

    test "shows validation error for invalid format", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/users/set-username")

      html =
        view
        |> element("#username_form")
        |> render_change(%{"user" => %{"username" => "invalid name!"}})

      assert html =~ "username-check--taken"
      assert html =~ "only letters, numbers, hyphens, underscores"
    end

    test "saves valid username and redirects", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/users/set-username")

      {:error, {:redirect, %{to: path}}} =
        view
        |> element("#username_form")
        |> render_submit(%{"user" => %{"username" => "myusername"}})

      assert path == "/myusername/edit"
    end

    test "shows error when username is already taken on submit", %{conn: conn} do
      other_user = user_fixture()

      {:ok, _other} =
        HeyiAm.Accounts.update_profile(other_user, %{"username" => "takenname"})

      {:ok, view, _html} = live(conn, ~p"/users/set-username")

      html =
        view
        |> element("#username_form")
        |> render_submit(%{"user" => %{"username" => "takenname"}})

      assert html =~ "username-check--taken"
      assert html =~ "has already been taken"
    end
  end
end
