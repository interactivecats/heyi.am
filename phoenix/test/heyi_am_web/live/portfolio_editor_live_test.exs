defmodule HeyiAmWeb.PortfolioEditorLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  setup :register_and_log_in_user

  setup %{user: user} do
    {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "testuser"})
    :ok
  end

  describe "mount" do
    test "renders editor shell with nav tabs", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Workbench"
      assert html =~ "Drafts"
      assert html =~ "Sessions"
      assert html =~ "Portfolio"
    end

    test "shows Save & Deploy button", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Save &amp; Deploy"
    end

    test "shows mock projects in bento grid", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Hyperion Grid Engine"
      assert html =~ "Lancer SDK"
      assert html =~ "Flux Capacitor UI"
    end

    test "hero section has editable name", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")
      assert has_element?(view, "[contenteditable='true']", "Alex Rivera")
    end

    test "hero section has editable bio", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Full-stack systems architect"
    end

    test "shows location and status badges", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "SAN_FRANCISCO_CA"
      assert html =~ "OPEN_FOR_COLLAB"
    end

    test "shows expertise ledger", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Expertise Ledger"
      assert html =~ "BACKEND"
      assert html =~ "FRONTEND"
      assert html =~ "Rust / Go / Node.js"
    end

    test "shows project skills as chips", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "RUST"
      assert html =~ "WEBASSEMBLY"
      assert html =~ "TYPESCRIPT"
    end
  end

  describe "template picker" do
    test "shows all 6 templates in dock", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Editorial"
      assert html =~ "Terminal"
      assert html =~ "Minimal"
      assert html =~ "Brutalist"
      assert html =~ "Campfire"
      assert html =~ "Neon Night"
    end

    test "selecting a template updates active state", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-value-template='terminal']")
        |> render_click()

      assert html =~ "pe-dock-template-btn--active"
    end
  end

  describe "accent colors" do
    test "renders all 6 accent color dots", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")
      assert has_element?(view, "button[phx-value-accent='seal-blue']")
      assert has_element?(view, "button[phx-value-accent='violet']")
      assert has_element?(view, "button[phx-value-accent='rose']")
      assert has_element?(view, "button[phx-value-accent='teal']")
      assert has_element?(view, "button[phx-value-accent='amber']")
      assert has_element?(view, "button[phx-value-accent='sky']")
    end

    test "selecting accent updates the canvas style", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-value-accent='violet']")
        |> render_click()

      assert html =~ "#7C5CFC"
    end
  end

  describe "project expansion" do
    test "clicking a project shows session list", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='1']")
        |> render_click()

      assert html =~ "Initial Architectural Prototype"
      assert html =~ "WASM Memory Isolation Tests"
      assert html =~ "Refactoring Event Loop..."
    end

    test "expanded project shows session statuses", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='1']")
        |> render_click()

      assert html =~ "Sealed"
      assert html =~ "Published"
      assert html =~ "Draft"
    end

    test "featured session shows Featured badge", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='1']")
        |> render_click()

      assert html =~ "Featured"
    end

    test "empty project shows empty state", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='3']")
        |> render_click()

      assert html =~ "Ready for a new exploration?"
    end

    test "draft session has reduced opacity class", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='1']")
        |> render_click()

      assert html =~ "pe-session-row--draft"
    end
  end

  describe "visitor mode" do
    test "toggle hides edit controls", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_visitor_mode']")
        |> render_click()

      refute html =~ "contenteditable"
      refute html =~ "pe-card-controls"
    end

    test "toggle again restores edit controls", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      view |> element("button[phx-click='toggle_visitor_mode']") |> render_click()
      html = view |> element("button[phx-click='toggle_visitor_mode']") |> render_click()

      assert html =~ "contenteditable"
    end
  end

  describe "project visibility" do
    test "toggling visibility adds hidden class", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project_visibility'][phx-value-id='1']")
        |> render_click()

      assert html =~ "pe-card--hidden"
    end
  end

  describe "session reorder within expanded project" do
    test "reorder event changes session order", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      # Expand project 1
      view |> element("button[phx-click='toggle_project'][phx-value-id='1']") |> render_click()

      # Reverse the session order (original: 1, 2, 3)
      html = render_hook(view, "reorder", %{"ids" => ["3", "2", "1"]})

      # Verify reversed order by position in HTML
      pos_3 = :binary.match(html, "Refactoring Event Loop") |> elem(0)
      pos_2 = :binary.match(html, "WASM Memory Isolation") |> elem(0)
      pos_1 = :binary.match(html, "Initial Architectural") |> elem(0)

      assert pos_3 < pos_2
      assert pos_2 < pos_1
    end
  end

  describe "session controls within expanded project" do
    test "toggle_session_visibility switches public/private", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      # Expand project 1
      view |> element("button[phx-click='toggle_project'][phx-value-id='1']") |> render_click()

      # Session 1 starts as public, toggle to private
      html =
        view
        |> element("button[phx-click='toggle_session_visibility'][phx-value-id='1']")
        |> render_click()

      assert html =~ "Private"
    end

    test "toggle_session_featured toggles star", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      # Expand project 1
      view |> element("button[phx-click='toggle_project'][phx-value-id='1']") |> render_click()

      # Session 1 starts as not featured, toggle to featured
      html =
        view
        |> element("button[phx-click='toggle_session_featured'][phx-value-id='1']")
        |> render_click()

      assert html =~ "star"
    end

    test "collapsing an expanded project hides session list", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      # Expand project 1
      view |> element("button[phx-click='toggle_project'][phx-value-id='1']") |> render_click()

      # Collapse project 1
      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='1']")
        |> render_click()

      refute html =~ "pe-session-list"
    end
  end

  describe "unauthenticated" do
    test "redirects to login", %{conn: _conn} do
      conn = build_conn()
      assert {:error, {:redirect, %{to: "/users/log-in"}}} = live(conn, ~p"/testuser/edit")
    end
  end
end
