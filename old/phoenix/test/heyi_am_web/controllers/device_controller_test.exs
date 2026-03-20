defmodule HeyiAmWeb.DeviceControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  alias HeyiAm.Accounts

  describe "GET /device (not logged in)" do
    test "redirects to login", %{conn: conn} do
      conn = get(conn, ~p"/device?code=ABC123")
      assert redirected_to(conn) =~ "/users/log-in"
    end
  end

  describe "GET /device (logged in)" do
    setup :register_and_log_in_user

    test "renders the authorize page with a valid code", %{conn: conn} do
      {:ok, da} = Accounts.create_device_authorization()
      conn = get(conn, ~p"/device?code=#{da.user_code}")
      assert html_response(conn, 200) =~ "Authorize Device"
      assert html_response(conn, 200) =~ da.user_code
    end

    test "renders the code entry form without a code", %{conn: conn} do
      conn = get(conn, ~p"/device")
      assert html_response(conn, 200) =~ "Connect your CLI"
      assert html_response(conn, 200) =~ "Device Code"
    end

    test "shows warning for invalid code", %{conn: conn} do
      conn = get(conn, ~p"/device?code=ZZZZZZ")
      assert html_response(conn, 200) =~ "not found or expired"
    end
  end

  describe "POST /device/authorize (logged in)" do
    setup :register_and_log_in_user

    test "authorizes a valid device code", %{conn: conn} do
      {:ok, da} = Accounts.create_device_authorization()
      conn = post(conn, ~p"/device/authorize", %{user_code: da.user_code})
      assert html_response(conn, 200) =~ "CLI connected!"
    end

    test "shows error for invalid code", %{conn: conn} do
      conn = post(conn, ~p"/device/authorize", %{user_code: "ZZZZZZ"})
      assert redirected_to(conn) == "/device"
      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "Invalid or expired"
    end
  end

  describe "Bearer auth plug" do
    test "assigns current_user when valid token is present", %{conn: conn} do
      user = HeyiAm.AccountsFixtures.user_fixture()
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)
      {:ok, :authorized, token, _} = Accounts.check_device_token(da.device_code)

      conn =
        conn
        |> put_req_header("authorization", "Bearer #{token}")
        |> HeyiAmWeb.Plugs.BearerAuth.call([])

      assert conn.assigns[:current_user].id == user.id
    end

    test "does not assign current_user for invalid token", %{conn: conn} do
      conn =
        conn
        |> put_req_header("authorization", "Bearer invalid-token")
        |> HeyiAmWeb.Plugs.BearerAuth.call([])

      refute Map.has_key?(conn.assigns, :current_user)
    end

    test "does not assign current_user when no header", %{conn: conn} do
      conn = HeyiAmWeb.Plugs.BearerAuth.call(conn, [])
      refute Map.has_key?(conn.assigns, :current_user)
    end
  end
end
