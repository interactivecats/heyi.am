defmodule HeyiAmAppWeb.TimeStatsApiControllerTest do
  use HeyiAmAppWeb.ConnCase

  describe "POST /api/time-stats" do
    test "uploads time stats for authenticated user", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "timeuser#{System.unique_integer([:positive])}"})

      {conn, _} = api_conn_with_auth(user)

      conn = post(conn, ~p"/api/time-stats", %{
        time_stats: %{
          anonymized: false,
          projects: [%{name: "test-proj", your_minutes: 120, agent_minutes: 30, sessions: 5}],
          totals: %{your_minutes: 120, agent_minutes: 30}
        }
      })

      resp = json_response(conn, 200)
      assert resp["ok"] == true
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/time-stats", %{time_stats: %{}})

      assert %{"error" => _} = json_response(conn, 401)
    end
  end
end
