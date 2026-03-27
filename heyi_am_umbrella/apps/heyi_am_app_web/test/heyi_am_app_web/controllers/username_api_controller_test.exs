defmodule HeyiAmAppWeb.UsernameApiControllerTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import HeyiAm.AccountsFixtures

  describe "GET /api/username/check" do
    test "returns available for unused username", %{conn: conn} do
      conn = get(conn, ~p"/api/username/check?username=freshname123")
      assert json_response(conn, 200) == %{"available" => true}
    end

    test "returns taken for existing username", %{conn: conn} do
      user_fixture(%{username: "takenname"})
      conn = get(conn, ~p"/api/username/check?username=takenname")
      resp = json_response(conn, 200)
      assert resp["available"] == false
    end

    test "returns error for too-short username", %{conn: conn} do
      conn = get(conn, ~p"/api/username/check?username=ab")
      resp = json_response(conn, 200)
      assert resp["available"] == false
    end

    test "returns error for invalid characters", %{conn: conn} do
      conn = get(conn, ~p"/api/username/check?username=bad_name!")
      resp = json_response(conn, 200)
      assert resp["available"] == false
    end

    test "returns error when username param is missing", %{conn: conn} do
      conn = get(conn, ~p"/api/username/check")
      resp = json_response(conn, 400)
      assert resp["available"] == false
    end
  end
end
