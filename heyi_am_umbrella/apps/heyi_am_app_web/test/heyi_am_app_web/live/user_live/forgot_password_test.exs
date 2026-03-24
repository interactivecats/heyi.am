defmodule HeyiAmAppWeb.UserLive.ForgotPasswordTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures

  describe "Forgot password page" do
    test "renders forgot password page", %{conn: conn} do
      {:ok, _lv, html} = live(conn, ~p"/users/reset-password")

      assert html =~ "Forgot your password?"
      assert html =~ "Send reset link"
    end

    test "sends reset email for existing user", %{conn: conn} do
      user = user_fixture()
      {:ok, lv, _html} = live(conn, ~p"/users/reset-password")

      lv
      |> form("#reset_password_form", user: %{"email" => user.email})
      |> render_submit()

      assert_redirect(lv, ~p"/users/log-in")
    end

    test "does not disclose if email is not registered", %{conn: conn} do
      {:ok, lv, _html} = live(conn, ~p"/users/reset-password")

      lv
      |> form("#reset_password_form", user: %{"email" => "nobody@example.com"})
      |> render_submit()

      assert_redirect(lv, ~p"/users/log-in")
    end
  end
end
