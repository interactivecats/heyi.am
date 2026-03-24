defmodule HeyiAmAppWeb.Helpers do
  @moduledoc """
  Shared helpers for the app web.
  """

  @doc """
  Returns a full URL on the public domain (heyi.am in prod, localhost in dev).
  Used for links to portfolios from the app domain.
  """
  def public_url(path \\ "/") do
    host = Application.get_env(:heyi_am, :public_host)

    if host do
      "https://#{host}#{path}"
    else
      path
    end
  end
end
