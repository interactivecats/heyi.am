defmodule HeyiAmWeb.ShareControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  defp create_share_with_user(_context) do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "testdev"})

    {:ok, user} =
      HeyiAm.Accounts.update_user_profile(user, %{display_name: "Test Developer"})

    {:ok, share} =
      HeyiAm.Shares.create_share(%{
        token: "real-token-123",
        title: "Rebuilding the auth system",
        dev_take: "The old auth was a mess of layered tokens.",
        duration_minutes: 47,
        turns: 77,
        files_changed: 34,
        loc_changed: 2400,
        recorded_at: ~U[2026-03-12 14:02:00Z],
        verified_at: ~U[2026-03-12 14:49:00Z],
        sealed: false,
        template: "editorial",
        language: "Elixir",
        tools: ["Elixir", "Phoenix"],
        skills: ["Elixir", "Phoenix", "Authentication"],
        project_name: "heyi.am",
        status: "listed",
        user_id: user.id,
        beats: [
          %{"label" => "Review auth flow", "description" => "Found 3 token systems"},
          %{"label" => "Scaffold fresh", "description" => "Clean phx.gen.auth"}
        ],
        qa_pairs: [
          %{
            "question" => "Why tear out auth entirely?",
            "answer" => "Three token systems is a security liability."
          }
        ],
        highlights: [
          %{"type" => "pivot", "title" => "Rejected patch", "description" => "Chose rewrite."},
          %{"type" => "win", "title" => "Tests passing", "description" => "309 green."}
        ],
        tool_breakdown: [
          %{"name" => "Read", "count" => 142},
          %{"name" => "Edit", "count" => 92}
        ],
        top_files: [
          %{"path" => "lib/auth.ex", "touches" => 12}
        ],
        transcript_excerpt: [
          %{"role" => "dev", "text" => "The old auth was frankencode"},
          %{"role" => "ai", "text" => "I can help patch..."},
          %{"role" => "dev", "text" => "No. Tear it all out."}
        ],
        narrative: "This session rebuilt the authentication system from scratch."
      })

    %{share: share, user: user}
  end

  describe "GET /s/:token (case study)" do
    setup [:create_share_with_user]

    test "renders case study page with real session data", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)

      assert html =~ "Rebuilding the auth system"
      assert html =~ "tpl-editorial"
      assert html =~ "47m"
      assert html =~ "2.4k"
      assert html =~ "The old auth was a mess"
      assert html =~ "skill-chip"
      assert html =~ "Elixir"
      assert html =~ "qa-pair"
      assert html =~ "Why tear out auth entirely?"
      assert html =~ "exec-path"
      assert html =~ "Review auth flow"
      assert html =~ "Test Developer"
      assert html =~ "Pivot"
      assert html =~ "Win"
      assert html =~ "Tool breakdown"
      assert html =~ "Full narrative"
    end

    test "returns 404 for non-existent token", %{conn: conn} do
      conn = get(conn, ~p"/s/nonexistent-token")
      assert html_response(conn, 404)
    end

    test "includes link to transcript", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)
      assert html =~ "/s/real-token-123/transcript"
    end

    test "includes link to author portfolio", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)
      assert html =~ "/testdev"
    end
  end

  describe "template rendering" do
    setup [:create_share_with_user]

    test "defaults to editorial template", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)
      assert html =~ "tpl-editorial"
    end

    test "template query param overrides to terminal", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123?template=terminal")
      html = html_response(conn, 200)
      assert html =~ "tpl-terminal"
      assert html =~ "Terminal Session"
      refute html =~ "tpl-editorial"
    end

    test "template query param overrides to minimal", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123?template=minimal")
      html = html_response(conn, 200)
      assert html =~ "tpl-minimal"
    end

    test "template query param overrides to brutalist", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123?template=brutalist")
      html = html_response(conn, 200)
      assert html =~ "tpl-brutalist"
      assert html =~ "chip--inverted"
      assert html =~ "SESSION ID:"
    end

    test "template query param overrides to campfire", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123?template=campfire")
      html = html_response(conn, 200)
      assert html =~ "tpl-campfire"
      assert html =~ "Your Take"
    end

    test "template query param overrides to neon-night", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123?template=neon-night")
      html = html_response(conn, 200)
      assert html =~ "tpl-neon-night"
      assert html =~ "System Optimized"
    end

    test "invalid template name falls back to editorial", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123?template=nonexistent")
      html = html_response(conn, 200)
      assert html =~ "tpl-editorial"
    end
  end

  describe "gone session page" do
    test "renders gone page for deleted token", %{conn: conn} do
      conn = get(conn, ~p"/s/deleted")
      html = html_response(conn, 410)

      assert html =~ "Session Removed"
      assert html =~ "Token: deleted"
    end

    test "renders gone page for expired token", %{conn: conn} do
      conn = get(conn, ~p"/s/expired")
      html = html_response(conn, 410)

      assert html =~ "Session Removed"
      assert html =~ "Token: expired"
    end
  end

  describe "GET /s/:token/transcript" do
    setup [:create_share_with_user]

    test "renders transcript page with turns", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123/transcript")
      html = html_response(conn, 200)

      assert html =~ "Rebuilding the auth system"
      assert html =~ "frankencode"
      assert html =~ "I can help patch"
      assert html =~ "Tear it all out"
      assert html =~ "transcript-avatar--dev"
      assert html =~ "transcript-avatar--ai"
    end

    test "returns 404 for non-existent token", %{conn: conn} do
      conn = get(conn, ~p"/s/nonexistent-token/transcript")
      assert html_response(conn, 404)
    end

    test "shows turn count in topbar", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123/transcript")
      html = html_response(conn, 200)
      assert html =~ "77 turns total"
    end
  end

  describe "GET /s/:token/verify" do
    setup [:create_share_with_user]

    test "renders verification page with hash and status", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123/verify")
      html = html_response(conn, 200)
      assert html =~ "Session Verification"
      assert html =~ "Content Hash"
      assert html =~ "Signature Status"
      assert html =~ "UNVERIFIED"
    end

    test "returns 404 for non-existent token", %{conn: conn} do
      conn = get(conn, ~p"/s/nonexistent-token/verify")
      assert html_response(conn, 404)
    end

    test "includes link back to session", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123/verify")
      html = html_response(conn, 200)
      assert html =~ "/s/real-token-123"
    end
  end

  describe "GET /:username/:project/:session (friendly URL)" do
    setup do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "devuser"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          slug: "my-project",
          title: "My Project",
          user_id: user.id
        })

      {:ok, share} =
        HeyiAm.Shares.create_share(%{
          token: "friendly-token",
          slug: "auth-rewrite",
          title: "Auth Rewrite",
          dev_take: "Rewrote everything.",
          status: "listed",
          user_id: user.id,
          project_id: project.id
        })

      %{user: user, project: project, share: share}
    end

    test "renders session via slug", %{conn: conn} do
      conn = get(conn, ~p"/devuser/my-project/auth-rewrite")
      html = html_response(conn, 200)
      assert html =~ "Auth Rewrite"
    end

    test "falls back to token when no slug match", %{conn: conn} do
      conn = get(conn, ~p"/devuser/my-project/friendly-token")
      assert html_response(conn, 200) =~ "Auth Rewrite"
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn = get(conn, "/nobody/my-project/some-session")
      assert html_response(conn, 404)
    end

    test "returns 404 for non-existent session slug", %{conn: conn} do
      conn = get(conn, ~p"/devuser/my-project/no-such-session")
      assert html_response(conn, 404)
    end
  end
end
