defmodule HeyiAmWeb.PageController do
  use HeyiAmWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
