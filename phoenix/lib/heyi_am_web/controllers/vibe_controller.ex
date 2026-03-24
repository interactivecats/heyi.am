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
    "marathon-runner" => %{name: "The Marathon Runner", tagline: "Sessions that never end."},
    "scientist" => %{name: "The Scientist", tagline: "Hypothesize, test, repeat."},
    "puppeteer" => %{name: "The Puppeteer", tagline: "Pulls every string."},
    "weekend-warrior" => %{name: "The Weekend Warrior", tagline: "Saves the real coding for Saturday."},
    "orchestrator" => %{name: "The Orchestrator", tagline: "Spawns agents like they're threads."},
    "minimalist" => %{name: "The Minimalist", tagline: "Says less. Gets more."},
    "secret-spiller" => %{name: "The Secret Spiller", tagline: "Accidentally shares everything."},
    "vibe-coder" => %{name: "The Vibe Coder", tagline: "Vibes with the machine."}
  }

  @modifier_phrases %{
    "says-please" => "who says please",
    "codes-at-3am" => "who codes at 3am",
    "reads-5x-more" => "who reads 5x more than writes",
    "never-tests" => "who never tests",
    "cusses-under-pressure" => "who cusses under pressure",
    "writes-essays" => "who writes essays for prompts",
    "lets-ai-cook" => "who lets the AI cook",
    "asks-more-than-tells" => "who asks more than tells",
    "scope-creeps" => "who scope-creeps every session",
    "ships-on-weekends" => "who ships on weekends",
    "spawns-agents" => "who spawns agents for everything",
    "plans-first" => "who plans before coding",
    "interrupts-often" => "who interrupts mid-thought",
    "marathon-sessions" => "who codes for hours straight",
    "one-word-prompts" => "who speaks in commands",
    "leaks-secrets" => "who leaks secrets to the AI"
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
        headline = vibe.headline || build_headline(archetype.name, modifier)
        base_url = HeyiAmWeb.Endpoint.url()

        {voice, ai, collab} = build_stat_columns(vibe.stats)

        render(conn, :show,
          vibe: vibe,
          archetype: archetype,
          modifier: modifier,
          headline: headline,
          voice_stats: voice,
          ai_stats: ai,
          collab_stats: collab,
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
        headline = vibe.headline || build_headline(archetype.name, modifier)

        {voice, ai, collab} = build_stat_columns(vibe.stats)

        svg =
          Phoenix.Template.render_to_string(
            HeyiAmWeb.VibeHTML,
            "card_svg",
            "html",
            %{
              headline: headline,
              narrative: vibe.narrative,
              voice_stats: voice,
              ai_stats: ai,
              collab_stats: collab,
              sources: Enum.join(vibe.sources || [], ", "),
              session_count: vibe.session_count,
              total_turns: vibe.total_turns
            }
          )

        conn
        |> put_resp_content_type("image/svg+xml")
        |> put_resp_header("cache-control", "public, max-age=86400, immutable")
        |> put_resp_header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com")
        |> send_resp(200, svg)
    end
  end

  def delete(conn, %{"short_id" => short_id} = params) do
    code = params["code"] || ""

    case Vibes.delete_vibe(short_id, code) do
      {:ok, _vibe} ->
        conn
        |> put_flash(:info, "Vibe deleted.")
        |> redirect(to: ~p"/v")

      {:error, :not_found} ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      {:error, :invalid_code} ->
        conn
        |> put_status(:forbidden)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")
    end
  end

  defp build_headline(name, nil), do: name
  defp build_headline(name, modifier), do: "#{name} #{modifier}"

  defp format_pct(nil), do: nil
  defp format_pct(val) when is_number(val), do: "#{round(val * 100)}%"

  defp format_ratio(nil), do: nil
  defp format_ratio(val) when is_number(val), do: "#{Float.round(val * 1.0, 1)}:1"

  defp format_num(n) when is_integer(n) and n >= 1000 do
    n |> Integer.to_string() |> String.replace(~r/\B(?=(\d{3})+(?!\d))/, ",")
  end
  defp format_num(n) when is_number(n), do: "#{n}"

  defp build_stat_columns(stats) when is_map(stats) do
    voice =
      [
        stat(stats, "expletives", "Expletives", &format_num/1),
        stat(stats, "corrections", "Corrections", &format_num/1),
        stat(stats, "avg_prompt_words", "Avg prompt", fn v -> "#{v} words" end),
        stat(stats, "please_rate", "Please rate", &format_pct/1),
        stat(stats, "question_rate", "Questions", &format_pct/1),
        stat(stats, "late_night_rate", "Late night", &format_pct/1),
        stat(stats, "reasoning_rate", "Thinks out loud", &format_pct/1)
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.take(6)

    ai =
      [
        stat(stats, "read_write_ratio", "Read:write", &format_ratio/1),
        stat(stats, "test_runs", "Test runs", fn v ->
          case stats["failed_tests"] do
            ft when is_number(ft) and ft > 0 -> "#{format_num(v)}, #{round(ft / v * 100)}% fail"
            _ -> format_num(v)
          end
        end),
        stat(stats, "longest_tool_chain", "Longest burst", fn v -> "#{format_num(v)} calls" end),
        stat(stats, "self_corrections", "Self-corrections", &format_num/1),
        stat(stats, "apologies", "AI apologies", &format_num/1),
        stat(stats, "bash_commands", "Bash commands", &format_num/1)
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.take(6)

    collab =
      [
        stat_with(stats, "override_success_rate", "corrections", "Override success", fn rate, corr ->
          "#{format_pct(rate)} of #{format_num(corr)}"
        end),
        stat(stats, "longest_autopilot", "Longest leash", fn v -> "#{format_num(v)} turns" end),
        stat(stats, "first_blood_min", "First correction", fn v -> "#{v} min" end),
        stat(stats, "redirects_per_hour", "Redirects/hr", &format_num/1),
        stat(stats, "scope_creep", "Scope creep", &format_num/1)
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.take(6)

    {voice, ai, collab}
  end
  defp build_stat_columns(_), do: {[], [], []}

  defp stat(stats, key, label, fmt) do
    case stats[key] do
      v when is_number(v) and v > 0 -> {label, fmt.(v)}
      _ -> nil
    end
  end

  defp stat_with(stats, key1, key2, label, fmt) do
    v1 = stats[key1]
    v2 = stats[key2]
    if is_number(v1) and v1 > 0 and is_number(v2) and v2 > 0,
      do: {label, fmt.(v1, v2)},
      else: nil
  end
end
