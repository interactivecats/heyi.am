defmodule HeyiAmWeb.ClaimUsernameLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures

  setup :register_and_log_in_user

  describe "mount" do
    test "renders claim username form", %{conn: conn} do
      {:ok, view, html} = live(conn, ~p"/onboarding/username")
      assert html =~ "Pick your permanent URL"
      assert html =~ "heyi.am/"
      assert has_element?(view, "input[name='user[username]']")
    end

    test "redirects to portfolio if username already set", %{conn: conn, user: user} do
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "claimed"})

      assert {:error, {:live_redirect, %{to: "/claimed"}}} =
               live(conn, ~p"/onboarding/username")
    end

    test "shows recent claims sidebar", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/onboarding/username")
      assert html =~ "Recently claimed"
      assert html =~ "@mira-k"
    end

    test "shows protocol note", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/onboarding/username")
      assert html =~ "Protocol note"
      assert html =~ "permanently bound"
    end
  end

  describe "validate" do
    test "shows AVAILABLE badge for valid username", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/onboarding/username")

      html =
        view
        |> element("form")
        |> render_change(%{user: %{username: "goodname"}})

      assert html =~ "AVAILABLE"
      refute html =~ "TAKEN"
    end

    test "shows TAKEN badge for duplicate username", %{conn: conn} do
      other_user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(other_user, %{username: "taken"})

      {:ok, view, _html} = live(conn, ~p"/onboarding/username")

      html =
        view
        |> element("form")
        |> render_change(%{user: %{username: "taken"}})

      assert html =~ "TAKEN"
      refute html =~ "AVAILABLE"
    end

    test "shows no badge for too-short input", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/onboarding/username")

      html =
        view
        |> element("form")
        |> render_change(%{user: %{username: "ab"}})

      refute html =~ "AVAILABLE"
      refute html =~ "TAKEN"
    end

    test "shows TAKEN badge for invalid format", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/onboarding/username")

      html =
        view
        |> element("form")
        |> render_change(%{user: %{username: "-bad-name"}})

      assert html =~ "TAKEN"
    end
  end

  describe "save" do
    test "claims username and redirects to portfolio", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/onboarding/username")

      view
      |> element("form")
      |> render_change(%{user: %{username: "myname"}})

      assert {:error, {:live_redirect, %{to: "/myname"}}} =
               view
               |> element("form")
               |> render_submit(%{user: %{username: "myname"}})
    end

    test "does not claim duplicate username", %{conn: conn} do
      other_user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(other_user, %{username: "taken"})

      {:ok, view, _html} = live(conn, ~p"/onboarding/username")

      html =
        view
        |> element("form")
        |> render_submit(%{user: %{username: "taken"}})

      assert html =~ "has already been taken"
    end
  end

  describe "unauthenticated" do
    test "redirects to login", %{conn: _conn} do
      conn = build_conn()
      assert {:error, {:redirect, %{to: "/users/log-in"}}} = live(conn, ~p"/onboarding/username")
    end
  end
end
