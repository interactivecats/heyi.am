defmodule HeyiAmAppWeb.ShareApiControllerTest do
  use HeyiAmAppWeb.ConnCase

  describe "POST /api/sessions" do
    test "creates a session with valid data", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{
          title: "Test Session",
          slug: "test-session",
          rendered_html: "<p>test</p>"
        }
      })

      resp = json_response(conn, 201)
      assert is_binary(resp["token"])
      assert resp["url"] =~ "/s/"
    end

    test "persists rendered_html via separate changeset", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{
          title: "HTML Session",
          slug: "html-session",
          rendered_html: "<div class=\"case-study\"><p>rendered</p></div>"
        }
      })

      resp = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token(resp["token"])
      assert share.rendered_html == "<div class=\"case-study\"><p>rendered</p></div>"
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{session: %{title: "Test"}})

      assert json_response(conn, 401)
    end

    test "returns 400 without session param", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = post(conn, ~p"/api/sessions", %{})
      assert %{"error" => %{"code" => "MISSING_SESSION"}} = json_response(conn, 400)
    end
  end

  describe "DELETE /api/sessions/:id" do
    test "deletes a session owned by the authenticated user", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      {:ok, share} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          token: "del-test-tok",
          title: "Doomed",
          raw_storage_key: "sessions/del-test-tok/raw.jsonl",
          log_storage_key: "sessions/del-test-tok/log.json",
          session_storage_key: "sessions/del-test-tok/session.json"
        })

      conn = delete(conn, ~p"/api/sessions/#{share.id}")
      assert response(conn, 204) == ""
      assert HeyiAm.Shares.get_share_by_token("del-test-tok") == nil
    end

    test "returns 404 when share does not exist", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = delete(conn, ~p"/api/sessions/999999999")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
    end

    test "returns 404 when share is owned by a different user (BOLA)", %{conn: _conn} do
      {_conn1, owner} = api_conn_with_auth()
      {conn2, _attacker} = api_conn_with_auth()

      {:ok, share} =
        HeyiAm.Shares.create_share(%{
          user_id: owner.id,
          token: "victim-tok",
          title: "Victim"
        })

      conn = delete(conn2, ~p"/api/sessions/#{share.id}")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
      # Owner's share still exists
      assert HeyiAm.Shares.get_share_by_token("victim-tok") != nil
    end

    test "returns 404 for non-integer id", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = delete(conn, ~p"/api/sessions/not-an-id")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> delete(~p"/api/sessions/1")

      assert json_response(conn, 401)
    end

    test "succeeds even when S3 artifacts have no storage keys", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      {:ok, share} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          token: "no-keys-tok",
          title: "No keys"
        })

      conn = delete(conn, ~p"/api/sessions/#{share.id}")
      assert response(conn, 204) == ""
    end
  end

  describe "PATCH /api/sessions/bulk-status" do
    test "promotes all project sessions to listed", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "bulk-proj", title: "Bulk", user_id: user.id})

      {:ok, _s1} = HeyiAm.Shares.create_share(%{user_id: user.id, token: "bulk-1", title: "S1", project_id: project.id, status: "unlisted"})
      {:ok, _s2} = HeyiAm.Shares.create_share(%{user_id: user.id, token: "bulk-2", title: "S2", project_id: project.id, status: "unlisted"})

      conn = patch(conn, ~p"/api/sessions/bulk-status", %{project_id: project.id, status: "listed"})
      resp = json_response(conn, 200)
      assert resp["updated"] == 2

      shares = HeyiAm.Shares.list_shares_for_project(project.id)
      assert Enum.all?(shares, &(&1.status == "listed"))
    end

    test "demotes all project sessions to unlisted", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "demote-proj", title: "Demote", user_id: user.id})

      {:ok, _} = HeyiAm.Shares.create_share(%{user_id: user.id, token: "dem-1", title: "S1", project_id: project.id, status: "listed"})
      {:ok, _} = HeyiAm.Shares.create_share(%{user_id: user.id, token: "dem-2", title: "S2", project_id: project.id, status: "listed"})

      conn = patch(conn, ~p"/api/sessions/bulk-status", %{project_id: project.id, status: "unlisted"})
      resp = json_response(conn, 200)
      assert resp["updated"] == 2

      shares = HeyiAm.Shares.list_shares_for_project(project.id)
      assert Enum.all?(shares, &(&1.status == "unlisted"))
    end

    test "does not affect archived sessions", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "arch-proj", title: "Arch", user_id: user.id})

      {:ok, _s1} = HeyiAm.Shares.create_share(%{user_id: user.id, token: "arch-1", title: "S1", project_id: project.id, status: "unlisted"})
      HeyiAm.Shares.archive_project_sessions(project.id)
      {:ok, _} = HeyiAm.Shares.create_share(%{user_id: user.id, token: "arch-2", title: "S2", project_id: project.id, status: "listed"})

      conn = patch(conn, ~p"/api/sessions/bulk-status", %{project_id: project.id, status: "unlisted"})
      resp = json_response(conn, 200)
      assert resp["updated"] == 1
    end

    test "returns 404 for project not owned by user", %{conn: _conn} do
      {_conn1, owner} = api_conn_with_auth()
      {conn2, _attacker} = api_conn_with_auth()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "other-proj", title: "Other", user_id: owner.id})

      conn = patch(conn2, ~p"/api/sessions/bulk-status", %{project_id: project.id, status: "listed"})
      assert %{"error" => %{"code" => "PROJECT_NOT_FOUND"}} = json_response(conn, 404)
    end

    test "returns 400 with invalid params", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = patch(conn, ~p"/api/sessions/bulk-status", %{})
      assert %{"error" => %{"code" => "INVALID_PARAMS"}} = json_response(conn, 400)
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> patch(~p"/api/sessions/bulk-status", %{project_id: 1, status: "listed"})

      assert json_response(conn, 401)
    end
  end
end
