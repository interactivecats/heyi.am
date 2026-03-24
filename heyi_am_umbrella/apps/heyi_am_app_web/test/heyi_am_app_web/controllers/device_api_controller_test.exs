defmodule HeyiAmAppWeb.DeviceApiControllerTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import HeyiAm.AccountsFixtures

  describe "POST /api/device/code" do
    test "returns device code payload", %{conn: conn} do
      conn = post(conn, ~p"/api/device/code")
      resp = json_response(conn, 200)

      assert is_binary(resp["device_code"])
      assert resp["user_code"] =~ ~r/^[A-Z2-9]{4}-[A-Z2-9]{4}$/
      assert is_binary(resp["verification_uri"])
      assert resp["expires_in"] > 0
      assert resp["interval"] == 5
    end

    test "verification_uri includes /device path with code param", %{conn: conn} do
      conn = post(conn, ~p"/api/device/code")
      resp = json_response(conn, 200)
      assert resp["verification_uri"] =~ "/device?code="
      assert resp["verification_uri"] =~ resp["user_code"]
    end
  end

  describe "POST /api/device/token" do
    test "returns authorization_pending for unapproved code", %{conn: conn} do
      conn1 = post(conn, ~p"/api/device/code")
      %{"device_code" => device_code} = json_response(conn1, 200)

      conn2 = post(conn, ~p"/api/device/token", %{device_code: device_code})
      assert %{"error" => "authorization_pending"} = json_response(conn2, 400)
    end

    test "returns access_token after authorization", %{conn: conn} do
      conn1 = post(conn, ~p"/api/device/code")
      %{"device_code" => device_code, "user_code" => user_code} = json_response(conn1, 200)

      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.authorize_device_code(user_code, user)

      conn2 = post(conn, ~p"/api/device/token", %{device_code: device_code})
      resp = json_response(conn2, 200)
      assert is_binary(resp["access_token"])
      assert is_binary(resp["username"])
    end

    test "returns error for missing device_code", %{conn: conn} do
      conn = post(conn, ~p"/api/device/token", %{})
      assert %{"error" => "missing_device_code"} = json_response(conn, 400)
    end

    test "returns error for invalid base64", %{conn: conn} do
      conn = post(conn, ~p"/api/device/token", %{device_code: "not-valid-base64!!!"})
      assert %{"error" => _} = json_response(conn, 400)
    end
  end

  describe "GET /api/auth/status" do
    test "returns authenticated false without token", %{conn: conn} do
      conn = get(conn, ~p"/api/auth/status")
      assert %{"authenticated" => false} = json_response(conn, 200)
    end

    test "returns authenticated true with valid token", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()
      conn = get(conn, ~p"/api/auth/status")
      assert %{"authenticated" => true} = json_response(conn, 200)
    end

    test "returns false for invalid token", %{conn: conn} do
      conn =
        conn
        |> put_req_header("authorization", "Bearer invalidtoken")
        |> get(~p"/api/auth/status")

      assert %{"authenticated" => false} = json_response(conn, 200)
    end
  end
end
