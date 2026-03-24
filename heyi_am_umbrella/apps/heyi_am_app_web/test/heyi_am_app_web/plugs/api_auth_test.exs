defmodule HeyiAmAppWeb.Plugs.ApiAuthTest do
  use HeyiAmAppWeb.ConnCase, async: true

  alias HeyiAmAppWeb.Plugs.ApiAuth

  test "assigns current_user_id for valid Bearer token", %{conn: _conn} do
    {conn, user} = api_conn_with_auth()

    conn = ApiAuth.call(conn, ApiAuth.init([]))

    assert conn.assigns[:current_user_id] == user.id
    refute conn.halted
  end

  test "does not assign or halt for missing Authorization header", %{conn: conn} do
    conn = ApiAuth.call(conn, ApiAuth.init([]))

    refute Map.has_key?(conn.assigns, :current_user_id)
    refute conn.halted
  end

  test "does not assign or halt for invalid token", %{conn: conn} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer invalidtoken")
      |> ApiAuth.call(ApiAuth.init([]))

    refute Map.has_key?(conn.assigns, :current_user_id)
    refute conn.halted
  end

  test "does not assign or halt for malformed Base64", %{conn: conn} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer !!!not-base64!!!")
      |> ApiAuth.call(ApiAuth.init([]))

    refute Map.has_key?(conn.assigns, :current_user_id)
    refute conn.halted
  end
end
