defmodule HeyiAmAppWeb.PortfolioApiControllerTest do
  use HeyiAmAppWeb.ConnCase

  alias HeyiAm.Accounts

  describe "POST /api/portfolio/upload" do
    test "happy path: stores sanitized HTML and returns 200" do
      {conn, user} = api_conn_with_auth()

      html = ~s(<div data-template="editorial" data-accent="blue" data-mode="light"><h1>Hi</h1></div>)

      conn = post(conn, ~p"/api/portfolio/upload", %{html: html})

      assert %{"ok" => true} = json_response(conn, 200)

      reloaded = Accounts.get_user!(user.id)
      assert reloaded.rendered_portfolio_html =~ ~s(data-template="editorial")
      assert reloaded.rendered_portfolio_html =~ ~s(data-accent="blue")
      assert reloaded.rendered_portfolio_html =~ ~s(data-mode="light")
      assert reloaded.rendered_portfolio_html =~ "Hi"
    end

    test "returns 401 without auth", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/portfolio/upload", %{html: "<div>hi</div>"})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 400 when html param missing" do
      {conn, _user} = api_conn_with_auth()
      conn = post(conn, ~p"/api/portfolio/upload", %{})
      assert %{"error" => %{"code" => "MISSING_HTML"}} = json_response(conn, 400)
    end

    test "strips XSS payloads from the uploaded HTML" do
      {conn, user} = api_conn_with_auth()

      html = ~S|<div><script>alert('xss')</script><p onclick="evil()">hello</p><a href="javascript:alert(1)">bad</a></div>|

      conn = post(conn, ~p"/api/portfolio/upload", %{html: html})
      assert %{"ok" => true} = json_response(conn, 200)

      stored = Accounts.get_user!(user.id).rendered_portfolio_html
      refute stored =~ "<script"
      refute stored =~ "onclick"
      refute stored =~ "javascript:"
      assert stored =~ "hello"
    end

    test "preserves data-template, data-accent, data-mode attributes" do
      {conn, user} = api_conn_with_auth()

      html = ~s(<section data-template="blueprint" data-accent="amber" data-mode="dark">body</section>)

      conn = post(conn, ~p"/api/portfolio/upload", %{html: html})
      assert %{"ok" => true} = json_response(conn, 200)

      stored = Accounts.get_user!(user.id).rendered_portfolio_html
      assert stored =~ ~s(data-template="blueprint")
      assert stored =~ ~s(data-accent="amber")
      assert stored =~ ~s(data-mode="dark")
    end

    test "accepts all CLI portfolio_layout values via profile snapshot" do
      # CLI currently ships 29 templates. Sample the set the old validator
      # rejected to prove the loosened validator accepts them.
      layouts = ~w(
        editorial terminal minimal brutalist campfire neon-night
        blueprint kinetic radar neon bauhaus obsidian ember glacier
        aurora signal thistle concrete
      )

      for layout <- layouts do
        {conn, _user} = api_conn_with_auth()

        conn =
          post(conn, ~p"/api/portfolio/upload", %{
            html: "<div>x</div>",
            profile: %{portfolio_layout: layout}
          })

        assert %{"ok" => true} = json_response(conn, 200),
               "expected layout #{layout} to be accepted"
      end
    end

    test "rejects html payloads larger than the size cap" do
      {conn, _user} = api_conn_with_auth()

      oversize = String.duplicate("a", 2 * 1024 * 1024 + 1)
      conn = post(conn, ~p"/api/portfolio/upload", %{html: oversize})

      assert %{"error" => %{"code" => "HTML_TOO_LARGE"}} = json_response(conn, 413)
    end
  end
end
