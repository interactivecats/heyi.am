defmodule HeyiAmPublicWeb.PublicRenderingTest do
  @moduledoc """
  Integration tests: create data via core contexts, then verify
  the public endpoint serves the correct rendered HTML.
  """
  use HeyiAmPublicWeb.ConnCase

  import HeyiAm.AccountsFixtures

  test "full portfolio flow: user with rendered portfolio is served", %{conn: conn} do
    user = user_fixture(%{username: "intdev", display_name: "Integration Dev"})

    {:ok, user} =
      user
      |> Ecto.Changeset.change(%{
        rendered_portfolio_html: "<div class=\"portfolio\">Integration Portfolio</div>"
      })
      |> HeyiAm.Repo.update()

    # Portfolio page serves the rendered HTML
    conn = get(conn, "/intdev")
    response = html_response(conn, 200)
    assert response =~ "Integration Portfolio"
    assert response =~ "og:title"
    assert response =~ "Integration Dev"
  end

  test "full share flow: published share with rendered HTML is served", %{conn: conn} do
    user = user_fixture(%{username: "intsharedev"})

    {:ok, share} =
      HeyiAm.Shares.create_share(%{
        user_id: user.id,
        token: "int-share-123",
        title: "Integration Session",
        status: "listed",
        skills: ["elixir", "phoenix"],
        duration_minutes: 45,
        turns: 20,
        files_changed: 10,
        loc_changed: 200
      })

    {:ok, _share} =
      HeyiAm.Shares.update_share_rendered_html(share, %{
        rendered_html: "<div class=\"session\">Integration Session Content</div>"
      })

    # Share page serves the rendered HTML
    conn = get(conn, "/s/int-share-123")
    response = html_response(conn, 200)
    assert response =~ "Integration Session Content"
  end

  test "project with rendered HTML is served at /:username/:project", %{conn: conn} do
    user = user_fixture(%{username: "intprojdev"})

    {:ok, project} =
      HeyiAm.Projects.create_project(%{
        user_id: user.id,
        title: "Int Project",
        slug: "int-project",
        rendered_html: "<div>Integration Project Page</div>"
      })

    {:ok, _share} =
      HeyiAm.Shares.create_share(%{
        user_id: user.id,
        project_id: project.id,
        token: "int-proj-share",
        title: "Published Session",
        status: "listed"
      })

    conn = get(conn, "/intprojdev/int-project")
    response = html_response(conn, 200)
    assert response =~ "Integration Project Page"
  end
end
