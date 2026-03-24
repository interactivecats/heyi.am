defmodule HeyiAmPublicWeb.Helpers do
  @moduledoc """
  Shared helpers for the public web app.
  """

  @doc """
  Returns a full URL on the app domain (heyiam.com in prod, localhost in dev).
  Used for links to auth/landing pages from the public domain.
  """
  def app_url(path \\ "/") do
    host = Application.get_env(:heyi_am, :app_host)

    if host do
      "https://#{host}#{path}"
    else
      path
    end
  end
end
