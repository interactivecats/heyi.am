defmodule HeyiAmWeb.PortfolioControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  defp create_user_with_rendered_html(_context) do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "alice"})

    {:ok, user} =
      HeyiAm.Accounts.update_user_profile(user, %{
        display_name: "Alice Builder",
        bio: "I build things",
        rendered_portfolio_html: "<div class=\"portfolio-rendered\"><h1>Alice Builder</h1><p>I build things</p></div>"
      })

    {:ok, project} =
      HeyiAm.Projects.create_project(%{
        slug: "heyiam",
        title: "heyi.am",
        narrative: "A developer portfolio platform",
        rendered_html: "<div class=\"project-rendered\"><h1>heyi.am</h1><p>A developer portfolio platform</p></div>",
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
        project_id: project.id
      })

    %{user: user, project: project}
  end

  describe "GET /:username (with rendered HTML)" do
    setup [:create_user_with_rendered_html]

    test "serves pre-rendered portfolio HTML", %{conn: conn} do
      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "portfolio-rendered"
      assert html =~ "Alice Builder"
      assert html =~ "I build things"
    end

    test "includes OG meta tags for portfolio", %{conn: conn} do
      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ ~s(og:title" content="Alice Builder — heyi.am")
      assert html =~ ~s(og:description" content="I build things")
      assert html =~ ~s(og:type" content="profile")
      assert html =~ ~s(og:url" content=")
      assert html =~ ~s(twitter:card" content="summary_large_image")
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn = get(conn, "/nobody-here")
      assert html_response(conn, 404)
    end
  end

  describe "GET /:username (without rendered HTML)" do
    test "shows empty state when no rendered_portfolio_html", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "empty-user"})

      conn = get(conn, ~p"/empty-user")
      html = html_response(conn, 200)
      assert html =~ "No sessions shared yet"
    end

    test "falls back to username when no display_name", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "charlie"})

      conn = get(conn, ~p"/charlie")
      html = html_response(conn, 200)
      assert html =~ "charlie"
    end
  end

  describe "GET /:username/:project (with rendered HTML)" do
    setup [:create_user_with_rendered_html]

    test "serves pre-rendered project HTML", %{conn: conn} do
      conn = get(conn, ~p"/alice/heyiam")
      html = html_response(conn, 200)
      assert html =~ "project-rendered"
      assert html =~ "heyi.am"
      assert html =~ "A developer portfolio platform"
    end

    test "includes OG meta tags for project page", %{conn: conn} do
      conn = get(conn, ~p"/alice/heyiam")
      html = html_response(conn, 200)
      assert html =~ ~s(og:title" content="heyi.am — Alice Builder")
      assert html =~ ~s(og:description)
      assert html =~ ~s(og:url" content=")
      assert html =~ ~s(twitter:card" content="summary_large_image")
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

  describe "GET /:username/:project (without rendered HTML)" do
    test "returns 404 when project has no rendered_html", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "dana"})

      {:ok, _project} =
        HeyiAm.Projects.create_project(%{
          slug: "bare-proj",
          title: "Bare Project",
          user_id: user.id
        })

      conn = get(conn, ~p"/dana/bare-proj")
      assert html_response(conn, 404)
    end
  end

  describe "GET /:username/time" do
    setup [:create_user_with_rendered_html]

    test "renders time breakdown page", %{conn: conn} do
      conn = get(conn, ~p"/alice/time")
      html = html_response(conn, 200)
      assert html =~ "You / Agents"
      assert html =~ "Your Time"
      assert html =~ "Agent Time"
      assert html =~ "Multiplier"
      assert html =~ "sessions"
    end

    test "includes OG meta tags for sharing", %{conn: conn} do
      conn = get(conn, ~p"/alice/time")
      html = html_response(conn, 200)
      assert html =~ ~s(og:title)
      assert html =~ "You / Agents"
      assert html =~ ~s(og:description)
    end

    test "returns 404 for non-existent user", %{conn: conn} do
      conn = get(conn, "/nobody/time")
      assert html_response(conn, 404)
    end
  end

  describe "GET /:username (full 404 page)" do
    test "renders full 404 page content for non-existent portfolio", %{conn: conn} do
      conn = get(conn, "/nobody-here")
      html = html_response(conn, 404)
      assert html =~ "404"
      assert html =~ "Page not found"
      assert html =~ "Back to Home"
    end
  end
end
