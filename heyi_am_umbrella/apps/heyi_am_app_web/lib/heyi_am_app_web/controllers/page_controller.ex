defmodule HeyiAmAppWeb.PageController do
  use HeyiAmAppWeb, :controller

  def home(conn, _params) do
    if conn.assigns[:current_scope] && conn.assigns.current_scope.user do
      redirect(conn, to: ~p"/users/settings")
    else
      render(conn, :home)
    end
  end

  def terms(conn, _params) do
    render(conn, :terms)
  end

  def privacy(conn, _params) do
    render(conn, :privacy)
  end
end
