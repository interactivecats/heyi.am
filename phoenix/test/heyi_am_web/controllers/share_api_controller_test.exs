defmodule HeyiAmWeb.ShareApiControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.SharesFixtures

  describe "POST /api/sessions" do
    test "creates a session with valid data", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "My Test Session", duration_minutes: 30, turns: 10}
      })

      assert %{"token" => token, "url" => url} = json_response(conn, 201)
      assert String.starts_with?(url, "/s/")
      assert is_binary(token)
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "No Auth"}
        })

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns error without session param", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{})

      assert %{"error" => %{"code" => "MISSING_SESSION"}} = json_response(conn, 400)
    end

    test "returns error with invalid data", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{session: %{title: ""}})

      assert %{"error" => %{"code" => "VALIDATION_FAILED"}} = json_response(conn, 422)
    end

    test "returns content_hash in response", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Hash Test", duration_minutes: 15}
      })

      assert %{"content_hash" => hash} = json_response(conn, 201)
      assert String.starts_with?(hash, "sha256:")
    end
  end

  describe "GET /api/sessions/:token/verify" do
    test "verifies an existing session", %{conn: conn} do
      share = share_fixture(%{title: "Verify Me"})

      conn = get(conn, ~p"/api/sessions/#{share.token}/verify")
      resp = json_response(conn, 200)

      assert resp["token"] == share.token
      assert String.starts_with?(resp["content_hash"], "sha256:")
      assert resp["signed"] == false
      assert resp["verified"] == false
    end

    test "returns 404 for nonexistent token", %{conn: conn} do
      conn = get(conn, ~p"/api/sessions/nonexistent/verify")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
    end
  end

  describe "user_id spoofing prevention" do
    test "strips user_id from session params and uses token user", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Spoofed", user_id: 999}
      })

      assert %{"token" => token} = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token!(token)
      assert share.user_id == user.id
    end
  end

  describe "project_id handling" do
    test "links session to own project when valid project_id supplied", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "my-proj", title: "My Proj", user_id: user.id})

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Session in Project", project_id: project.id}
      })

      assert %{"token" => token} = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token!(token)
      assert share.project_id == project.id
    end

    test "re-publishing preserves all storage keys pointing to original token", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "repub-proj", title: "Repub", user_id: user.id})

      # First publish
      conn1 = post(conn, ~p"/api/sessions", %{
        session: %{title: "Original", slug: "my-session", project_id: project.id}
      })
      assert %{"token" => original_token} = json_response(conn1, 201)
      original_share = HeyiAm.Shares.get_share_by_token!(original_token)

      assert original_share.raw_storage_key == "sessions/#{original_token}/raw.jsonl"
      assert original_share.log_storage_key == "sessions/#{original_token}/log.json"
      assert original_share.session_storage_key == "sessions/#{original_token}/session.json"

      # Re-publish same (project_id, slug) — should update, not create
      {conn2, _user} = api_conn_with_auth(user)
      conn2 = post(conn2, ~p"/api/sessions", %{
        session: %{title: "Updated", slug: "my-session", project_id: project.id}
      })
      assert %{"token" => reused_token} = json_response(conn2, 201)

      # Token should be the same as original
      assert reused_token == original_token

      updated_share = HeyiAm.Shares.get_share_by_token!(original_token)
      assert updated_share.title == "Updated"
      assert updated_share.raw_storage_key == "sessions/#{original_token}/raw.jsonl"
      assert updated_share.log_storage_key == "sessions/#{original_token}/log.json"
      assert updated_share.session_storage_key == "sessions/#{original_token}/session.json"
    end

    test "silently drops project_id that belongs to another user", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      other_user = HeyiAm.AccountsFixtures.user_fixture()
      {:ok, other_project} = HeyiAm.Projects.create_project(%{slug: "their-proj", title: "Theirs", user_id: other_user.id})

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Sneaky", project_id: other_project.id}
      })

      assert %{"token" => token} = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token!(token)
      assert is_nil(share.project_id)
    end
  end
end
