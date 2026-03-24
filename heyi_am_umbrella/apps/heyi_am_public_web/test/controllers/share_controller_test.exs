defmodule HeyiAmPublicWeb.ShareControllerTest do
  use HeyiAmPublicWeb.ConnCase

  import HeyiAm.AccountsFixtures

  defp create_share_with_html(attrs) do
    {rendered_html, attrs} = Map.pop(attrs, :rendered_html)

    {:ok, share} = HeyiAm.Shares.create_share(attrs)

    if rendered_html do
      {:ok, share} = HeyiAm.Shares.update_share_rendered_html(share, %{rendered_html: rendered_html})
      share
    else
      share
    end
  end

  describe "GET /s/:token" do
    test "serves rendered_html for a published share", %{conn: conn} do
      user = user_fixture(%{username: "sharedev"})

      _share =
        create_share_with_html(%{
          user_id: user.id,
          token: "test-share-token",
          title: "Test Session",
          status: "listed",
          rendered_html: "<div class=\"session\">Session Content</div>",
          skills: [],
          duration_minutes: 30,
          turns: 10,
          files_changed: 5,
          loc_changed: 100
        })

      conn = get(conn, "/s/test-share-token")
      response = html_response(conn, 200)
      assert response =~ "Session Content"
    end

    test "returns 404 for unknown token", %{conn: conn} do
      conn = get(conn, "/s/nonexistent-token-xyz")
      assert html_response(conn, 404) =~ "Page not found"
    end

    test "returns 410 gone for deleted tokens", %{conn: conn} do
      conn = get(conn, "/s/deleted")
      assert html_response(conn, 410) =~ "Session Removed"
    end

    test "returns 410 gone for expired tokens", %{conn: conn} do
      conn = get(conn, "/s/expired")
      assert html_response(conn, 410) =~ "Session Removed"
    end
  end

  describe "GET /s/:token/transcript" do
    test "renders transcript page for published share", %{conn: conn} do
      user = user_fixture(%{username: "txdev"})

      _share =
        create_share_with_html(%{
          user_id: user.id,
          token: "tx-token",
          title: "Transcript Session",
          status: "listed",
          rendered_html: "<div>content</div>",
          skills: [],
          duration_minutes: 15,
          turns: 5,
          files_changed: 2,
          loc_changed: 50
        })

      conn = get(conn, "/s/tx-token/transcript")
      response = html_response(conn, 200)
      assert response =~ "Transcript Session"
    end

    test "returns 404 for unknown token", %{conn: conn} do
      conn = get(conn, "/s/nonexistent/transcript")
      assert html_response(conn, 404) =~ "Page not found"
    end
  end

  describe "GET /s/:token/verify" do
    test "renders verify page for published share", %{conn: conn} do
      user = user_fixture(%{username: "vfdev"})

      _share =
        create_share_with_html(%{
          user_id: user.id,
          token: "vf-token",
          title: "Verify Session",
          status: "listed",
          rendered_html: "<div>content</div>",
          skills: [],
          duration_minutes: 20,
          turns: 8,
          files_changed: 3,
          loc_changed: 75
        })

      conn = get(conn, "/s/vf-token/verify")
      response = html_response(conn, 200)
      assert response =~ "Session Verification"
    end

    test "returns 404 for unknown token", %{conn: conn} do
      conn = get(conn, "/s/nonexistent/verify")
      assert html_response(conn, 404) =~ "Page not found"
    end
  end
end
