defmodule HeyiAmWeb.PortfolioEditorLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  alias HeyiAm.SharesFixtures

  setup :register_and_log_in_user

  setup %{user: user} do
    {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "testuser"})

    {:ok, _} =
      HeyiAm.Accounts.update_user_profile(user, %{
        display_name: "Test Dev",
        bio: "Building cool stuff",
        location: "NYC",
        status: "OPEN_FOR_COLLAB"
      })

    {:ok, project_alpha} =
      HeyiAm.Projects.create_project(%{
        slug: "alpha-engine",
        title: "Alpha Engine",
        skills: ["Rust", "PostgreSQL"],
        user_id: user.id
      })

    {:ok, project_beta} =
      HeyiAm.Projects.create_project(%{
        slug: "beta-sdk",
        title: "Beta SDK",
        skills: ["TypeScript"],
        user_id: user.id
      })

    share1 =
      SharesFixtures.share_fixture(%{
        user_id: user.id,
        title: "Initial Prototype",
        project_name: "Alpha Engine",
        skills: ["Rust", "PostgreSQL"],
        sealed: true,
        status: "listed",
        project_id: project_alpha.id
      })

    share2 =
      SharesFixtures.share_fixture(%{
        user_id: user.id,
        title: "Memory Tests",
        project_name: "Alpha Engine",
        skills: ["Rust", "WebAssembly"],
        status: "listed",
        project_id: project_alpha.id
      })

    share3 =
      SharesFixtures.share_fixture(%{
        user_id: user.id,
        title: "SDK Bootstrap",
        project_name: "Beta SDK",
        skills: ["TypeScript"],
        status: "listed",
        project_id: project_beta.id
      })

    %{
      share1: share1,
      share2: share2,
      share3: share3,
      # Provide shares in portfolio_sessions shape for tests that click session buttons
      portfolio_sessions: [share1, share2]
    }
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

    test "shows real projects in bento grid", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Alpha Engine"
      assert html =~ "Beta SDK"
    end

    test "hero section has editable name from user profile", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Test Dev"
    end

    test "hero section has editable bio", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Building cool stuff"
    end

    test "shows location and status badges", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "NYC"
      assert html =~ "OPEN_FOR_COLLAB"
    end

    test "shows expertise ledger computed from shares", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "Expertise Ledger"
      assert html =~ "RUST"
    end

    test "shows project skills as chips", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/testuser/edit")
      assert html =~ "RUST"
      assert html =~ "POSTGRESQL"
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
        |> element("button[phx-click='toggle_project'][phx-value-id='alpha-engine']")
        |> render_click()

      assert html =~ "Initial Prototype"
      assert html =~ "Memory Tests"
    end

    test "expanded project shows session statuses", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='alpha-engine']")
        |> render_click()

      # share1 is sealed, share2 is published
      assert html =~ "Sealed"
      assert html =~ "Published"
    end

    test "collapsing an expanded project hides session list", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      view |> element("button[phx-click='toggle_project'][phx-value-id='alpha-engine']") |> render_click()

      html =
        view
        |> element("button[phx-click='toggle_project'][phx-value-id='alpha-engine']")
        |> render_click()

      refute html =~ "pe-session-list"
    end
  end

  describe "visitor mode" do
    test "toggle hides edit controls", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_visitor_mode']")
        |> render_click()

      refute html =~ "pe-card-controls"
    end

    test "toggle again restores edit controls", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      view |> element("button[phx-click='toggle_visitor_mode']") |> render_click()
      html = view |> element("button[phx-click='toggle_visitor_mode']") |> render_click()

      assert html =~ "pe-card-controls"
    end
  end

  describe "project visibility" do
    test "toggling visibility adds hidden class", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      html =
        view
        |> element("button[phx-click='toggle_project_visibility'][phx-value-id='alpha-engine']")
        |> render_click()

      assert html =~ "pe-card--hidden"
    end
  end

  describe "session controls within expanded project" do
    test "toggle_session_visibility switches public/private",
         %{conn: conn, portfolio_sessions: ps} do
      {:ok, view, _html} = live(conn, ~p"/testuser/edit")

      # Expand project 1
      view |> element("button[phx-click='toggle_project'][phx-value-id='alpha-engine']") |> render_click()

      # Toggle first session visibility
      first_ps = hd(ps)

      html =
        view
        |> element("button[phx-click='toggle_session_visibility'][phx-value-id='#{first_ps.id}']")
        |> render_click()

      assert html =~ "Private"
    end
  end

  describe "ownership" do
    test "redirects when visiting another user's editor", %{conn: conn} do
      assert {:error, {:redirect, %{to: "/", flash: %{"error" => _}}}} =
               live(conn, ~p"/someone-else/edit")
    end
  end

  describe "unauthenticated" do
    test "redirects to login", %{conn: _conn} do
      conn = build_conn()
      assert {:error, {:redirect, %{to: "/users/log-in"}}} = live(conn, ~p"/testuser/edit")
    end
  end
end
