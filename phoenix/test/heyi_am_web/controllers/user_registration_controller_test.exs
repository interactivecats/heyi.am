defmodule HeyiAmWeb.UserRegistrationControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  import HeyiAm.AccountsFixtures

  describe "GET /users/register" do
    test "renders registration page", %{conn: conn} do
      conn = get(conn, ~p"/users/register")
      response = html_response(conn, 200)
      assert response =~ "Create your account"
      assert response =~ ~p"/users/log-in"
      assert response =~ "Password"
    end

    test "redirects if already logged in", %{conn: conn} do
      conn = conn |> log_in_user(user_fixture()) |> get(~p"/users/register")

      # User has no username yet, so redirects to onboarding
      assert redirected_to(conn) == ~p"/onboarding/username"
    end
  end

  describe "POST /users/register" do
    test "creates account and logs in", %{conn: conn} do
      email = unique_user_email()

      conn =
        post(conn, ~p"/users/register", %{
          "user" => %{"email" => email, "password" => valid_user_password()}
        })

      assert get_session(conn, :user_token)
      assert redirected_to(conn) == ~p"/onboarding/username"

      assert conn.assigns.flash["info"] =~ "Account created successfully"
    end

    test "render errors for invalid data", %{conn: conn} do
      conn =
        post(conn, ~p"/users/register", %{
          "user" => %{"email" => "with spaces", "password" => "short"}
        })

      response = html_response(conn, 200)
      assert response =~ "Create your account"
      assert response =~ "must have the @ sign and no spaces"
      assert response =~ "should be at least 12 character(s)"
    end
  end
end
