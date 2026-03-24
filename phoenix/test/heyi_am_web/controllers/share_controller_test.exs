defmodule HeyiAmWeb.ShareControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  defp create_share_with_rendered_html(_context) do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "testdev"})
    {:ok, user} = HeyiAm.Accounts.update_user_profile(user, %{display_name: "Test Developer"})

    {:ok, share} =
      HeyiAm.Shares.create_share(%{
        token: "rendered-token-123",
        title: "Auth system rebuild",
        dev_take: "The old auth was a mess of layered tokens.",
        duration_minutes: 47,
        turns: 77,
        files_changed: 34,
        loc_changed: 2400,
        skills: ["Elixir", "Phoenix"],
        status: "listed",
        user_id: user.id,
        rendered_html: "<div class=\"session-case-study\"><h1>Auth system rebuild</h1><p>Rebuilt everything</p></div>"
      })

    %{share: share, user: user}
  end

  defp create_share_without_rendered_html(_context) do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "norender"})

    {:ok, share} =
      HeyiAm.Shares.create_share(%{
        token: "no-render-token",
        title: "No rendered HTML",
        status: "listed",
        user_id: user.id
      })

    %{share: share, user: user}
  end

  describe "GET /s/:token" do
    setup [:create_share_with_rendered_html]

    test "serves pre-rendered HTML", %{conn: conn} do
      conn = get(conn, ~p"/s/rendered-token-123")
      html = html_response(conn, 200)
      assert html =~ "session-case-study"
      assert html =~ "Auth system rebuild"
      assert html =~ "Rebuilt everything"
    end

    test "includes OG meta tags", %{conn: conn} do
      conn = get(conn, ~p"/s/rendered-token-123")
      html = html_response(conn, 200)
      assert html =~ ~s(og:title" content="Auth system rebuild — Test Developer")
      assert html =~ ~s(og:description)
      assert html =~ ~s(og:url)
    end

    test "returns 404 for non-existent token", %{conn: conn} do
      assert html_response(get(conn, ~p"/s/nonexistent"), 404)
    end
  end

  describe "GET /s/:token without rendered_html" do
    setup [:create_share_without_rendered_html]

    test "returns 404 when no rendered_html", %{conn: conn} do
      assert html_response(get(conn, ~p"/s/no-render-token"), 404)
    end
  end

  describe "gone session page" do
    test "renders gone page for deleted token", %{conn: conn} do
      conn = get(conn, ~p"/s/deleted")
      html = html_response(conn, 410)
      assert html =~ "Session Removed"
    end

    test "renders gone page for expired token", %{conn: conn} do
      conn = get(conn, ~p"/s/expired")
      assert html_response(conn, 410) =~ "Session Removed"
    end
  end

  describe "GET /s/:token/transcript" do
    setup [:create_share_with_rendered_html]

    test "renders transcript page", %{conn: conn} do
      conn = get(conn, ~p"/s/rendered-token-123/transcript")
      html = html_response(conn, 200)
      assert html =~ "Auth system rebuild"
    end

    test "returns 404 for non-existent token", %{conn: conn} do
      assert html_response(get(conn, ~p"/s/nonexistent/transcript"), 404)
    end
  end

  describe "GET /s/:token/verify" do
    setup [:create_share_with_rendered_html]

    test "renders verification page", %{conn: conn} do
      conn = get(conn, ~p"/s/rendered-token-123/verify")
      html = html_response(conn, 200)
      assert html =~ "Session Verification"
      assert html =~ "Content Hash"
      assert html =~ "UNVERIFIED"
    end

    test "returns 404 for non-existent token", %{conn: conn} do
      assert html_response(get(conn, ~p"/s/nonexistent/verify"), 404)
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

      {:ok, _share} =
        HeyiAm.Shares.create_share(%{
          token: "friendly-token",
          slug: "auth-rewrite",
          title: "Auth Rewrite",
          dev_take: "Rewrote everything.",
          status: "listed",
          user_id: user.id,
          project_id: project.id,
          rendered_html: "<div class=\"friendly\"><h1>Auth Rewrite</h1></div>"
        })

      %{user: user, project: project}
    end

    test "serves pre-rendered HTML via slug", %{conn: conn} do
      conn = get(conn, ~p"/devuser/my-project/auth-rewrite")
      html = html_response(conn, 200)
      assert html =~ "friendly"
      assert html =~ "Auth Rewrite"
    end

    test "falls back to token lookup", %{conn: conn} do
      conn = get(conn, ~p"/devuser/my-project/friendly-token")
      assert html_response(conn, 200) =~ "Auth Rewrite"
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      assert html_response(get(conn, "/nobody/my-project/some-session"), 404)
    end

    test "returns 404 for non-existent session", %{conn: conn} do
      assert html_response(get(conn, ~p"/devuser/my-project/no-such-session"), 404)
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

    test "passes through clean text unchanged" do
      assert ShareController.clean_ai_tags("Normal text") == "Normal text"
    end
  end
end
