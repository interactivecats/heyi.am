defmodule HeyiAmWeb.ShareApiControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures
  import HeyiAm.ChallengesFixtures
  import HeyiAm.SharesFixtures

  describe "POST /api/sessions" do
    test "creates a session with valid data", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "My Test Session", duration_minutes: 30, turns: 10}
      })

      assert %{"token" => token, "url" => url} = json_response(conn, 201)
      assert String.starts_with?(url, "/s/")
      assert is_binary(token)
    end

    test "returns 401 without auth for non-challenge publish", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "No Auth"}
        })

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns error without session param", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{})

      assert %{"error" => %{"code" => "MISSING_SESSION"}} = json_response(conn, 400)
    end

    test "returns error with invalid data", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{session: %{title: ""}})

      assert %{"error" => %{"code" => "VALIDATION_FAILED"}} = json_response(conn, 422)
    end

    test "links to active challenge when slug provided", %{conn: conn} do
      user = user_fixture()
      challenge = challenge_fixture(user)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "Challenge Response"},
          challenge_slug: challenge.slug
        })

      assert %{"token" => token} = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token!(token)
      assert share.challenge_id == challenge.id
    end

    test "rejects publish to non-active challenge", %{conn: conn} do
      user = user_fixture()
      challenge = challenge_fixture(user, %{status: "draft"})

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "Response"},
          challenge_slug: challenge.slug
        })

      assert %{"error" => %{"code" => "CHALLENGE_NOT_ACTIVE"}} = json_response(conn, 409)
    end

    test "rejects publish with wrong access code", %{conn: conn} do
      user = user_fixture()
      challenge = challenge_fixture(user, %{access_code: "secret123"})

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "Response"},
          challenge_slug: challenge.slug,
          access_code: "wrong"
        })

      assert %{"error" => %{"code" => "INVALID_ACCESS_CODE"}} = json_response(conn, 403)
    end

    test "accepts publish with correct access code", %{conn: conn} do
      user = user_fixture()
      challenge = challenge_fixture(user, %{access_code: "secret123"})

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "Response"},
          challenge_slug: challenge.slug,
          access_code: "secret123"
        })

      assert %{"token" => _} = json_response(conn, 201)
    end

    test "rejects publish to nonexistent challenge", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "Response"},
          challenge_slug: "nonexistent"
        })

      assert %{"error" => %{"code" => "CHALLENGE_NOT_FOUND"}} = json_response(conn, 404)
    end

    test "returns content_hash in response", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Hash Test", duration_minutes: 15}
      })

      assert %{"content_hash" => hash} = json_response(conn, 201)
      assert String.starts_with?(hash, "sha256:")
    end
  end

  describe "GET /api/sessions/:token/verify" do
    test "verifies an existing session", %{conn: conn} do
      share = share_fixture(%{title: "Verify Me"})

      conn = get(conn, ~p"/api/sessions/#{share.token}/verify")
      resp = json_response(conn, 200)

      assert resp["token"] == share.token
      assert String.starts_with?(resp["content_hash"], "sha256:")
      assert resp["signed"] == false
      assert resp["verified"] == false
    end

    test "returns 404 for nonexistent token", %{conn: conn} do
      conn = get(conn, ~p"/api/sessions/nonexistent/verify")
      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
    end
  end

  describe "user_id spoofing prevention" do
    test "strips user_id from session params and uses token user", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Spoofed", user_id: 999}
      })

      assert %{"token" => token} = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token!(token)
      assert share.user_id == user.id
    end
  end

  describe "max_responses enforcement" do
    test "rejects publish when max responses reached", %{conn: _conn} do
      user = user_fixture()
      challenge = challenge_fixture(user, %{max_responses: 1})

      # First response succeeds
      conn1 =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "First Response"},
          challenge_slug: challenge.slug
        })

      assert %{"token" => _} = json_response(conn1, 201)

      # Second response rejected
      conn2 =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "Second Response"},
          challenge_slug: challenge.slug
        })

      assert %{"error" => %{"code" => "MAX_RESPONSES_REACHED"}} = json_response(conn2, 409)
    end
  end
end
