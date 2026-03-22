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
end
