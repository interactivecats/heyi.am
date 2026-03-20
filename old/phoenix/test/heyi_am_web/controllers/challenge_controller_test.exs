defmodule HeyiAmWeb.ChallengeControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  alias HeyiAm.AccountsFixtures
  alias HeyiAm.Challenges

  describe "GET /challenges/new (authenticated)" do
    setup :register_and_log_in_user

    test "renders the create challenge form", %{conn: conn} do
      conn = get(conn, ~p"/challenges/new")
      body = html_response(conn, 200)

      assert body =~ "Create Challenge"
      assert body =~ "Problem Statement"
    end
  end

  describe "GET /challenges/new (unauthenticated)" do
    test "redirects to login", %{conn: conn} do
      conn = get(conn, ~p"/challenges/new")
      assert redirected_to(conn) =~ "/users/log-in"
    end
  end

  describe "POST /challenges (authenticated)" do
    setup :register_and_log_in_user

    test "creates a challenge and redirects to show", %{conn: conn} do
      conn =
        post(conn, ~p"/challenges", %{
          "challenge" => %{
            "description" => "Build a rate limiter",
            "posted_by" => "Lead Eng"
          }
        })

      assert %{token: token} = redirected_params(conn)
      assert redirected_to(conn) == "/challenge/#{token}"

      challenge = Challenges.get_by_token(token)
      assert challenge.description == "Build a rate limiter"
      assert challenge.posted_by == "Lead Eng"
    end

    test "creates a private challenge with access code", %{conn: conn} do
      conn =
        post(conn, ~p"/challenges", %{
          "challenge" => %{
            "description" => "Private challenge",
            "access_code" => "secret123"
          }
        })

      assert %{token: token} = redirected_params(conn)
      challenge = Challenges.get_by_token(token)
      assert challenge.is_private == true
      assert challenge.access_code_hash != nil
    end

    test "re-renders form on invalid input", %{conn: conn} do
      conn =
        post(conn, ~p"/challenges", %{
          "challenge" => %{
            "description" => String.duplicate("x", 6000)
          }
        })

      assert html_response(conn, 200) =~ "Create Challenge"
    end
  end

  describe "GET /challenge/:token (public show)" do
    test "renders a public challenge", %{conn: conn} do
      user = AccountsFixtures.user_fixture()
      {:ok, challenge} = Challenges.create_challenge(user.id, %{"description" => "Test problem"})

      conn = get(conn, ~p"/challenge/#{challenge.token}")
      body = html_response(conn, 200)

      assert body =~ "Test problem"
      assert body =~ "Challenge"
    end

    test "returns 404 for nonexistent token", %{conn: conn} do
      conn = get(conn, ~p"/challenge/nonexistent")
      assert html_response(conn, 404)
    end

    test "gates private challenge with access code form", %{conn: conn} do
      user = AccountsFixtures.user_fixture()

      {:ok, challenge} =
        Challenges.create_challenge(user.id, %{
          "description" => "Secret problem",
          "access_code" => "mycode"
        })

      conn = get(conn, ~p"/challenge/#{challenge.token}")
      body = html_response(conn, 200)

      assert body =~ "Access Code Required"
      refute body =~ "Secret problem"
    end

    test "unlocks private challenge with correct access code", %{conn: conn} do
      user = AccountsFixtures.user_fixture()

      {:ok, challenge} =
        Challenges.create_challenge(user.id, %{
          "description" => "Secret problem",
          "access_code" => "mycode"
        })

      conn = get(conn, "/challenge/#{challenge.token}?access_code=mycode")
      body = html_response(conn, 200)

      assert body =~ "Secret problem"
    end

    test "shows error for wrong access code", %{conn: conn} do
      user = AccountsFixtures.user_fixture()

      {:ok, challenge} =
        Challenges.create_challenge(user.id, %{
          "description" => "Secret problem",
          "access_code" => "mycode"
        })

      conn = get(conn, "/challenge/#{challenge.token}?access_code=wrong")
      body = html_response(conn, 200)

      assert body =~ "Invalid access code"
      refute body =~ "Secret problem"
    end
  end

  describe "GET /challenge/:token/responses (authenticated, creator only)" do
    setup :register_and_log_in_user

    test "renders responses page for challenge creator", %{conn: conn, user: user} do
      {:ok, challenge} = Challenges.create_challenge(user.id, %{"description" => "My challenge"})

      conn = get(conn, ~p"/challenge/#{challenge.token}/responses")
      body = html_response(conn, 200)

      assert body =~ "Challenge Responses"
      assert body =~ "No responses yet"
    end

    test "returns 403 for non-creator", %{conn: conn} do
      other_user = AccountsFixtures.user_fixture()
      {:ok, challenge} = Challenges.create_challenge(other_user.id, %{"description" => "Other"})

      conn = get(conn, ~p"/challenge/#{challenge.token}/responses")
      assert conn.status == 403
    end

    test "returns 404 for nonexistent challenge", %{conn: conn} do
      conn = get(conn, ~p"/challenge/nonexistent/responses")
      assert html_response(conn, 404)
    end
  end

  describe "GET /challenge/:token/responses (unauthenticated)" do
    test "redirects to login", %{conn: conn} do
      conn = get(conn, ~p"/challenge/sometoken/responses")
      assert redirected_to(conn) =~ "/users/log-in"
    end
  end
end
