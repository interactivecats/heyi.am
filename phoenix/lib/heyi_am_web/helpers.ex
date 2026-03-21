defmodule HeyiAmWeb.Helpers do
  @moduledoc """
  Shared view/controller helpers used across portfolio, share, and other controllers.
  """

  @doc "Format lines of code count for display"
  def format_loc(nil), do: "0"
  def format_loc(n) when is_integer(n) and n >= 1000, do: "#{Float.round(n / 1000, 1)}k"
  def format_loc(n) when is_integer(n), do: to_string(n)
  def format_loc(s) when is_binary(s), do: s

  @doc "Generate URL-safe slug from a string"
  def slugify(nil), do: ""
  def slugify(name) do
    name
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s-]/, "")
    |> String.replace(~r/[\s-]+/, "-")
    |> String.trim("-")
  end
end
