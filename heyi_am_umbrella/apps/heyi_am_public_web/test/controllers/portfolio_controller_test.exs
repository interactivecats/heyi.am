defmodule HeyiAmPublicWeb.PortfolioControllerTest do
  use HeyiAmPublicWeb.ConnCase

  import HeyiAm.AccountsFixtures

  describe "GET /:username" do
    test "serves rendered_html when portfolio is published", %{conn: conn} do
      user =
        user_fixture(%{username: "testdev"})
        |> set_rendered_portfolio("<div class=\"portfolio\">My Portfolio</div>")

      conn = get(conn, "/testdev")
      response = html_response(conn, 200)
      assert response =~ "My Portfolio"
    end

    test "serves empty portfolio when no rendered_html", %{conn: conn} do
      _user = user_fixture(%{username: "emptydev"})

      conn = get(conn, "/emptydev")
      response = html_response(conn, 200)
      assert response =~ "No sessions shared yet"
    end

    test "returns 404 for unknown username", %{conn: conn} do
      conn = get(conn, "/nonexistent_user_xyz")
      assert html_response(conn, 404) =~ "Page not found"
    end

    test "includes OG tags for portfolio", %{conn: conn} do
      user =
        user_fixture(%{username: "ogdev", display_name: "OG Dev"})
        |> set_rendered_portfolio("<div>content</div>")

      conn = get(conn, "/ogdev")
      response = html_response(conn, 200)
      assert response =~ ~s(og:title)
      assert response =~ "OG Dev"
    end
  end

  describe "GET /:username/:project" do
    test "serves rendered project page when it has published shares", %{conn: conn} do
      user = user_fixture(%{username: "projdev"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "My Project",
          slug: "my-project",
          rendered_html: "<div>Project Page</div>"
        })

      {:ok, _share} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "proj-share-token",
          title: "A Session",
          status: "listed"
        })

      conn = get(conn, "/projdev/my-project")
      response = html_response(conn, 200)
      assert response =~ "Project Page"
    end

    test "returns 404 when project has no published shares (private)", %{conn: conn} do
      user = user_fixture(%{username: "privdev"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "Private Project",
          slug: "private-project",
          rendered_html: "<div>Should Not See</div>"
        })

      {:ok, _share} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "draft-share",
          title: "Draft Session",
          status: "draft"
        })

      conn = get(conn, "/privdev/private-project")
      assert html_response(conn, 404) =~ "Page not found"
    end

    test "returns 404 for unknown project", %{conn: conn} do
      _user = user_fixture(%{username: "projdev2"})

      conn = get(conn, "/projdev2/nonexistent")
      assert html_response(conn, 404) =~ "Page not found"
    end
  end

  describe "GET /p/:token (unlisted project)" do
    test "serves rendered project page via unlisted token", %{conn: conn} do
      user = user_fixture(%{username: "unlisted-dev"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "Secret Project",
          slug: "secret-project",
          rendered_html: "<div>Secret Content</div>"
        })

      {:ok, _share} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "unlisted-share-tok",
          title: "Unlisted Session",
          status: "unlisted"
        })

      assert project.unlisted_token != nil

      conn = get(conn, "/p/#{project.unlisted_token}")
      response = html_response(conn, 200)
      assert response =~ "Secret Content"
    end

    test "returns 404 for unknown token", %{conn: conn} do
      conn = get(conn, "/p/totally-fake-token")
      assert html_response(conn, 404) =~ "Page not found"
    end

    test "returns 404 when all shares are private", %{conn: conn} do
      user = user_fixture(%{username: "priv-token-dev"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "Private Project",
          slug: "priv-token-proj",
          rendered_html: "<div>Should Not See</div>"
        })

      {:ok, _share} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "priv-token-share",
          title: "Draft Session",
          status: "draft"
        })

      conn = get(conn, "/p/#{project.unlisted_token}")
      assert html_response(conn, 404) =~ "Page not found"
    end

    test "returns 404 when project has no rendered_html", %{conn: conn} do
      user = user_fixture(%{username: "nohtml-dev"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "Empty Project",
          slug: "empty-project"
        })

      conn = get(conn, "/p/#{project.unlisted_token}")
      assert html_response(conn, 404) =~ "Page not found"
    end
  end

  # Helper to set rendered portfolio HTML on a user
  defp set_rendered_portfolio(user, html) do
    {:ok, user} =
      user
      |> Ecto.Changeset.change(%{rendered_portfolio_html: html})
      |> HeyiAm.Repo.update()

    user
  end
end
