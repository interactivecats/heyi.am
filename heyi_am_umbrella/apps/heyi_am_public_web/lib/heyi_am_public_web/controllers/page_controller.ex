defmodule HeyiAmPublicWeb.PageController do
  use HeyiAmPublicWeb, :controller

  def home(conn, _params) do
    redirect(conn, external: HeyiAmPublicWeb.Helpers.app_url("/"))
  end

  def terms(conn, _params) do
    redirect(conn, external: HeyiAmPublicWeb.Helpers.app_url("/terms"))
  end

  def privacy(conn, _params) do
    redirect(conn, external: HeyiAmPublicWeb.Helpers.app_url("/privacy"))
  end

  def redirect_vibes(conn, %{"path" => path}) do
    safe_path = path |> Enum.map(&URI.encode/1) |> Enum.join("/")
    target = "https://howdoyouvibe.com/v/" <> safe_path
    redirect(conn, external: target)
  end
end
