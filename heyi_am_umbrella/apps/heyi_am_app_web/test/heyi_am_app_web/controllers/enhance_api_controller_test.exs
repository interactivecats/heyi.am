defmodule HeyiAmAppWeb.EnhanceApiControllerTest do
  use HeyiAmAppWeb.ConnCase

  describe "POST /api/enhance" do
    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/enhance", %{session: %{title: "test"}})

      assert %{"error" => %{"code" => "AUTH_REQUIRED"}} = json_response(conn, 401)
    end

    test "returns 400 without session param", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = post(conn, ~p"/api/enhance", %{})
      assert %{"error" => %{"code" => "MISSING_SESSION"}} = json_response(conn, 400)
    end
  end
end
