defmodule HeyiAmWeb.VibePickerLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  setup :register_and_log_in_user

  describe "mount" do
    test "renders vibe picker with template cards", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/onboarding/vibe")
      assert html =~ "Choose your vibe"
      assert html =~ "Editorial"
      assert html =~ "Terminal"
      assert html =~ "Minimal"
      assert html =~ "Brutalist"
      assert html =~ "Campfire"
      assert html =~ "Neon Night"
    end

    test "shows preview panel", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/onboarding/vibe")
      assert html =~ "Preview"
    end

    test "editorial is selected by default", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/onboarding/vibe")
      assert html =~ "vibe-card--selected"
    end
  end

  describe "select" do
    test "clicking a card selects it", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/onboarding/vibe")

      html =
        view
        |> element("button[phx-value-template='terminal']")
        |> render_click()

      assert html =~ "vibe-live-preview--terminal"
    end

    test "updates preview panel on selection", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/onboarding/vibe")

      html =
        view
        |> element("button[phx-value-template='neon-night']")
        |> render_click()

      assert html =~ "vibe-live-preview--neon-night"
    end
  end

  describe "save" do
    test "saves layout and redirects to portfolio", %{conn: conn, user: user} do
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "testuser"})

      {:ok, view, _html} = live(conn, ~p"/onboarding/vibe")

      view
      |> element("button[phx-value-template='minimal']")
      |> render_click()

      assert {:error, {:live_redirect, %{to: "/testuser"}}} =
               view
               |> element("button.btn-primary")
               |> render_click()

      updated_user = HeyiAm.Accounts.get_user_by_username("testuser")
      assert updated_user.portfolio_layout == "minimal"
    end

    test "redirects to / if no username set", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/onboarding/vibe")

      assert {:error, {:live_redirect, %{to: "/"}}} =
               view
               |> element("button.btn-primary")
               |> render_click()
    end
  end

  describe "unauthenticated" do
    test "redirects to login", %{conn: _conn} do
      conn = build_conn()
      assert {:error, {:redirect, %{to: "/users/log-in"}}} = live(conn, ~p"/onboarding/vibe")
    end
  end
end
