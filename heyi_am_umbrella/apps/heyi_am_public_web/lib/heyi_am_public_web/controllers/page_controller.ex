defmodule HeyiAmPublicWeb.PageController do
  use HeyiAmPublicWeb, :controller

  def home(conn, _params) do
    redirect(conn, external: HeyiAmPublicWeb.Helpers.app_url("/home"))
  end

  def terms(conn, _params) do
    redirect(conn, external: HeyiAmPublicWeb.Helpers.app_url("/terms"))
  end

  def privacy(conn, _params) do
    redirect(conn, external: HeyiAmPublicWeb.Helpers.app_url("/privacy"))
  end

  def redirect_vibes(conn, %{"path" => path}) do
    target = "https://howdoyouvibe.com/v/" <> Enum.join(path, "/")
    redirect(conn, external: target)
  end
end
