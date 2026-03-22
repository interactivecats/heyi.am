defmodule HeyiAmWeb.Templates do
  @moduledoc """
  Portfolio layout configuration. Currently editorial-only.
  """

  @templates [
    %{id: "editorial", name: "Editorial", desc: "Clean, centered layout. Data-focused with stats and timeline."}
  ]

  def list, do: @templates
end
