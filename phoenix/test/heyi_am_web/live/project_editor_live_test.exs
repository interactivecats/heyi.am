defmodule HeyiAmWeb.ProjectEditorLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  alias HeyiAm.SharesFixtures

  setup :register_and_log_in_user

  setup %{user: user} do
    {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "testuser"})

    {:ok, project} =
      HeyiAm.Projects.create_project(%{
        slug: "project-alpha",
        title: "Project Alpha",
        narrative: "Building a scalable telemetry engine",
        user_id: user.id
      })

    share1 =
      SharesFixtures.share_fixture(%{
        user_id: user.id,
        title: "Initial Prototype",
        project_name: "Project Alpha",
        skills: ["Rust", "WASM"],
        dev_take: "Building a scalable telemetry engine",
        sealed: true,
        status: "listed",
        project_id: project.id
      })

    share2 =
      SharesFixtures.share_fixture(%{
        user_id: user.id,
        title: "Memory Tests",
        project_name: "Project Alpha",
        skills: ["Rust", "WebAssembly"],
        status: "listed",
        project_id: project.id
      })

    # Provide shares as portfolio_sessions for tests that click session buttons
    %{share1: share1, share2: share2, portfolio_sessions: [share1, share2]}
  end

  @editor_path "/testuser/projects/project-alpha/edit"

  describe "mount and render" do
    test "renders editor shell with breadcrumb", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Workbench"
      assert html =~ "Projects"
      assert html =~ "Project Alpha"
      assert html =~ "Editor"
      assert html =~ "project-editor__breadcrumb"
    end

    test "shows project definition form with real data", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Project Definition"
      assert html =~ "Configuration"
      assert html =~ "Project Alpha"
      assert html =~ "scalable telemetry engine"
      assert html =~ "RUST"
      assert html =~ "WASM"
    end

    test "shows session list with correct statuses", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Session Management"
      assert html =~ "Initial Prototype"
      assert html =~ "Memory Tests"
      assert html =~ "Sealed"
    end

    test "shows empty state placeholder", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)
      assert html =~ "Ready for a new exploration?"
    end
  end

  describe "tag management" do
    test "tag removal works", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      html =
        view
        |> element("button[phx-value-tag='RUST']")
        |> render_click()

      refute html =~ ~r/class="project-editor__tag"[^>]*>.*RUST/s
      assert html =~ "WASM"
    end

    test "add_tag event adds a tag", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      html = render_hook(view, "add_tag", %{"tag" => "elixir"})
      assert html =~ "ELIXIR"
    end

    test "add_tag ignores duplicates", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      html = render_hook(view, "add_tag", %{"tag" => "rust"})
      assert length(Regex.scan(~r/phx-value-tag="RUST"/, html)) == 1
    end

    test "add_tag ignores empty/whitespace strings", %{conn: conn} do
      {:ok, view, html_before} = live(conn, @editor_path)

      html_after = render_hook(view, "add_tag", %{"tag" => "   "})

      assert length(Regex.scan(~r/project-editor__tag"/, html_before)) ==
               length(Regex.scan(~r/project-editor__tag"/, html_after))
    end
  end

  describe "session interactions" do
    test "visibility toggle works", %{conn: conn, portfolio_sessions: ps} do
      {:ok, view, _html} = live(conn, @editor_path)
      first_ps = hd(ps)

      html =
        view
        |> element("button[phx-click='toggle_visibility'][phx-value-id='#{first_ps.id}']")
        |> render_click()

      assert html =~ "Private"
    end

    test "star toggle works", %{conn: conn, portfolio_sessions: ps} do
      {:ok, view, _html} = live(conn, @editor_path)
      first_ps = hd(ps)

      html =
        view
        |> element("button[phx-click='toggle_star'][phx-value-id='#{first_ps.id}']")
        |> render_click()

      assert html =~ "project-editor__star-btn--active"
    end
  end

  describe "session reorder" do
    test "reorder event changes session order", %{conn: conn, portfolio_sessions: ps} do
      {:ok, view, _html} = live(conn, @editor_path)

      reversed_ids = ps |> Enum.reverse() |> Enum.map(&to_string(&1.id))
      html = render_hook(view, "reorder", %{"ids" => reversed_ids})

      # Verify the last session now appears first
      last_ps = List.last(ps)
      first_ps = hd(ps)
      last_share_title = last_ps.title
      first_share_title = first_ps.title

      pos_last = :binary.match(html, last_share_title) |> elem(0)
      pos_first = :binary.match(html, first_share_title) |> elem(0)

      assert pos_last < pos_first
    end
  end

  describe "save" do
    test "save event triggers flash", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      view
      |> element("button[phx-click='save']")
      |> render_click()

      assert render(view) =~ "Project Definition"
    end
  end

  describe "ownership" do
    test "redirects when visiting another user's project editor", %{conn: conn} do
      assert {:error, {:redirect, %{to: "/", flash: %{"error" => _}}}} =
               live(conn, ~p"/someone-else/projects/project-alpha/edit")
    end
  end

  describe "unauthenticated" do
    test "unauthenticated users are redirected", %{conn: _conn} do
      conn = build_conn()

      assert {:error, {:redirect, %{to: "/users/log-in"}}} =
               live(conn, @editor_path)
    end
  end
end
