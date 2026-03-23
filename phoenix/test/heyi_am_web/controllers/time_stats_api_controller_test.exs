defmodule HeyiAmWeb.TimeStatsApiControllerTest do
  use HeyiAmWeb.ConnCase

  describe "POST /api/time-stats" do
    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/time-stats", %{time_stats: %{totals: %{}, projects: []}})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "publishes time stats with valid auth" do
      {conn, user} = api_conn_with_auth()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "timestatsuser#{System.unique_integer([:positive])}"})
      {conn, _} = api_conn_with_auth(user)

      conn = post(conn, ~p"/api/time-stats", %{
        time_stats: %{
          totals: %{your_minutes: 100, agent_minutes: 50},
          projects: [%{name: "proj", your_minutes: 100, agent_minutes: 50, sessions: 3}]
        }
      })

      assert %{"ok" => true, "url" => url} = json_response(conn, 200)
      assert url =~ "/time"
    end
  end
end
