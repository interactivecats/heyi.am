defmodule HeyiAmAppWeb.ProjectApiControllerTest do
  use HeyiAmAppWeb.ConnCase

  describe "POST /api/projects" do
    test "creates a project with valid data", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/projects", %{
        project: %{slug: "my-project", title: "My Project"}
      })

      assert %{"project_id" => id, "slug" => "my-project"} = json_response(conn, 201)
      assert is_integer(id)
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

    test "two users can have the same slug", %{conn: _conn} do
      {conn1, _user1} = api_conn_with_auth()
      {conn2, _user2} = api_conn_with_auth()

      conn1 = post(conn1, ~p"/api/projects", %{project: %{slug: "shared-name", title: "User 1"}})
      conn2 = post(conn2, ~p"/api/projects", %{project: %{slug: "shared-name", title: "User 2"}})

      assert %{"slug" => "shared-name"} = json_response(conn1, 201)
      assert %{"slug" => "shared-name"} = json_response(conn2, 201)
    end
  end

  describe "PATCH /api/projects/:slug/screenshot-key" do
    test "rejects path traversal key", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = patch(conn, ~p"/api/projects/my-proj/screenshot-key", %{key: "sessions/VICTIM/session.json"})
      assert %{"error" => "Invalid screenshot key"} = json_response(conn, 400)
    end

    test "rejects key with .. traversal", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = patch(conn, ~p"/api/projects/my-proj/screenshot-key", %{key: "projects/../sessions/secret/session.json"})
      assert %{"error" => "Invalid screenshot key"} = json_response(conn, 400)
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> patch(~p"/api/projects/my-proj/screenshot-key", %{key: "projects/my-proj/screenshot.png"})

      assert %{"error" => _} = json_response(conn, 401)
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
  end
end
