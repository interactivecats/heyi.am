defmodule HeyiAmAppWeb.AdminAuthTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  describe "admin dashboard access" do
    test "unauthenticated user is redirected from admin dashboard", %{conn: conn} do
      assert {:error, {:redirect, %{to: "/users/log-in"}}} =
               live(conn, "/admin/dashboard")
    end

    setup :register_and_log_in_user

    test "authenticated non-admin user is redirected in prod mode", %{conn: conn} do
      # In test env, :env is :test (not :dev), so the dev? bypass is inactive
      # and the user must be in ADMIN_EMAILS to access the dashboard.
      # Since the test user's email is not in ADMIN_EMAILS, they should be redirected.
      assert {:error, {:redirect, %{to: "/users/log-in"}}} =
               live(conn, "/admin/dashboard")
    end
  end
end
