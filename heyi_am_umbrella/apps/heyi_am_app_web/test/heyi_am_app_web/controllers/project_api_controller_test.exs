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

    test "normalizes invalid slug to valid format", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/projects", %{
        project: %{slug: "Invalid Slug!", title: "Normalized"}
      })

      assert %{"slug" => "invalid-slug"} = json_response(conn, 201)
    end

    test "returns 422 for slug that normalizes to empty", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/projects", %{
        project: %{slug: "!!!", title: "Bad"}
      })

      assert %{"error" => %{"code" => "VALIDATION_FAILED"}} = json_response(conn, 422)
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

  describe "DELETE /api/projects/:slug" do
    test "deletes a project and its shares in a transaction", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "Condemned",
          slug: "condemned"
        })

      {:ok, share1} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "cond-share-1",
          title: "Session 1",
          raw_storage_key: "sessions/cond-share-1/raw.jsonl",
          log_storage_key: "sessions/cond-share-1/log.json",
          session_storage_key: "sessions/cond-share-1/session.json"
        })

      {:ok, share2} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "cond-share-2",
          title: "Session 2"
        })

      conn = delete(conn, ~p"/api/projects/condemned")
      assert response(conn, 204) == ""

      assert HeyiAm.Projects.get_user_project_by_slug(user.id, "condemned") == nil
      assert HeyiAm.Shares.get_share_by_token(share1.token) == nil
      assert HeyiAm.Shares.get_share_by_token(share2.token) == nil
    end

    test "returns 404 when the project does not exist", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = delete(conn, ~p"/api/projects/no-such-project")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
    end

    test "returns 404 when the project is owned by a different user", %{conn: _conn} do
      {_conn1, owner} = api_conn_with_auth()
      {attacker_conn, _attacker} = api_conn_with_auth()

      {:ok, _project} =
        HeyiAm.Projects.create_project(%{
          user_id: owner.id,
          title: "Not Yours",
          slug: "not-yours"
        })

      conn = delete(attacker_conn, ~p"/api/projects/not-yours")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)

      # Owner's project still exists
      assert HeyiAm.Projects.get_user_project_by_slug(owner.id, "not-yours") != nil
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> delete(~p"/api/projects/whatever")

      assert json_response(conn, 401)
    end

    test "succeeds for a project with no shares", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      {:ok, _project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "Empty",
          slug: "empty-proj"
        })

      conn = delete(conn, ~p"/api/projects/empty-proj")
      assert response(conn, 204) == ""
      assert HeyiAm.Projects.get_user_project_by_slug(user.id, "empty-proj") == nil
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
