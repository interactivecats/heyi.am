defmodule HeyiAmWeb.VibeController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Vibes

  @archetype_meta %{
    "night-owl" => %{name: "The Night Owl", tagline: "Codes when the world sleeps."},
    "backseat-driver" => %{name: "The Backseat Driver", tagline: "Knows when the AI is wrong."},
    "delegator" => %{name: "The Delegator", tagline: "Points and lets the AI run."},
    "cowboy" => %{name: "The Cowboy", tagline: "Writes first, reads later."},
    "overthinker" => %{name: "The Overthinker", tagline: "Every prompt is a paragraph."},
    "speed-runner" => %{name: "The Speed Runner", tagline: "In and out. No wasted time."},
    "debugger" => %{name: "The Debugger", tagline: "Tests, fails, fixes, repeats."},
    "diplomat" => %{name: "The Diplomat", tagline: "Thanks the AI, trusts the AI."},
    "architect" => %{name: "The Architect", tagline: "Reads 5x more than writes."},
    "pair-programmer" => %{name: "The Pair Programmer", tagline: "Treats the AI like a colleague."},
    "vibe-coder" => %{name: "The Vibe Coder", tagline: "Vibes with the machine."}
  }

  @modifier_phrases %{
    "says-please" => "who says please",
    "codes-at-3am" => "who codes at 3am",
    "reads-5x" => "who reads 5x more than writes",
    "never-tests" => "who never tests",
    "cusses-under-pressure" => "who cusses under pressure",
    "essay-prompts" => "who writes essays for prompts",
    "lets-ai-cook" => "who lets the AI cook",
    "asks-more" => "who asks more than tells",
    "scope-creeps" => "who scope-creeps every session",
    "ships-weekends" => "who ships on weekends"
  }

  def index(conn, _params) do
    count = Vibes.count_vibes()
    distribution = Vibes.archetype_distribution()
    recent = Vibes.list_recent_vibes(limit: 12)

    render(conn, :index,
      count: count,
      distribution: distribution,
      recent: recent,
      archetype_meta: @archetype_meta,
      modifier_phrases: @modifier_phrases,
      page_title: "HOW DO YOU VIBE?"
    )
  end

  def show(conn, %{"short_id" => short_id}) do
    case Vibes.get_vibe_by_short_id(short_id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      vibe ->
        archetype = Map.get(@archetype_meta, vibe.archetype_id, %{name: "The Vibe Coder", tagline: ""})
        modifier = Map.get(@modifier_phrases, vibe.modifier_id, nil)
        headline = build_headline(archetype.name, modifier)
        base_url = HeyiAmWeb.Endpoint.url()

        render(conn, :show,
          vibe: vibe,
          archetype: archetype,
          modifier: modifier,
          headline: headline,
          page_title: headline,
          og_title: "I'm #{headline}",
          og_description: vibe.narrative,
          og_image: "#{base_url}/v/#{vibe.short_id}/card.png",
          og_url: "#{base_url}/v/#{vibe.short_id}"
        )
    end
  end

  def archetype(conn, %{"id" => id}) do
    meta = Map.get(@archetype_meta, id)

    if is_nil(meta) do
      conn
      |> put_status(:not_found)
      |> put_view(HeyiAmWeb.ErrorHTML)
      |> render(:"404")
    else
      distribution = Vibes.archetype_distribution()
      match_count = Enum.find_value(distribution, 0, fn {aid, c} -> if aid == id, do: c end)

      render(conn, :archetype,
        archetype_id: id,
        archetype: meta,
        match_count: match_count,
        page_title: "#{meta.name} — HOW DO YOU VIBE?"
      )
    end
  end

  def card_image(conn, %{"short_id" => short_id}) do
    case Vibes.get_vibe_by_short_id(short_id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "not found"})

      vibe ->
        archetype = Map.get(@archetype_meta, vibe.archetype_id, %{name: "The Vibe Coder", tagline: ""})
        modifier = Map.get(@modifier_phrases, vibe.modifier_id, nil)
        headline = build_headline(archetype.name, modifier)

        key_stats = pick_key_stats(vibe.stats)

        svg =
          Phoenix.Template.render_to_string(
            HeyiAmWeb.VibeHTML,
            "card_svg",
            "html",
            %{
              headline: headline,
              narrative: vibe.narrative,
              key_stats: key_stats,
              sources: Enum.join(vibe.sources || [], ", "),
              session_count: vibe.session_count,
              total_turns: vibe.total_turns
            }
          )

        conn
        |> put_resp_content_type("image/svg+xml")
        |> put_resp_header("cache-control", "public, max-age=86400, immutable")
        |> send_resp(200, svg)
    end
  end

  defp build_headline(name, nil), do: name
  defp build_headline(name, modifier), do: "#{name} #{modifier}"

  defp pick_key_stats(stats) when is_map(stats) do
    [
      {"Please rate", format_pct(stats["please_rate"])},
      {"Late night", format_pct(stats["late_night_rate"])},
      {"Read:write", format_ratio(stats["read_write_ratio"])},
      {"Corrections", stats["corrections"]},
      {"Avg prompt", "#{stats["avg_prompt_words"]} words"},
      {"Override", format_pct(stats["override_success_rate"])}
    ]
    |> Enum.reject(fn {_label, val} -> is_nil(val) or val == "nil words" or val == "" end)
    |> Enum.take(4)
  end

  defp pick_key_stats(_), do: []

  defp format_pct(nil), do: nil
  defp format_pct(val) when is_number(val), do: "#{round(val * 100)}%"

  defp format_ratio(nil), do: nil
  defp format_ratio(val) when is_number(val), do: "#{Float.round(val * 1.0, 1)}:1"
end
