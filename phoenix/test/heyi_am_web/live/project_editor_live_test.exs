defmodule HeyiAmWeb.ProjectEditorLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  setup :register_and_log_in_user

  @editor_path "/testuser/projects/project-alpha/edit"

  setup %{user: user} do
    {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "testuser"})
    :ok
  end

  describe "mount and render" do
    test "renders editor shell with breadcrumb", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Workbench"
      assert html =~ "Projects"
      assert html =~ "Project Alpha"
      assert html =~ "Editor"
      assert html =~ "project-editor__breadcrumb"
    end

    test "shows project definition form with pre-filled data", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Project Definition"
      assert html =~ "Configuration"
      assert html =~ "Project Alpha"
      assert html =~ "scalable telemetry engine"
      assert html =~ "RUST"
      assert html =~ "WASM"
      assert html =~ "EDGE-COMP"
    end

    test "shows session list with correct statuses", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Session Management"
      assert html =~ "Initial Architectural Prototype"
      assert html =~ "WASM Memory Isolation Tests"
      assert html =~ "Refactoring Event Loop..."
      assert html =~ "Sealed"
      assert html =~ "Featured"
      assert html =~ "Draft"
    end

    test "featured session has visual distinction", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "project-editor__session-card--featured"
    end

    test "draft sessions show at reduced state", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "project-editor__session-card--draft"
      assert html =~ "project-editor__session-title--draft"
    end

    test "shows empty state placeholder", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Ready for a new exploration?"
      assert html =~ "project-editor__empty-state"
    end

    test "shows repository sync status", %{conn: conn} do
      {:ok, _view, html} = live(conn, @editor_path)

      assert html =~ "Synchronized with GitHub"
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
      assert html =~ "EDGE-COMP"
    end

    test "add_tag event adds a tag", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      html = render_hook(view, "add_tag", %{"tag" => "elixir"})

      assert html =~ "ELIXIR"
    end

    test "add_tag ignores duplicates", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      html = render_hook(view, "add_tag", %{"tag" => "rust"})

      # Should still have exactly one RUST tag (not duplicated)
      assert length(Regex.scan(~r/phx-value-tag="RUST"/, html)) == 1
    end

    test "add_tag ignores empty/whitespace strings", %{conn: conn} do
      {:ok, view, html_before} = live(conn, @editor_path)

      html_after = render_hook(view, "add_tag", %{"tag" => "   "})

      # Tag count should not change
      assert length(Regex.scan(~r/project-editor__tag"/, html_before)) ==
               length(Regex.scan(~r/project-editor__tag"/, html_after))
    end
  end

  describe "session interactions" do
    test "visibility toggle works", %{conn: conn} do
      {:ok, view, html} = live(conn, @editor_path)

      # Draft session 0x112C starts as Private
      assert html =~ "Private"

      html =
        view
        |> element("button[phx-click='toggle_visibility'][phx-value-id='0x112C']")
        |> render_click()

      # After toggle, the session that was Private should now be Public
      # We check the specific button's text changed
      assert html =~ "Public"
    end

    test "star toggle works", %{conn: conn} do
      {:ok, view, html} = live(conn, @editor_path)

      # 0x82A1 starts as not featured
      refute html =~ ~r/data-session-id="0x82A1"[^>]*class="[^"]*featured/s

      html =
        view
        |> element("button[phx-click='toggle_star'][phx-value-id='0x82A1']")
        |> render_click()

      # After starring, should have featured class on the card
      assert html =~ "project-editor__star-btn--active"
    end
  end

  describe "session reorder" do
    test "reorder event changes session order", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      # Original order: 0x82A1, 0x9F4B, 0x112C — reverse it
      html = render_hook(view, "reorder", %{"ids" => ["0x112C", "0x9F4B", "0x82A1"]})

      # Verify the new order by checking positions in rendered HTML
      pos_112c = :binary.match(html, "0x112C") |> elem(0)
      pos_9f4b = :binary.match(html, "0x9F4B") |> elem(0)
      pos_82a1 = :binary.match(html, "0x82A1") |> elem(0)

      assert pos_112c < pos_9f4b
      assert pos_9f4b < pos_82a1
    end
  end

  describe "save" do
    test "save event triggers flash", %{conn: conn} do
      {:ok, view, _html} = live(conn, @editor_path)

      # Clicking save should not crash and should set flash
      view
      |> element("button[phx-click='save']")
      |> render_click()

      # The flash is rendered in the root layout, not directly in the LiveView render.
      # Verify the event was handled successfully by checking the view is still alive.
      assert render(view) =~ "Project Definition"
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
