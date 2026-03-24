defmodule HeyiAmPublicWeb.Helpers do
  @moduledoc """
  Shared helpers for the public web app.
  """

  @doc """
  Returns a full URL on the app domain (heyiam.com in prod, localhost in dev).
  Used for links to auth pages from the public domain.
  """
  def app_url(path \\ "/") do
    base = Application.get_env(:heyi_am_public_web, :app_domain_url, "")
    base <> path
  end
end
