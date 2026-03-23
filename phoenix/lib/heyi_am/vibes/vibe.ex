defmodule HeyiAm.Vibes.Vibe do
  use Ecto.Schema
  import Ecto.Changeset

  schema "vibes" do
    field :short_id, :string
    field :delete_code, :string
    field :archetype_id, :string
    field :modifier_id, :string
    field :narrative, :string
    field :stats, :map
    field :sources, {:array, :string}, default: []
    field :session_count, :integer
    field :total_turns, :integer

    timestamps(type: :utc_datetime)
  end

  @required ~w(short_id delete_code archetype_id narrative stats session_count total_turns)a
  @optional ~w(modifier_id sources)a

  def changeset(vibe, attrs) do
    vibe
    |> cast(attrs, @required ++ @optional)
    |> validate_required(@required)
    |> validate_length(:short_id, max: 10)
    |> validate_length(:archetype_id, max: 50)
    |> validate_length(:modifier_id, max: 50)
    |> validate_length(:narrative, max: 5000)
    |> validate_number(:session_count, greater_than: 0)
    |> validate_number(:total_turns, greater_than_or_equal_to: 0)
    |> validate_stats()
    |> unique_constraint(:short_id)
  end

  defp validate_stats(changeset) do
    validate_change(changeset, :stats, fn :stats, value ->
      if is_map(value), do: [], else: [stats: "must be a map"]
    end)
  end
end
