defmodule HeyiAmVibeWeb.VibeHTML do
  use HeyiAmVibeWeb, :html

  embed_templates "vibe_html/*"

  @doc "Word-wrap text to fit within max_chars per line."
  def wrap_text(nil, _max_chars), do: []
  def wrap_text(text, max_chars) do
    text
    |> String.split(~r/\s+/)
    |> Enum.reduce([""], fn word, [current | rest] ->
      if String.length(current) + String.length(word) + 1 <= max_chars do
        if current == "" do
          [word | rest]
        else
          [current <> " " <> word | rest]
        end
      else
        [word, current | rest]
      end
    end)
    |> Enum.reverse()
  end
end
