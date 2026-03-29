defmodule HeyiAmVibeWeb.VibeApiController do
  use HeyiAmVibeWeb, :controller

  alias HeyiAm.Vibes
  alias HeyiAm.Vibes.Meta
  alias HeyiAm.LLM.Provider

  @archetype_names Meta.archetype_names()
  @modifier_phrases Meta.modifier_phrases()

  @allowed_stat_keys ~w(
    expletives corrections please_rate avg_prompt_words longest_prompt_words
    question_rate one_word_turn_rate reasoning_rate late_night_rate weekend_rate
    apologies read_write_ratio test_runs failed_tests longest_tool_chain
    self_corrections bash_commands override_success_rate longest_autopilot
    first_blood_min redirects_per_hour turn_density scope_creep interruptions
    secret_leaks_user secret_leaks_ai plan_mode_uses agent_spawns avg_daily_hours
    total_turns session_count total_duration_min
  )

  def create(conn, params) do
    attrs = %{
      "archetype_id" => params["archetype_id"],
      "modifier_id" => params["modifier_id"],
      "headline" => params["headline"],
      "narrative" => params["narrative"],
      "stats" => params["stats"],
      "sources" => params["sources"] || [],
      "session_count" => params["session_count"],
      "total_turns" => params["total_turns"]
    }

    case Vibes.create_vibe(attrs) do
      {:ok, vibe} ->
        base_url = HeyiAmVibeWeb.Endpoint.url()

        conn
        |> put_status(:created)
        |> json(%{
          url: "#{base_url}/#{vibe.short_id}",
          short_id: vibe.short_id,
          card_url: "#{base_url}/#{vibe.short_id}/card.png",
          delete_url: "#{base_url}/#{vibe.short_id}/delete?code=#{vibe.delete_code}",
          delete_code: vibe.delete_code
        })

      {:error, changeset} ->
        errors =
          Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
            Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
              opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
            end)
          end)

        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: %{code: "VALIDATION_FAILED", details: errors}})
    end
  end

  def narrative(conn, params) do
    stats = params["stats"]
    archetype_id = params["archetype_id"]
    modifier_id = params["modifier_id"]

    unless is_map(stats) and is_binary(archetype_id) do
      conn
      |> put_status(:bad_request)
      |> json(%{error: %{code: "INVALID_PARAMS", message: "stats (map) and archetype_id (string) required"}})
      |> halt()
    else
      archetype_name = Map.get(@archetype_names, archetype_id, "The Vibe Coder")
      safe_modifier = Map.get(@modifier_phrases, modifier_id)
      safe_stats =
        stats
        |> Enum.filter(fn {k, v} -> is_number(v) and k in @allowed_stat_keys end)
        |> Map.new()

      headline_task = Task.async(fn -> generate_headline(safe_stats, archetype_name, safe_modifier) end)
      narrative_task = Task.async(fn -> generate_narrative(safe_stats, archetype_name, safe_modifier) end)

      headline_result = Task.await(headline_task, 20_000)
      narrative_result = Task.await(narrative_task, 20_000)

      headline =
        case headline_result do
          {:ok, h} -> h
          _ -> fallback_headline(archetype_name, safe_modifier, safe_stats)
        end

      narrative =
        case narrative_result do
          {:ok, text} -> text
          _ -> fallback_narrative(archetype_name, safe_stats)
        end

      json(conn, %{headline: headline, narrative: narrative})
    end
  end

  defp generate_headline(stats, archetype_name, modifier_phrase) do
    examples = @archetype_names |> Map.values() |> Enum.reject(&(&1 == "The Vibe Coder")) |> Enum.join(", ")

    modifier_text = if modifier_phrase, do: " (#{modifier_phrase})", else: ""

    system = """
    Generate a creative developer personality headline. Rules:
    - Always start with "The" (e.g. "The 3AM Alchemist", "The 847-Turn Marathon Runner")
    - Fold the modifier trait into the title creatively — don't append "who ..." separately
    - You may reference one extreme stat number in the title if it's striking
    - Keep it under 76 characters
    - Keep it work-safe, witty, and specific to this developer's actual data
    - Never use: leverage, utilize, streamline, enhance, robust, journey, impressive
    - Sound like a dev naming a build config, not a horoscope
    - Output ONLY the headline. No quotes, no explanation, no punctuation at the end
    """

    user = """
    Static match: #{archetype_name}#{modifier_text}
    Example titles from the static pool: #{examples}
    Stats: #{Jason.encode!(stats)}

    Generate a headline for this developer.
    """

    provider = Provider.provider()
    provider.complete(system, user)
  end

  defp fallback_headline(archetype_name, modifier_phrase, stats) do
    sessions = stats["session_count"]
    turns = stats["total_turns"]

    # Try to make the headline more specific with a stat
    stat_flavor =
      cond do
        is_number(turns) and turns > 10_000 ->
          "#{Integer.to_string(round(turns))}-Turn"

        is_number(sessions) and sessions > 100 ->
          "#{round(sessions)}-Session"

        true ->
          nil
      end

    base =
      case {stat_flavor, modifier_phrase} do
        {nil, nil} -> archetype_name
        {nil, mod} -> "#{archetype_name} #{mod}"
        {flavor, nil} -> String.replace(archetype_name, "The ", "The #{flavor} ")
        {flavor, mod} -> "#{String.replace(archetype_name, "The ", "The #{flavor} ")} #{mod}"
      end

    if String.length(base) > 76, do: archetype_name, else: base
  end

  defp generate_narrative(stats, archetype_name, modifier_phrase) do
    system = """
    Write exactly 2 sentences about this developer's AI coding style. \
    Write in second person ("you"), as if roasting a friend at a bar. \
    Be specific — reference the most extreme numbers. \
    Sound human and blunt, not corporate or AI-like. \
    Never use: leverage, utilize, streamline, enhance, robust, seamless, journey, notable, impressively. \
    No filler. No compliments. Just observations with personality.\
    """

    modifier_text = if modifier_phrase, do: " (#{modifier_phrase})", else: ""

    user = """
    Archetype: #{archetype_name}#{modifier_text}
    Stats: #{Jason.encode!(stats)}
    """

    provider = Provider.provider()
    provider.complete(system, user)
  end

  defp fallback_narrative(archetype_name, stats) do
    sessions = stats["session_count"] || "several"
    turns = stats["total_turns"]
    autopilot = stats["longest_autopilot"]
    corrections = stats["corrections"]
    expletives = stats["expletives"]
    late = stats["late_night_rate"]

    # Pick the most interesting stat for a second sentence
    color =
      cond do
        is_number(autopilot) and autopilot > 200 ->
          "Longest leash: #{round(autopilot)} turns without touching the wheel."

        is_number(expletives) and expletives > 20 ->
          "#{round(expletives)} expletives across #{sessions} sessions. Things got heated."

        is_number(late) and late > 0.25 ->
          "#{round(late * 100)}% of your coding happened after midnight."

        is_number(corrections) and corrections > 20 ->
          "You corrected the AI #{round(corrections)} times. You know what you want."

        is_number(turns) ->
          "#{Integer.to_string(round(turns))} turns across #{sessions} sessions — that's a conversation."

        true ->
          "#{sessions} sessions analyzed — your patterns tell the story."
      end

    "#{archetype_name}. #{color}"
  end
end
