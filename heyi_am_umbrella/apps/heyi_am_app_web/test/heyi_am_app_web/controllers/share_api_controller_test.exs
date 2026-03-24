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

  describe "GET /api/sessions/:token/verify" do
    test "returns 404 for non-existent token", %{conn: conn} do
      conn = get(conn, ~p"/api/sessions/nonexistent/verify")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
    end
  end
end
