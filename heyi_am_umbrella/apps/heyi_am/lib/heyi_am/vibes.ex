defmodule HeyiAm.Vibes do
  import Ecto.Query

  alias HeyiAm.Repo
  alias HeyiAm.Vibes.Vibe

  @nanoid_alphabet "0123456789abcdefghijklmnopqrstuvwxyz"
  @nanoid_length 7

  def create_vibe(attrs) do
    short_id = generate_short_id()
    delete_code = generate_delete_code()

    %Vibe{}
    |> Vibe.changeset(attrs |> Map.put("short_id", short_id) |> Map.put("delete_code", delete_code))
    |> Repo.insert()
  end

  def delete_vibe(short_id, code) do
    case get_vibe_by_short_id(short_id) do
      nil -> {:error, :not_found}
      %{anonymized_at: %DateTime{}} -> {:error, :already_anonymized}
      vibe ->
        if Plug.Crypto.secure_compare(vibe.delete_code, code) do
          vibe
          |> Ecto.Changeset.change(%{
            headline: nil,
            narrative: "This vibe has been removed.",
            stats: %{},
            modifier_id: nil,
            delete_code: "USED",
            anonymized_at: DateTime.utc_now() |> DateTime.truncate(:second)
          })
          |> Repo.update()
        else
          {:error, :invalid_code}
        end
    end
  end

  def get_vibe_by_short_id(short_id) do
    Repo.get_by(Vibe, short_id: short_id)
  end

  def list_recent_vibes(opts \\ []) do
    limit = Keyword.get(opts, :limit, 20)
    cursor = Keyword.get(opts, :before)

    query =
      Vibe
      |> where([v], is_nil(v.anonymized_at))
      |> order_by([v], desc: v.inserted_at, desc: v.id)
      |> limit(^limit)

    query =
      if cursor do
        where(query, [v], v.id < ^cursor)
      else
        query
      end

    Repo.all(query)
  end

  def count_vibes do
    Repo.one(from v in Vibe, select: count(v.id))
  end

  def archetype_distribution do
    Vibe
    |> group_by([v], v.archetype_id)
    |> select([v], {v.archetype_id, count(v.id)})
    |> order_by([v], desc: count(v.id))
    |> Repo.all()
  end

  @delete_words ~w(
    apex bass bolt buck byte calm chip clay code copy core cube dart dash dawn
    dice dock dome dose dove drum dusk dust echo edge emit fade fern film fire
    fish flax flip flux foam fold fork frog fuse gale gate gear glow gold grid
    gust hail haze hive horn husk iris jade jazz jolt keel kelp kite knob lamp
    lark lava leaf lime link lion lock loom loot lure lynx malt maps mark mast
    maze mesh mint moat moon moth muse nest node nova oaks opal oryx palm pane
    peak pear pier pine ping pipe plum pond pool puma quad raft rain reed reef
    ring root ruby rush rust sage sail salt sand seal seed silk silo sink snow
    soil song spin star stem surf tack tarn teak thorn tide tile tint toad tone
    tree tusk vale vane vast veil vine volt wade warp wasp wave weld west wick
    wild wing wolf wren yarn yoke zinc zone
  )

  defp generate_delete_code do
    words = @delete_words
    w1 = Enum.random(words) |> String.upcase()
    w2 = Enum.random(words) |> String.upcase()
    digits = :rand.uniform(9000) + 999
    "#{w1}-#{w2}-#{digits}"
  end

  defp generate_short_id do
    alphabet = String.graphemes(@nanoid_alphabet)
    len = length(alphabet)

    1..@nanoid_length
    |> Enum.map(fn _ -> Enum.at(alphabet, :rand.uniform(len) - 1) end)
    |> Enum.join()
  end
end
