defmodule HeyiAmAppWeb.Integration.AuthFlowTest do
  @moduledoc """
  Integration test: register via fixture, log in with password, access settings, log out.
  """
  use HeyiAmAppWeb.ConnCase

  import HeyiAm.AccountsFixtures

  describe "full auth flow" do
    test "log in -> settings -> log out", %{conn: conn} do
      # Create user via fixture (registration is a LiveView, tested separately)
      user = user_fixture()

      # Log in with password
      conn =
        post(conn, ~p"/users/log-in", %{
          "user" => %{"email" => user.email, "password" => valid_user_password()}
        })

      assert redirected_to(conn) == ~p"/onboarding/username"

      # Access settings (requires sudo mode via log_in_user helper)
      conn =
        build_conn()
        |> log_in_user(user, token_authenticated_at: DateTime.utc_now(:second))

      conn = get(conn, ~p"/users/settings")
      assert html_response(conn, 200) =~ "Account Settings"

      # Log out
      conn = build_conn() |> log_in_user(user)
      conn = delete(conn, ~p"/users/log-out")
      assert redirected_to(conn) == ~p"/users/log-in"
    end
  end
end
