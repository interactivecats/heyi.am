defmodule HeyiAmWeb.PortfolioControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  alias HeyiAm.AccountsFixtures
  alias HeyiAm.Projects
  alias HeyiAm.Repo
  alias HeyiAm.Shares.Share

  describe "GET /:username (portfolio)" do
    test "renders portfolio page for existing user", %{conn: conn} do
      user = AccountsFixtures.user_fixture()

      {:ok, user} =
        user
        |> Ecto.Changeset.change(username: "testdev#{System.unique_integer([:positive])}")
        |> Repo.update()

      conn = get(conn, "/#{user.username}")
      assert html_response(conn, 200) =~ user.username
    end

    test "returns 404 for nonexistent user", %{conn: conn} do
      conn = get(conn, "/nonexistent_user_xyz")
      assert html_response(conn, 404)
    end

    test "root div has tpl-{layout} class based on portfolio_layout", %{conn: conn} do
      user = AccountsFixtures.user_fixture()

      {:ok, user} =
        user
        |> Ecto.Changeset.change(
          username: "layoutdev#{System.unique_integer([:positive])}",
          portfolio_layout: "minimal"
        )
        |> Repo.update()

      conn = get(conn, "/#{user.username}")
      body = html_response(conn, 200)

      assert body =~ "tpl-minimal"
    end

    test "root div has --accent CSS variable", %{conn: conn} do
      user = AccountsFixtures.user_fixture()

      {:ok, user} =
        user
        |> Ecto.Changeset.change(
          username: "accentdev#{System.unique_integer([:positive])}",
          portfolio_accent: "teal"
        )
        |> Repo.update()

      conn = get(conn, "/#{user.username}")
      body = html_response(conn, 200)

      assert body =~ "--accent:var(--teal)"
    end

    test "default layout is editorial when portfolio_layout is nil", %{conn: conn} do
      user = AccountsFixtures.user_fixture()

      {:ok, user} =
        user
        |> Ecto.Changeset.change(
          username: "defaultdev#{System.unique_integer([:positive])}",
          portfolio_layout: nil
        )
        |> Repo.update()

      conn = get(conn, "/#{user.username}")
      body = html_response(conn, 200)

      assert body =~ "tpl-editorial"
    end
  end

  describe "GET /:username/:project_key (project detail)" do
    setup do
      user = AccountsFixtures.user_fixture()

      {:ok, user} =
        user
        |> Ecto.Changeset.change(username: "projdev#{System.unique_integer([:positive])}")
        |> Repo.update()

      {:ok, project} =
        Projects.find_or_create_project(user.id, "my-project", %{
          display_name: "My Project",
          description: "A test project",
          visible: true
        })

      # Update with display_name and description since find_or_create may not set them
      {:ok, project} =
        Projects.update_project(project, %{
          display_name: "My Project",
          description: "A test project"
        })

      %{user: user, project: project}
    end

    test "renders project page with project details", %{conn: conn, user: user, project: project} do
      conn = get(conn, "/#{user.username}/#{project.project_key}")
      body = html_response(conn, 200)

      assert body =~ "My Project"
      assert body =~ "A test project"
      assert body =~ user.username
    end

    test "renders project page with linked shares", %{conn: conn, user: user, project: project} do
      {:ok, share} =
        %Share{user_id: user.id, project_id: project.id}
        |> Share.changeset(%{
          token: "test-token-#{System.unique_integer([:positive])}",
          delete_token: "del-#{System.unique_integer([:positive])}",
          title: "Build the login page",
          developer_take: "Auth is always harder than it looks",
          duration_minutes: 42,
          turn_count: 28,
          session_month: "Mar 2026"
        })
        |> Repo.insert()

      # Add share to portfolio so it appears on the public project page
      HeyiAm.Portfolios.auto_add_to_portfolio(user.id, share.id)

      conn = get(conn, "/#{user.username}/#{project.project_key}")
      body = html_response(conn, 200)

      assert body =~ "Build the login page"
      assert body =~ "Auth is always harder than it looks"
      assert body =~ "42 min"
      assert body =~ "28 turns"
      assert body =~ "Mar 2026"
      assert body =~ "/s/#{share.token}"
    end

    test "shows empty state when project has no shares", %{conn: conn, user: user, project: _project} do
      conn = get(conn, "/#{user.username}/my-project")
      body = html_response(conn, 200)

      assert body =~ "No sessions shared yet."
    end

    test "returns 404 for nonexistent project", %{conn: conn, user: user} do
      conn = get(conn, "/#{user.username}/nonexistent-project")
      assert html_response(conn, 404)
    end

    test "returns 404 for nonexistent user", %{conn: conn} do
      conn = get(conn, "/nobody_here/some-project")
      assert html_response(conn, 404)
    end

    test "returns 404 for hidden project", %{conn: conn, user: user} do
      {:ok, _hidden_project} =
        Projects.find_or_create_project(user.id, "hidden-proj", %{
          display_name: "Hidden",
          visible: false
        })

      {:ok, _} =
        Projects.update_project(
          Projects.get_project(user.id, "hidden-proj"),
          %{visible: false}
        )

      conn = get(conn, "/#{user.username}/hidden-proj")
      assert html_response(conn, 404)
    end

    test "displays skills from stats_cache", %{conn: conn, user: user, project: project} do
      {:ok, _project} =
        Projects.update_project(project, %{
          stats_cache: %{
            "skills" => ["Elixir", "React", "CSS"],
            "share_count" => 3,
            "total_duration_minutes" => 120
          }
        })

      conn = get(conn, "/#{user.username}/#{project.project_key}")
      body = html_response(conn, 200)

      assert body =~ "Elixir"
      assert body =~ "React"
      assert body =~ "CSS"
    end
  end
end
