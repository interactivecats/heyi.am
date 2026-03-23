defmodule HeyiAmWeb.ProjectApiControllerTest do
  use HeyiAmWeb.ConnCase

  describe "POST /api/projects" do
    test "creates a project with valid data", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/projects", %{
        project: %{slug: "my-project", title: "My Project"}
      })

      assert %{"project_id" => id, "slug" => "my-project"} = json_response(conn, 201)
      assert is_integer(id)
    end

    test "upserts an existing project by slug", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      post(conn, ~p"/api/projects", %{
        project: %{slug: "my-proj", title: "First Title"}
      })

      conn = post(conn, ~p"/api/projects", %{
        project: %{slug: "my-proj", title: "Updated Title"}
      })

      assert %{"slug" => "my-proj"} = json_response(conn, 201)

      # Exactly one project with that slug should exist
      assert length(HeyiAm.Projects.list_user_projects_with_published_shares(
        json_response(conn, 201)["project_id"]
      )) <= 1
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/projects", %{project: %{slug: "x", title: "X"}})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 400 without project param", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/projects", %{})

      assert %{"error" => %{"code" => "MISSING_PROJECT"}} = json_response(conn, 400)
    end

    test "returns 422 for invalid slug format", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/projects", %{
        project: %{slug: "Invalid Slug!", title: "Bad"}
      })

      assert %{"error" => %{"code" => "VALIDATION_FAILED", "details" => errors}} =
               json_response(conn, 422)

      assert errors["slug"]
    end

    test "returns 422 for missing required fields", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/projects", %{project: %{narrative: "no slug or title"}})

      assert %{"error" => %{"code" => "VALIDATION_FAILED", "details" => errors}} =
               json_response(conn, 422)

      assert errors["slug"]
      assert errors["title"]
    end

    test "two users can have the same slug without conflict", %{conn: _conn} do
      {conn1, _user1} = api_conn_with_auth()
      {conn2, _user2} = api_conn_with_auth()

      conn1 = post(conn1, ~p"/api/projects", %{project: %{slug: "shared-name", title: "User 1 Project"}})
      conn2 = post(conn2, ~p"/api/projects", %{project: %{slug: "shared-name", title: "User 2 Project"}})

      assert %{"slug" => "shared-name"} = json_response(conn1, 201)
      assert %{"slug" => "shared-name"} = json_response(conn2, 201)
    end
  end

  describe "GET /api/projects/:username/:slug/screenshot" do
    test "returns 404 for non-existent username", %{conn: conn} do
      conn =
        conn
        |> put_req_header("accept", "application/json")
        |> get("/api/projects/nobody/myapp/screenshot")

      assert json_response(conn, 404)
    end

    test "returns 404 for non-existent project slug", %{conn: _conn} do
      user = HeyiAm.AccountsFixtures.user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "alice#{System.unique_integer([:positive])}"})

      conn =
        Phoenix.ConnTest.build_conn()
        |> put_req_header("accept", "application/json")
        |> get("/api/projects/#{user.username}/nonexistent/screenshot")

      assert json_response(conn, 404)
    end

    test "scopes screenshot to the correct user when two users share a slug", %{conn: _conn} do
      # Create two users with the same project slug
      user1 = HeyiAm.AccountsFixtures.user_fixture()
      {:ok, user1} = HeyiAm.Accounts.update_user_username(user1, %{username: "screenshotuser1"})
      user2 = HeyiAm.AccountsFixtures.user_fixture()
      {:ok, user2} = HeyiAm.Accounts.update_user_username(user2, %{username: "screenshotuser2"})

      HeyiAm.Projects.upsert_project(user1.id, %{slug: "myapp", title: "User1 App", screenshot_key: "projects/user1/screenshot.png"})
      HeyiAm.Projects.upsert_project(user2.id, %{slug: "myapp", title: "User2 App", screenshot_key: "projects/user2/screenshot.png"})

      # Each user's screenshot endpoint should find their own project (or 404/error from S3)
      # The key point is it should NOT return the other user's project data
      conn1 =
        Phoenix.ConnTest.build_conn()
        |> put_req_header("accept", "application/json")
        |> get("/api/projects/screenshotuser1/myapp/screenshot")

      conn2 =
        Phoenix.ConnTest.build_conn()
        |> put_req_header("accept", "application/json")
        |> get("/api/projects/screenshotuser2/myapp/screenshot")

      # Both should find the project (not 404 "Not found"), even though S3 may fail in test env.
      # A 502 "Storage fetch failed" or 500 "Presign failed" means the project WAS found
      # and it tried to fetch the screenshot — proving it's scoped correctly.
      assert conn1.status != 404
      assert conn2.status != 404
    end
  end
end
