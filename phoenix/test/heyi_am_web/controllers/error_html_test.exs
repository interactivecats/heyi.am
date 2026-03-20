defmodule HeyiAmWeb.ErrorHTMLTest do
  use HeyiAmWeb.ConnCase, async: true

  test "renders 404.html with custom template via endpoint" do
    conn = get(build_conn(), "/nonexistent-route-that-will-404")
    html = html_response(conn, 404)

    assert html =~ "404"
    assert html =~ "Page not found"
    assert html =~ "Back to Home"
    assert html =~ "heyi.am"
  end

  test "renders 500.html as plain text" do
    import Phoenix.Template, only: [render_to_string: 4]
    assert render_to_string(HeyiAmWeb.ErrorHTML, "500", "html", []) == "Internal Server Error"
  end
end
