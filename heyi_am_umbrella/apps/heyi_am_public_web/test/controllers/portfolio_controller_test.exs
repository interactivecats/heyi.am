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
    test "serves rendered project page", %{conn: conn} do
      user = user_fixture(%{username: "projdev"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "My Project",
          slug: "my-project",
          rendered_html: "<div>Project Page</div>"
        })

      conn = get(conn, "/projdev/my-project")
      response = html_response(conn, 200)
      assert response =~ "Project Page"
    end

    test "returns 404 for unknown project", %{conn: conn} do
      _user = user_fixture(%{username: "projdev2"})

      conn = get(conn, "/projdev2/nonexistent")
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
