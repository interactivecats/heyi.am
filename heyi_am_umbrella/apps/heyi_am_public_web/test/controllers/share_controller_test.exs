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

  describe "GET /:username/:project/:session username normalization" do
    test "301-redirects to lowercase username, project slug and session slug preserved", %{conn: conn} do
      _user = user_fixture(%{username: "normme"})

      conn = get(conn, "/NormMe/my-proj/some-session")
      assert redirected_to(conn, 301) == "/normme/my-proj/some-session"
    end

    test "preserves query string on redirect", %{conn: conn} do
      _user = user_fixture(%{username: "norm2"})

      conn = get(conn, "/NORM2/p/s?ref=x")
      assert redirected_to(conn, 301) == "/norm2/p/s?ref=x"
    end

    test "does not redirect when username is already lowercase", %{conn: conn} do
      user = user_fixture(%{username: "lowerok"})

      {:ok, project} =
        HeyiAm.Projects.create_project(%{
          user_id: user.id,
          title: "P",
          slug: "p-slug",
          rendered_html: "<div>x</div>"
        })

      {:ok, share} =
        HeyiAm.Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "lowerok-tok",
          title: "T",
          slug: "sesh",
          status: "listed"
        })

      {:ok, _share} =
        HeyiAm.Shares.update_share_rendered_html(share, %{rendered_html: "<div>Normalized Body</div>"})

      conn = get(conn, "/lowerok/p-slug/sesh")
      assert html_response(conn, 200) =~ "Normalized Body"
    end
  end
end
