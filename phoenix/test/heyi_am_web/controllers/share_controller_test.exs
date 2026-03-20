defmodule HeyiAmWeb.ShareControllerTest do
  use HeyiAmWeb.ConnCase

  describe "GET /s/:token (case study)" do
    test "renders case study page with session data", %{conn: conn} do
      conn = get(conn, ~p"/s/test-token")
      html = html_response(conn, 200)

      # Title
      assert html =~ "Ripping out auth and rebuilding with phx.gen.auth"

      # Template class
      assert html =~ "tpl-editorial"

      # Stats
      assert html =~ "47m"
      assert html =~ "77"
      assert html =~ "34"
      assert html =~ "2.4k"

      # Developer Take
      assert html =~ "The Developer Take"
      assert html =~ "frankencode"

      # Skills
      assert html =~ "skill-chip"
      assert html =~ "Elixir"
      assert html =~ "Phoenix"
      assert html =~ "Authentication"

      # Q&A pairs
      assert html =~ "qa-pair"
      assert html =~ "Why did you choose to tear out auth entirely"
      assert html =~ "security liability, not tech debt"

      # Execution path
      assert html =~ "exec-path"
      assert html =~ "Deep review of existing auth flow"
      assert html =~ "309 tests passing"

      # Sidebar source info
      assert html =~ "Claude Code"
      assert html =~ "heyi.am contributors"

      # Highlights
      assert html =~ "Pivot"
      assert html =~ "Win"
      assert html =~ "Insight"

      # Collapsible sections
      assert html =~ "Tool breakdown"
      assert html =~ "Files changed"
      assert html =~ "Full narrative"
    end

    test "uses token from URL in page", %{conn: conn} do
      conn = get(conn, ~p"/s/my-custom-token")
      html = html_response(conn, 200)
      assert html =~ "my-custom-token"
    end

    test "includes link to transcript", %{conn: conn} do
      conn = get(conn, ~p"/s/abc123")
      html = html_response(conn, 200)
      assert html =~ "/s/abc123/transcript"
    end

    test "includes link to author portfolio", %{conn: conn} do
      conn = get(conn, ~p"/s/abc123")
      html = html_response(conn, 200)
      assert html =~ "/ben"
    end
  end

  describe "GET /s/:token/transcript" do
    test "renders transcript page with turns", %{conn: conn} do
      conn = get(conn, ~p"/s/test-token/transcript")
      html = html_response(conn, 200)

      # Title
      assert html =~ "Ripping out auth and rebuilding with phx.gen.auth"

      # Turn metadata
      assert html =~ "REQ-001"
      assert html =~ "RES-001"
      assert html =~ "00:00:12"

      # Avatars
      assert html =~ "transcript-avatar--dev"
      assert html =~ "transcript-avatar--ai"

      # Turn content
      assert html =~ "frankencode"
      assert html =~ "I can see three separate token systems"

      # Critical Decision block
      assert html =~ "transcript-decision"
      assert html =~ "Critical Decision"
      assert html =~ "Developer overrides AI suggestion"

      # Session Complete block
      assert html =~ "Session Complete"
      assert html =~ "309 tests passing"

      # Skipped turns indicator
      assert html =~ "72 more turns"
    end

    test "includes back link to case study", %{conn: conn} do
      conn = get(conn, ~p"/s/my-token/transcript")
      html = html_response(conn, 200)
      assert html =~ "/s/my-token"
    end

    test "does not show sealed chip for non-challenge session", %{conn: conn} do
      conn = get(conn, ~p"/s/test-token/transcript")
      html = html_response(conn, 200)
      refute html =~ "SEALED"
    end

    test "shows turn count in topbar", %{conn: conn} do
      conn = get(conn, ~p"/s/test-token/transcript")
      html = html_response(conn, 200)
      assert html =~ "77 turns total"
    end
  end
end
