defmodule HeyiAmWeb.PortfolioControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  defp create_user_with_shares(_context) do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "alice"})

    {:ok, user} =
      HeyiAm.Accounts.update_user_profile(user, %{
        display_name: "Alice Builder",
        bio: "I build things"
      })

    {:ok, project} =
      HeyiAm.Projects.create_project(%{
        slug: "heyiam",
        title: "heyi.am",
        user_id: user.id
      })

    {:ok, _share} =
      HeyiAm.Shares.create_share(%{
        token: "share-1",
        title: "Auth rewrite session",
        dev_take: "Rewrote auth from scratch.",
        duration_minutes: 47,
        turns: 77,
        files_changed: 34,
        loc_changed: 2400,
        recorded_at: ~U[2026-03-12 14:02:00Z],
        verified_at: ~U[2026-03-12 14:49:00Z],
        project_name: "heyi.am",
        status: "listed",
        skills: ["Elixir", "Phoenix"],
        user_id: user.id,
        project_id: project.id,
        top_files: [%{"path" => "lib/auth.ex", "touches" => 12}]
      })

    {:ok, _share2} =
      HeyiAm.Shares.create_share(%{
        token: "share-2",
        title: "Portfolio editor session",
        dev_take: "Built drag and drop.",
        duration_minutes: 35,
        turns: 52,
        files_changed: 12,
        loc_changed: 890,
        recorded_at: ~U[2026-03-10 10:15:00Z],
        verified_at: ~U[2026-03-10 10:50:00Z],
        project_name: "heyi.am",
        status: "listed",
        skills: ["LiveView", "JavaScript"],
        user_id: user.id,
        project_id: project.id,
        top_files: []
      })

    %{user: user, project: project}
  end

  describe "GET /:username" do
    setup [:create_user_with_shares]

    test "renders portfolio page for existing user", %{conn: conn} do
      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "Alice Builder"
      assert html =~ "I build things"
      assert html =~ "tpl-editorial"
    end

    test "renders project cards from real shares", %{conn: conn} do
      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "heyi.am"
      assert html =~ "/alice/heyiam"
      assert html =~ "2 sessions"
    end

    test "renders AI Collaboration Profile section", %{conn: conn} do
      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "AI Collaboration Profile"
      assert html =~ "Task Scoping"
      assert html =~ "Redirection"
      assert html =~ "Verification"
      assert html =~ "Orchestration"
    end

    test "renders bottom metrics", %{conn: conn} do
      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "Uptime"
      assert html =~ "Avg Cycle"
      assert html =~ "Error Budget"
    end

    test "renders sidebar with recent activity", %{conn: conn} do
      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "Active Endpoints"
      assert html =~ "Recent Activity"
      assert html =~ "Auth rewrite session"
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn = get(conn, "/nobody-here")
      assert html_response(conn, 404)
    end
  end

  describe "empty portfolio state" do
    test "shows empty state when no sessions", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "empty-user"})

      conn = get(conn, ~p"/empty-user")
      html = html_response(conn, 200)
      assert html =~ "No sessions shared yet"
    end
  end

  describe "GET /:username (other fields)" do
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

    test "renders hero card with status chip", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "eve"})
      {:ok, _} = HeyiAm.Accounts.update_user_profile(user, %{status: "building"})

      conn = get(conn, ~p"/eve")
      html = html_response(conn, 200)
      assert html =~ "building"
    end

    test "renders full 404 page content for non-existent portfolio", %{conn: conn} do
      conn = get(conn, "/nobody-here")
      html = html_response(conn, 404)
      assert html =~ "404"
      assert html =~ "Page not found"
      assert html =~ "Back to Home"
    end
  end

  describe "GET /:username/:project" do
    setup [:create_user_with_shares]

    test "renders project detail page", %{conn: conn} do
      conn = get(conn, ~p"/alice/heyiam")
      html = html_response(conn, 200)
      assert html =~ "heyi.am"
      assert html =~ "heyiam"
    end

    test "renders breadcrumb navigation", %{conn: conn} do
      conn = get(conn, ~p"/alice/heyiam")
      html = html_response(conn, 200)
      assert html =~ "alice"
      assert html =~ "heyiam"
      assert html =~ "content-ref"
    end

    test "renders hero stats", %{conn: conn} do
      conn = get(conn, ~p"/alice/heyiam")
      html = html_response(conn, 200)
      assert html =~ "Total Time"
      assert html =~ "Sessions"
      assert html =~ "Files Touched"
      assert html =~ "LOC Changed"
    end

    test "renders published session cards", %{conn: conn} do
      conn = get(conn, ~p"/alice/heyiam")
      html = html_response(conn, 200)
      assert html =~ "Published Sessions"
      assert html =~ "session-card"
      assert html =~ "/s/share-1"
      assert html =~ "Auth rewrite session"
    end

    test "renders verified badge on sessions", %{conn: conn} do
      conn = get(conn, ~p"/alice/heyiam")
      html = html_response(conn, 200)
      assert html =~ "Verified"
      assert html =~ "sealed-badge"
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn = get(conn, "/nobody-here/some-project")
      assert html_response(conn, 404)
    end

    test "returns 404 for non-existent project slug", %{conn: conn} do
      conn = get(conn, ~p"/alice/nonexistent-project")
      assert html_response(conn, 404)
    end
  end
end
