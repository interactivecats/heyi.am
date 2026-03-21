defmodule HeyiAmWeb.EnhanceApiControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  @valid_session %{
    "title" => "Fix auth bug",
    "projectName" => "heyi-am",
    "durationMinutes" => 30,
    "turns" => 10,
    "linesOfCode" => 50,
    "skills" => ["Elixir"],
    "toolBreakdown" => [],
    "filesChanged" => [],
    "executionPath" => [],
    "turnTimeline" => [],
    "rawLog" => ["line 1"]
  }

  describe "POST /api/enhance" do
    test "returns enhancement result for authenticated user" do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/enhance", %{session: @valid_session})
      resp = json_response(conn, 200)

      assert is_map(resp["result"])
      assert is_binary(resp["result"]["title"])
      assert is_list(resp["result"]["skills"])
      assert is_list(resp["result"]["questions"])
      assert is_list(resp["result"]["executionSteps"])
      assert is_integer(resp["usage"]["remaining"])
    end

    test "returns remaining quota that decrements" do
      {conn, user} = api_conn_with_auth()

      conn1 = post(conn, ~p"/api/enhance", %{session: @valid_session})
      resp1 = json_response(conn1, 200)

      # Need a fresh conn for the second request
      {conn2, _} = api_conn_with_auth(user)
      conn2 = post(conn2, ~p"/api/enhance", %{session: @valid_session})
      resp2 = json_response(conn2, 200)

      assert resp2["usage"]["remaining"] == resp1["usage"]["remaining"] - 1
    end

    test "returns 401 for unauthenticated request", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/enhance", %{session: @valid_session})

      assert %{"error" => %{"code" => "AUTH_REQUIRED"}} = json_response(conn, 401)
    end

    test "returns 400 for missing session parameter" do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/enhance", %{})
      assert %{"error" => %{"code" => "MISSING_SESSION"}} = json_response(conn, 400)
    end

    test "returns 422 for invalid session (missing title)" do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/enhance", %{session: %{"projectName" => "test"}})
      assert %{"error" => %{"code" => "INVALID_SESSION"}} = json_response(conn, 422)
    end

    test "returns 429 when quota is exceeded" do
      {conn, user} = api_conn_with_auth()

      # Fill up quota
      for _ <- 1..10 do
        HeyiAm.LLM.log_usage(%{
          user_id: user.id,
          provider: "mock",
          model: "mock",
          status: "success"
        })
      end

      conn = post(conn, ~p"/api/enhance", %{session: @valid_session})
      resp = json_response(conn, 429)

      assert resp["error"]["code"] == "QUOTA_EXCEEDED"
      assert is_binary(resp["error"]["resets_at"])
    end
  end
end
