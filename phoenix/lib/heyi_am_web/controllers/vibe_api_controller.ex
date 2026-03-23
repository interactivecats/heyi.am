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
          card_url: "#{base_url}/v/#{vibe.short_id}/card.png"
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

      case generate_narrative(stats, archetype_name, modifier_id) do
        {:ok, text} ->
          json(conn, %{narrative: text})

        {:error, _reason} ->
          json(conn, %{narrative: fallback_narrative(archetype_name, stats)})
      end
    end
  end

  defp generate_narrative(stats, archetype_name, modifier_id) do
    system = """
    Write 2 sentences describing this developer's AI coding style. \
    Sound like a dev thinking out loud, not AI explaining. \
    Never use: leverage, utilize, streamline, enhance, robust, seamless. \
    Reference specific numbers from the stats. Be concrete and human.\
    """

    modifier_text = if modifier_id, do: " (modifier: #{modifier_id})", else: ""

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
