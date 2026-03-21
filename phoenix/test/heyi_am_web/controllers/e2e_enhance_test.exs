defmodule HeyiAmWeb.E2EEnhanceTest do
  @moduledoc """
  End-to-end round-trip tests for the LLM proxy enhance flow.
  Verifies: auth → enhance → quota decrement → quota exhaustion.
  Uses the mock provider configured in test.exs.
  """
  use HeyiAmWeb.ConnCase, async: true

  @valid_session %{
    "title" => "E2E: Replaced mock data with real DB queries",
    "projectName" => "heyi-am",
    "durationMinutes" => 32,
    "turns" => 45,
    "linesOfCode" => 1200,
    "skills" => ["Elixir", "Phoenix", "Ecto"],
    "toolBreakdown" => [
      %{"tool" => "Read", "count" => 25},
      %{"tool" => "Edit", "count" => 12}
    ],
    "filesChanged" => [
      %{"path" => "lib/controllers/share_controller.ex", "additions" => 40, "deletions" => 15},
      %{"path" => "lib/controllers/portfolio_controller.ex", "additions" => 30, "deletions" => 10}
    ],
    "executionPath" => [
      %{"stepNumber" => 1, "type" => "investigation", "title" => "Found mock data", "description" => "Controllers used hardcoded attributes"},
      %{"stepNumber" => 2, "type" => "implementation", "title" => "Wired DB queries", "description" => "Replaced all mock attributes with Repo calls"}
    ],
    "turnTimeline" => [
      %{"type" => "prompt", "timestamp" => "00:02", "content" => "The pages render but the data is fake"},
      %{"type" => "prompt", "timestamp" => "00:15", "content" => "Replace all mock data with real queries"}
    ],
    "rawLog" => [
      "Read lib/controllers/share_controller.ex",
      "Found @mock_share attribute",
      "Replaced with Shares.get_share_by_token!/1"
    ]
  }

  describe "full enhance round-trip" do
    test "authenticated user can enhance and quota decrements", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      # First enhancement — should succeed
      conn1 = post(conn, ~p"/api/enhance", %{session: @valid_session})
      resp1 = json_response(conn1, 200)

      assert is_map(resp1["result"])
      assert is_binary(resp1["result"]["title"])
      assert is_binary(resp1["result"]["context"])
      assert is_binary(resp1["result"]["developerTake"])
      assert is_list(resp1["result"]["skills"])
      assert is_list(resp1["result"]["questions"])
      assert is_list(resp1["result"]["executionSteps"])
      assert resp1["usage"]["remaining"] == 9

      # Second enhancement — quota decrements further
      {conn2, _} = api_conn_with_auth(user)
      conn2 = post(conn2, ~p"/api/enhance", %{session: @valid_session})
      resp2 = json_response(conn2, 200)
      assert resp2["usage"]["remaining"] == 8
    end

    test "unauthenticated user gets 401" do
      conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/enhance", %{session: @valid_session})

      assert %{"error" => %{"code" => "AUTH_REQUIRED"}} = json_response(conn, 401)
    end

    test "quota exhaustion returns 429 with reset date" do
      {conn, user} = api_conn_with_auth()

      # Exhaust quota
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

      # Verify reset date is first of next month
      {:ok, reset_date} = Date.from_iso8601(resp["error"]["resets_at"])
      assert reset_date.day == 1
    end

    test "invalid session returns 422" do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/enhance", %{session: %{"projectName" => "test"}})

      assert %{"error" => %{"code" => "INVALID_SESSION"}} = json_response(conn, 422)
    end

    test "missing session parameter returns 400" do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/enhance", %{})

      assert %{"error" => %{"code" => "MISSING_SESSION"}} = json_response(conn, 400)
    end

    test "enhancement result has correct structure from mock provider" do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/enhance", %{session: @valid_session})
      resp = json_response(conn, 200)

      result = resp["result"]

      # Verify all fields present and correctly typed
      assert String.length(result["title"]) <= 80
      assert String.length(result["context"]) <= 200
      assert String.length(result["developerTake"]) <= 300

      assert length(result["questions"]) <= 3
      for q <- result["questions"] do
        assert is_binary(q["text"])
        assert is_binary(q["suggestedAnswer"])
      end

      assert length(result["executionSteps"]) <= 7
      for step <- result["executionSteps"] do
        assert is_integer(step["stepNumber"])
        assert is_binary(step["title"])
        assert is_binary(step["body"])
      end
    end

    test "failed enhancements don't count against quota" do
      {conn, user} = api_conn_with_auth()

      # Use up 9 of 10 quota
      for _ <- 1..9 do
        HeyiAm.LLM.log_usage(%{
          user_id: user.id,
          provider: "mock",
          model: "mock",
          status: "success"
        })
      end

      # Log some failures — these should NOT count
      for _ <- 1..5 do
        HeyiAm.LLM.log_usage(%{
          user_id: user.id,
          provider: "mock",
          model: "mock",
          status: "error",
          error_code: "UPSTREAM_ERROR"
        })
      end

      # Should still be able to enhance (1 remaining)
      conn = post(conn, ~p"/api/enhance", %{session: @valid_session})
      resp = json_response(conn, 200)
      assert resp["usage"]["remaining"] == 0

      # NOW quota should be exhausted
      {conn2, _} = api_conn_with_auth(user)
      conn2 = post(conn2, ~p"/api/enhance", %{session: @valid_session})
      assert %{"error" => %{"code" => "QUOTA_EXCEEDED"}} = json_response(conn2, 429)
    end
  end
end
