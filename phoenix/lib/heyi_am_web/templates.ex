defmodule HeyiAmWeb.Templates do
  @moduledoc """
  Shared template data for portfolio layouts.
  Used by VibePickerLive and PortfolioEditorLive.
  """

  @templates [
    %{id: "editorial", name: "Editorial", desc: "Clean, centered layout. Data-focused with stats and timeline."},
    %{id: "terminal", name: "Terminal", desc: "Dark background, monospace green text. Hacker aesthetic."},
    %{id: "minimal", name: "Minimal", desc: "Extreme whitespace. No decoration, just content."},
    %{id: "brutalist", name: "Brutalist", desc: "Thick borders, zero radius. Bold and unapologetic."},
    %{id: "campfire", name: "Campfire", desc: "Warm cream tones, serif headings. Cozy and inviting."},
    %{id: "neon-night", name: "Neon Night", desc: "Deep navy with cyan and magenta accents. Electric."}
  ]

  def list, do: @templates
end
