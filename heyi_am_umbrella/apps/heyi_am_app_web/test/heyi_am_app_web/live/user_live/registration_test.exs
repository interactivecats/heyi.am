defmodule HeyiAmAppWeb.UserLive.RegistrationTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures

  describe "Registration page" do
    test "renders registration page", %{conn: conn} do
      {:ok, _lv, html} = live(conn, ~p"/users/register")

      assert html =~ "Create your account"
      assert html =~ "Log in"
    end

    test "redirects if already logged in", %{conn: conn} do
      result =
        conn
        |> log_in_user(user_fixture())
        |> live(~p"/users/register")
        |> follow_redirect(conn, ~p"/onboarding/username")

      assert {:ok, _conn} = result
    end

    test "renders errors for invalid data", %{conn: conn} do
      {:ok, lv, _html} = live(conn, ~p"/users/register")

      result =
        lv
        |> element("#registration_form")
        |> render_change(user: %{"email" => "with spaces"})

      assert result =~ "Create your account"
      assert result =~ "must have the @ sign and no spaces"
    end

    test "shows username field when username param is present", %{conn: conn} do
      {:ok, _lv, html} = live(conn, ~p"/users/register?username=testname")

      assert html =~ "heyi.am/"
      assert html =~ "testname"
    end
  end

  describe "register user" do
    test "creates account via form POST", %{conn: conn} do
      email = unique_user_email()

      conn =
        post(conn, ~p"/users/register", %{
          "user" => valid_user_attributes(email: email)
        })

      assert redirected_to(conn)
    end

    test "returns error for duplicated email", %{conn: conn} do
      user = user_fixture(%{email: "test@email.com"})

      conn =
        post(conn, ~p"/users/register", %{
          "user" => %{"email" => user.email, "password" => valid_user_password()}
        })

      assert redirected_to(conn) =~ ~p"/users/register"
      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "Registration failed"
    end
  end

  describe "registration navigation" do
    test "redirects to login page when the Log in button is clicked", %{conn: conn} do
      {:ok, lv, _html} = live(conn, ~p"/users/register")

      {:ok, _login_live, login_html} =
        lv
        |> element("main a", "Log in")
        |> render_click()
        |> follow_redirect(conn, ~p"/users/log-in")

      assert login_html =~ "Log in"
    end
  end
end
