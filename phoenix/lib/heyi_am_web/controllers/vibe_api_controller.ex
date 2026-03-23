defmodule HeyiAmWeb.VibeApiController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Vibes
  alias HeyiAm.LLM.Provider

  @archetype_names %{
    "night-owl" => "The Night Owl",
    "backseat-driver" => "The Backseat Driver",
    "delegator" => "The Delegator",
    "cowboy" => "The Cowboy",
    "overthinker" => "The Overthinker",
    "speed-runner" => "The Speed Runner",
    "debugger" => "The Debugger",
    "diplomat" => "The Diplomat",
    "architect" => "The Architect",
    "pair-programmer" => "The Pair Programmer",
    "vibe-coder" => "The Vibe Coder"
  }

  def create(conn, params) do
    attrs = %{
      "archetype_id" => params["archetype_id"],
      "modifier_id" => params["modifier_id"],
      "narrative" => params["narrative"],
      "stats" => params["stats"],
      "sources" => params["sources"] || [],
      "session_count" => params["session_count"],
      "total_turns" => params["total_turns"]
    }

    case Vibes.create_vibe(attrs) do
      {:ok, vibe} ->
        base_url = HeyiAmWeb.Endpoint.url()

        conn
        |> put_status(:created)
        |> json(%{
          url: "#{base_url}/v/#{vibe.short_id}",
          short_id: vibe.short_id,
          card_url: "#{base_url}/v/#{vibe.short_id}/card.png",
          delete_url: "#{base_url}/v/#{vibe.short_id}?code=#{vibe.delete_code}"
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
    "ships-on-weekends" => "who ships on weekends"
  }

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
      # Validate modifier_id against allowlist to prevent prompt injection
      safe_modifier = Map.get(@modifier_phrases, modifier_id)
      # Only pass numeric stat values to the LLM
      safe_stats = stats |> Enum.filter(fn {_k, v} -> is_number(v) end) |> Map.new()

      case generate_narrative(safe_stats, archetype_name, safe_modifier) do
        {:ok, text} ->
          json(conn, %{narrative: text})

        {:error, _reason} ->
          json(conn, %{narrative: fallback_narrative(archetype_name, safe_stats)})
      end
    end
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
    session_count = stats["session_count"] || stats[:session_count] || "several"
    "#{archetype_name}. #{session_count} sessions analyzed — your patterns tell the story."
  end
end
