defmodule HeyiAmAppWeb.UserLive.ResetPasswordTest do
  use HeyiAmAppWeb.ConnCase, async: true

  alias HeyiAm.Accounts

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures

  setup do
    user = user_fixture()

    token =
      extract_user_token(fn url ->
        Accounts.deliver_user_reset_password_instructions(user, url)
      end)

    %{token: token, user: user}
  end

  describe "Reset password page" do
    test "renders reset password form", %{conn: conn, token: token} do
      {:ok, _lv, html} = live(conn, ~p"/users/reset-password/#{token}")

      assert html =~ "Reset password"
      assert html =~ "New password"
    end

    test "redirects with error for invalid token", %{conn: conn} do
      {:error, {:live_redirect, %{to: path, flash: flash}}} =
        live(conn, ~p"/users/reset-password/invalid-token")

      assert path == ~p"/users/log-in"
      assert %{"error" => "Reset password link is invalid or it has expired."} = flash
    end

    test "validates password on change", %{conn: conn, token: token} do
      {:ok, lv, _html} = live(conn, ~p"/users/reset-password/#{token}")

      result =
        lv
        |> element("#reset_password_form")
        |> render_change(%{"user" => %{"password" => "short"}})

      assert result =~ "should be at least 12 character(s)"
    end

    test "resets password with valid data", %{conn: conn, token: token, user: user} do
      {:ok, lv, _html} = live(conn, ~p"/users/reset-password/#{token}")

      lv
      |> form("#reset_password_form", user: %{
        "password" => "new valid password!",
        "password_confirmation" => "new valid password!"
      })
      |> render_submit()

      assert_redirect(lv, ~p"/users/log-in")
      assert Accounts.get_user_by_email_and_password(user.email, "new valid password!")
    end

    test "does not reset password with mismatched confirmation", %{conn: conn, token: token} do
      {:ok, lv, _html} = live(conn, ~p"/users/reset-password/#{token}")

      result =
        lv
        |> form("#reset_password_form", user: %{
          "password" => "new valid password!",
          "password_confirmation" => "does not match"
        })
        |> render_submit()

      assert result =~ "does not match password"
    end

    test "token is consumed after successful reset", %{conn: conn, token: token} do
      {:ok, lv, _html} = live(conn, ~p"/users/reset-password/#{token}")

      lv
      |> form("#reset_password_form", user: %{
        "password" => "new valid password!",
        "password_confirmation" => "new valid password!"
      })
      |> render_submit()

      assert_redirect(lv, ~p"/users/log-in")
      refute Accounts.get_user_by_reset_password_token(token)
    end
  end
end
