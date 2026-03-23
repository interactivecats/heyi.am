defmodule HeyiAmWeb.SessionDataControllerTest do
  use HeyiAmWeb.ConnCase

  alias HeyiAm.Accounts
  alias HeyiAm.SharesFixtures

  defp create_user_with_username(username) do
    user = HeyiAm.AccountsFixtures.user_fixture()
    {:ok, user} = Accounts.update_user_username(user, %{username: username})
    user
  end

  describe "GET /api/projects/:username/:slug/sessions-data" do
    test "excludes draft sessions from response", %{conn: conn} do
      user = create_user_with_username("drafttest")
      project = HeyiAm.ProjectsFixtures.project_fixture(user.id, %{slug: "myapp", title: "My App"})

      # Create a published session
      SharesFixtures.share_fixture(%{
        user_id: user.id,
        project_id: project.id,
        status: "listed",
        title: "Published Session"
      })

      # Create a draft session
      SharesFixtures.share_fixture(%{
        user_id: user.id,
        project_id: project.id,
        status: "draft",
        title: "Draft Session"
      })

      conn =
        conn
        |> put_req_header("accept", "application/json")
        |> get("/api/projects/drafttest/myapp/sessions-data")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      titles = Enum.map(sessions, & &1["title"])

      assert "Published Session" in titles
      refute "Draft Session" in titles
    end

    test "includes listed and unlisted sessions", %{conn: conn} do
      user = create_user_with_username("statustest")
      project = HeyiAm.ProjectsFixtures.project_fixture(user.id, %{slug: "proj", title: "Proj"})

      SharesFixtures.share_fixture(%{
        user_id: user.id,
        project_id: project.id,
        status: "listed",
        title: "Listed Session"
      })

      SharesFixtures.share_fixture(%{
        user_id: user.id,
        project_id: project.id,
        status: "unlisted",
        title: "Unlisted Session"
      })

      conn =
        conn
        |> put_req_header("accept", "application/json")
        |> get("/api/projects/statustest/proj/sessions-data")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      titles = Enum.map(sessions, & &1["title"])

      assert "Listed Session" in titles
      assert "Unlisted Session" in titles
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn =
        conn
        |> put_req_header("accept", "application/json")
        |> get("/api/projects/nobody/anything/sessions-data")

      assert json_response(conn, 404)
    end
  end
end
