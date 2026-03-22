defmodule HeyiAmWeb.ApiContractTest do
  @moduledoc """
  API contract tests verifying that Phoenix endpoints accept the payload
  shapes the CLI sends and return the response shapes the CLI expects.
  """
  use HeyiAmWeb.ConnCase

  import HeyiAm.SharesFixtures

  # ──────────────────────────────────────────────────────────────
  # POST /api/sessions — Share creation endpoint
  # ──────────────────────────────────────────────────────────────

  describe "POST /api/sessions — endpoint exists and accepts CLI payload shape" do
    test "accepts minimal payload: session with title only", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{session: %{title: "Test Session"}})

      resp = json_response(conn, 201)
      assert is_binary(resp["token"])
      assert String.starts_with?(resp["url"], "/s/")
      assert is_boolean(resp["sealed"])
      assert String.starts_with?(resp["content_hash"], "sha256:")
    end

    test "accepts full CLI publish payload with all Share fields", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn =
        post(conn, ~p"/api/sessions", %{
          session: %{
            title: "Auth rebuild with phx.gen.auth",
            dev_take: "Three token systems was a security liability.",
            duration_minutes: 47,
            turns: 77,
            files_changed: 34,
            loc_changed: 2400,
            recorded_at: "2026-03-12T14:02:00Z",
            sealed: false,
            template: "editorial",
            language: "Elixir",
            tools: ["Elixir", "Phoenix", "PostgreSQL"],
            skills: ["Elixir", "Phoenix", "Authentication"],
            beats: [%{label: "Step 1", description: "Analyzed auth"}],
            qa_pairs: [%{question: "Why?", answer: "Because."}],
            highlights: [%{type: "pivot", title: "Rejected patch", description: "Chose rewrite"}],
            tool_breakdown: [%{name: "Read", count: 142}],
            top_files: [%{path: "lib/accounts.ex", touches: 9}],
            transcript_excerpt: [%{role: "dev", text: "Tear it out."}],
            narrative: "This session began with a critical review.",
            project_name: "heyi-am",
            signature: "dGVzdHNpZw==",
            public_key: "dGVzdHB1Yg=="
          }
        })

      assert %{"token" => _, "url" => _, "sealed" => _, "content_hash" => _} =
               json_response(conn, 201)
    end

    test "returns 400 when session param is missing", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{})

      assert %{"error" => %{"code" => "MISSING_SESSION"}} = json_response(conn, 400)
    end

    test "returns 422 when title is empty", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{session: %{title: ""}})

      resp = json_response(conn, 422)
      assert resp["error"]["code"] == "VALIDATION_FAILED"
      assert is_map(resp["error"]["details"])
    end

    test "validates template against allowed list", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Template Test", template: "invalid-template"}
      })

      assert %{"error" => %{"code" => "VALIDATION_FAILED"}} = json_response(conn, 422)
    end

    test "accepts all valid templates", %{conn: _conn} do
      for template <- ~w(editorial terminal minimal brutalist campfire neon-night) do
        {conn, _user} = api_conn_with_auth()

        resp =
          conn
          |> post(~p"/api/sessions", %{
            session: %{title: "Template #{template}", template: template}
          })
          |> json_response(201)

        assert is_binary(resp["token"]),
               "Expected 201 for template #{template}"
      end
    end
  end

  # ──────────────────────────────────────────────────────────────
  # Authenticated publish — Bearer token
  # ──────────────────────────────────────────────────────────────

  describe "POST /api/sessions — authenticated publish" do
    test "links share to user when valid Bearer token is provided", %{conn: _conn} do
      {conn, user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{
        session: %{title: "Authenticated Session"}
      })

      resp = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token!(resp["token"])
      assert share.user_id == user.id
    end

    test "returns 401 when no auth header provided", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/sessions", %{
          session: %{title: "Anonymous Session"}
        })

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 401 when invalid Bearer token provided", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer invalid-garbage-token")
        |> post(~p"/api/sessions", %{
          session: %{title: "Bad Token Session"}
        })

      assert %{"error" => _} = json_response(conn, 401)
    end
  end

  # ──────────────────────────────────────────────────────────────
  # GET /api/sessions/:token/verify — Signature verification
  # ──────────────────────────────────────────────────────────────

  describe "GET /api/sessions/:token/verify — verification endpoint" do
    test "returns verification data for existing share", %{conn: conn} do
      share = share_fixture(%{title: "Verify Contract"})

      conn = get(conn, ~p"/api/sessions/#{share.token}/verify")
      resp = json_response(conn, 200)

      assert resp["token"] == share.token
      assert String.starts_with?(resp["content_hash"], "sha256:")
      assert is_boolean(resp["signed"])
      assert is_boolean(resp["verified"])
      assert is_boolean(resp["sealed"])
    end

    test "returns signed: false for unsigned share", %{conn: conn} do
      share = share_fixture(%{title: "Unsigned"})

      conn = get(conn, ~p"/api/sessions/#{share.token}/verify")
      resp = json_response(conn, 200)

      assert resp["signed"] == false
      assert resp["verified"] == false
    end

    test "returns 404 for nonexistent token", %{conn: conn} do
      conn = get(conn, ~p"/api/sessions/nonexistent-token-xyz/verify")

      assert %{"error" => %{"code" => "NOT_FOUND"}} = json_response(conn, 404)
    end
  end

  # ──────────────────────────────────────────────────────────────
  # Response shape contract
  # ──────────────────────────────────────────────────────────────

  describe "Response shape contract — CLI relies on these exact keys" do
    test "create success returns {token, url, sealed, content_hash}", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      conn = post(conn, ~p"/api/sessions", %{session: %{title: "Shape Test"}})

      resp = json_response(conn, 201)

      # CLI reads these exact keys
      assert Map.has_key?(resp, "token")
      assert Map.has_key?(resp, "url")
      assert Map.has_key?(resp, "sealed")
      assert Map.has_key?(resp, "content_hash")

      # Type checks
      assert is_binary(resp["token"])
      assert is_binary(resp["url"])
      assert is_boolean(resp["sealed"])
      assert is_binary(resp["content_hash"])
    end

    test "verify response returns {token, content_hash, signed, verified, sealed, recorded_at, verified_at}", %{conn: conn} do
      share = share_fixture(%{title: "Shape Verify"})

      conn = get(conn, ~p"/api/sessions/#{share.token}/verify")
      resp = json_response(conn, 200)

      assert Map.has_key?(resp, "token")
      assert Map.has_key?(resp, "content_hash")
      assert Map.has_key?(resp, "signed")
      assert Map.has_key?(resp, "verified")
      assert Map.has_key?(resp, "sealed")
      # recorded_at and verified_at may be nil
      assert Map.has_key?(resp, "recorded_at")
      assert Map.has_key?(resp, "verified_at")
    end

    test "error responses always have {error: {code: string, ...}}", %{conn: _conn} do
      # Missing session (needs auth to get past 401)
      {conn1, _user} = api_conn_with_auth()
      conn1 = post(conn1, ~p"/api/sessions", %{})

      resp1 = json_response(conn1, 400)
      assert is_binary(resp1["error"]["code"])

      # Validation failure (needs auth to get past 401)
      {conn2, _user} = api_conn_with_auth()
      conn2 = post(conn2, ~p"/api/sessions", %{session: %{title: ""}})

      resp2 = json_response(conn2, 422)
      assert is_binary(resp2["error"]["code"])

      # Not found (GET verify doesn't need auth)
      conn3 = get(build_conn(), ~p"/api/sessions/nonexistent/verify")
      resp3 = json_response(conn3, 404)
      assert is_binary(resp3["error"]["code"])
    end
  end
end
