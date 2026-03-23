defmodule HeyiAm.Repo.Migrations.CreateVibes do
  use Ecto.Migration

  def change do
    create table(:vibes) do
      add :short_id, :string, size: 10, null: false
      add :archetype_id, :string, size: 50, null: false
      add :modifier_id, :string, size: 50
      add :narrative, :text, null: false
      add :stats, :map, null: false
      add :sources, {:array, :string}, default: [], null: false
      add :session_count, :integer, null: false
      add :total_turns, :integer, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:vibes, [:short_id])
    create index(:vibes, [:inserted_at], comment: "newest-first listing")
  end
end
