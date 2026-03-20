defmodule HeyiAmWeb.DeviceApiControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  alias HeyiAm.Accounts

  describe "POST /api/device/authorize" do
    test "creates a pending device authorization", %{conn: conn} do
      conn = post(conn, ~p"/api/device/authorize")
      assert %{"device_code" => dc, "user_code" => uc} = json_response(conn, 200)
      assert is_binary(dc)
      assert String.length(uc) == 6
      assert %{"verification_uri" => _, "expires_in" => 600, "interval" => 5} =
               json_response(conn, 200)
    end
  end

  describe "POST /api/device/token" do
    test "returns pending for a new device auth", %{conn: conn} do
      {:ok, da} = Accounts.create_device_authorization()

      conn = post(conn, ~p"/api/device/token", %{device_code: da.device_code})
      assert %{"status" => "pending"} = json_response(conn, 200)
    end

    test "returns authorized with token after approval", %{conn: conn} do
      user = HeyiAm.AccountsFixtures.user_fixture()
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)

      conn = post(conn, ~p"/api/device/token", %{device_code: da.device_code})
      response = json_response(conn, 200)
      assert response["status"] == "authorized"
      assert is_binary(response["token"])
      assert is_map(response["user"])
    end

    test "clears token after first retrieval", %{conn: conn} do
      user = HeyiAm.AccountsFixtures.user_fixture()
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)

      # First poll gets the token
      conn1 = post(conn, ~p"/api/device/token", %{device_code: da.device_code})
      assert %{"token" => token} = json_response(conn1, 200)
      assert is_binary(token)

      # Second poll gets nil token
      conn2 = post(build_conn(), ~p"/api/device/token", %{device_code: da.device_code})
      assert %{"token" => nil} = json_response(conn2, 200)
    end

    test "returns not_found for invalid device code", %{conn: conn} do
      conn = post(conn, ~p"/api/device/token", %{device_code: "bad"})
      assert json_response(conn, 404)["error"] == "not_found"
    end

    test "returns error when device_code is missing", %{conn: conn} do
      conn = post(conn, ~p"/api/device/token", %{})
      assert json_response(conn, 400)["error"] == "missing_parameter"
    end
  end
end
