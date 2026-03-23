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
      vibe ->
        if Plug.Crypto.secure_compare(vibe.delete_code, code) do
          Repo.delete(vibe)
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

  defp generate_delete_code do
    :crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)
  end

  defp generate_short_id do
    alphabet = String.graphemes(@nanoid_alphabet)
    len = length(alphabet)

    1..@nanoid_length
    |> Enum.map(fn _ -> Enum.at(alphabet, :rand.uniform(len) - 1) end)
    |> Enum.join()
  end
end
