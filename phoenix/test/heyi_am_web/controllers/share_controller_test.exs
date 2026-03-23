defmodule HeyiAmWeb.ShareControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  defp create_share_with_user(_context) do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "testdev"})

    {:ok, user} =
      HeyiAm.Accounts.update_user_profile(user, %{display_name: "Test Developer"})

    # Rich data (beats, qa_pairs, etc.) lives in S3 session.json, not in the DB.
    # The mock ObjectStorage returns default camelCase test data for any key.
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
        session_storage_key: "sessions/real-token-123/session.json",
        narrative: "This session rebuilt the authentication system from scratch."
      })

    %{share: share, user: user}
  end

  describe "GET /s/:token (case study)" do
    setup [:create_share_with_user]

    test "renders case study page with real session data", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)

      # DB fields
      assert html =~ "Rebuilding the auth system"
      assert html =~ "47m"
      assert html =~ "2.4k"
      assert html =~ "The old auth was a mess"
      assert html =~ "skill-chip"
      assert html =~ "Elixir"
      assert html =~ "Test Developer"

      # S3 session.json data (served by mock, normalized from camelCase)
      assert html =~ "qa-pair"
      assert html =~ "Why tear out auth entirely?"
      assert html =~ "exec-path"
      assert html =~ "Review auth flow"
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

    test "includes OG meta tags for session", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)
      assert html =~ ~s(og:title" content="Rebuilding the auth system — Test Developer")
      assert html =~ ~s(og:description)
      assert html =~ ~s(og:url" content=")
      assert html =~ ~s(twitter:card" content="summary")
    end

    test "includes create-yours CTA", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)
      assert html =~ "Turn yours into proof"
    end
  end

  describe "template rendering" do
    setup [:create_share_with_user]

    test "renders editorial layout", %{conn: conn} do
      conn = get(conn, ~p"/s/real-token-123")
      html = html_response(conn, 200)
      assert html =~ "Editorial Documentation"
      assert html =~ "case-study-layout"
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

    test "renders transcript page header", %{conn: conn} do
      # Transcript body comes from log.json in S3 (fetched via presigned GET URL).
      # In test env the mock presigned URL isn't a real HTTP endpoint, so we get
      # the empty-transcript fallback — but the page still renders with metadata.
      conn = get(conn, ~p"/s/real-token-123/transcript")
      html = html_response(conn, 200)

      assert html =~ "Rebuilding the auth system"
      assert html =~ "77 turns total"
    end

    test "returns 404 for non-existent token", %{conn: conn} do
      conn = get(conn, ~p"/s/nonexistent-token/transcript")
      assert html_response(conn, 404)
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

    test "breadcrumb passes DB project slug not computed slug", %{conn: conn} do
      # The show_in_project action passes breadcrumb with the project_slug from the URL/DB
      conn = get(conn, ~p"/devuser/my-project/auth-rewrite")
      # The breadcrumb assign uses the DB slug, not a computed one
      assert conn.assigns[:breadcrumb].project_slug == "my-project"
    end
  end

  describe "clean_ai_tags/1" do
    alias HeyiAmWeb.ShareController

    test "removes antml_thinking blocks" do
      assert ShareController.clean_ai_tags("Hello <antml_thinking>thought</antml_thinking> world") ==
               "Hello  world"
    end

    test "removes system-reminder blocks" do
      assert ShareController.clean_ai_tags("Text <system-reminder>hidden</system-reminder> here") ==
               "Text  here"
    end

    test "removes multiline blocks" do
      input = "Before\n<antml_thinking>\nline 1\nline 2\n</antml_thinking>\nAfter"
      assert ShareController.clean_ai_tags(input) == "Before\n\nAfter"
    end

    test "returns empty string when only tags remain" do
      assert ShareController.clean_ai_tags("<antml_thinking>only</antml_thinking>") == ""
    end

    test "removes teammate-message blocks with attributes" do
      assert ShareController.clean_ai_tags(~s|Before <teammate-message teammate_id="team-lead">coordination</teammate-message> after|) ==
               "Before  after"
    end

    test "removes function_calls blocks" do
      assert ShareController.clean_ai_tags("Text <function_calls>invoke</function_calls> more") ==
               "Text  more"
    end

    test "passes through clean text unchanged" do
      assert ShareController.clean_ai_tags("Normal text") == "Normal text"
    end
  end

  describe "normalize_session_detail/1" do
    alias HeyiAmWeb.ShareController

    test "normalizes camelCase keys from CLI session.json" do
      cli_data = %{
        "executionPath" => [
          %{"stepNumber" => 1, "title" => "Setup", "description" => "Init project"},
          %{"stepNumber" => 2, "title" => "Build", "description" => "Core logic"}
        ],
        "qaPairs" => [%{"question" => "Why?", "answer" => "Because."}],
        "highlights" => [%{"type" => "win", "title" => "Done", "description" => "Shipped."}],
        "toolBreakdown" => [%{"tool" => "Read", "count" => 50}],
        "topFiles" => [%{"path" => "lib/app.ex", "additions" => 30, "deletions" => 5}],
        "transcriptExcerpt" => [%{"role" => "dev", "text" => "Hello"}],
        "turnTimeline" => [%{"timestamp" => "t1", "content" => "Do the thing", "tools" => ["Read"]}],
        "agentSummary" => %{"is_orchestrated" => true, "agents" => []}
      }

      result = ShareController.normalize_session_detail(cli_data)

      # Execution path: title → label
      assert [%{"label" => "Setup"}, %{"label" => "Build"}] = result["beats"]
      assert hd(result["beats"])["description"] == "Init project"

      # Q&A preserved
      assert [%{"question" => "Why?", "answer" => "Because."}] = result["qa_pairs"]

      # Highlights preserved
      assert [%{"type" => "win", "title" => "Done"}] = result["highlights"]

      # Tool breakdown: tool → name
      assert [%{"name" => "Read", "count" => 50}] = result["tool_breakdown"]

      # Top files: additions+deletions → touches
      assert [%{"path" => "lib/app.ex", "touches" => 35}] = result["top_files"]

      # Transcript preserved
      assert [%{"role" => "dev", "text" => "Hello"}] = result["transcript_excerpt"]

      # Turn timeline: content → prompt, index as turn number
      assert [%{"turn" => 1, "prompt" => "Do the thing", "tools" => ["Read"]}] = result["turn_timeline"]

      # Agent summary preserved
      assert %{"is_orchestrated" => true} = result["agent_summary"]
    end

    test "handles snake_case keys (legacy format)" do
      legacy_data = %{
        "beats" => [%{"label" => "Step 1", "description" => "Desc"}],
        "qa_pairs" => [%{"question" => "Q", "answer" => "A"}],
        "tool_breakdown" => [%{"name" => "Edit", "count" => 10}],
        "top_files" => [%{"path" => "x.ex", "touches" => 3}],
        "turn_timeline" => [%{"turn" => 1, "prompt" => "Do it", "tools" => []}],
        "transcript_excerpt" => [],
        "highlights" => [],
        "agent_summary" => nil
      }

      result = ShareController.normalize_session_detail(legacy_data)

      assert [%{"label" => "Step 1"}] = result["beats"]
      assert [%{"name" => "Edit", "count" => 10}] = result["tool_breakdown"]
      assert [%{"path" => "x.ex", "touches" => 3}] = result["top_files"]
      assert [%{"turn" => 1, "prompt" => "Do it"}] = result["turn_timeline"]
    end

    test "returns empty detail for nil or non-map input" do
      result = ShareController.normalize_session_detail(nil)
      assert result["beats"] == []
      assert result["qa_pairs"] == []
      assert result["agent_summary"] == nil
    end

    test "transcript_excerpt strips antml tags" do
      data = %{
        "transcriptExcerpt" => [
          %{"role" => "ai", "text" => "<antml_thinking>internal</antml_thinking>Visible answer"},
          %{"role" => "dev", "text" => "My prompt"}
        ]
      }
      result = ShareController.normalize_session_detail(data)
      assert [%{"text" => "Visible answer"}, %{"text" => "My prompt"}] = result["transcript_excerpt"]
    end

    test "transcript_excerpt drops entries that become empty after cleaning" do
      data = %{
        "transcriptExcerpt" => [
          %{"role" => "ai", "text" => "<antml_thinking>only thinking</antml_thinking>"},
          %{"role" => "dev", "text" => "Real prompt"}
        ]
      }
      result = ShareController.normalize_session_detail(data)
      assert [%{"text" => "Real prompt"}] = result["transcript_excerpt"]
    end

    test "turn_timeline strips antml tags from content" do
      data = %{
        "turnTimeline" => [
          %{"content" => "<antml_thinking>internal</antml_thinking>Real prompt", "tools" => ["Read"]},
          %{"content" => "<antml_thinking>only thinking</antml_thinking>", "tools" => []}
        ]
      }
      result = ShareController.normalize_session_detail(data)
      assert [%{"prompt" => "Real prompt", "tools" => ["Read"]}] = result["turn_timeline"]
    end

    test "top_files touches minimum is 1" do
      data = %{"topFiles" => [%{"path" => "empty.ex", "additions" => 0, "deletions" => 0}]}
      result = ShareController.normalize_session_detail(data)
      assert [%{"touches" => 1}] = result["top_files"]
    end
  end
end
