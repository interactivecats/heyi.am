defmodule HeyiAmAppWeb.ErrorHTMLTest do
  use HeyiAmAppWeb.ConnCase, async: true

  test "renders 500.html" do
    assert HeyiAmAppWeb.ErrorHTML.render("500.html", %{}) ==
             "Internal Server Error"
  end
end
