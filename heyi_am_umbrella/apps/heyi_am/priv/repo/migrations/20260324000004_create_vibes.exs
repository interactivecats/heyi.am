defmodule HeyiAm.Repo.Migrations.CreateVibes do
  use Ecto.Migration

  def change do
    create table(:vibes) do
      add :short_id, :string, null: false
      add :delete_code, :string, null: false
      add :archetype_id, :string, null: false
      add :modifier_id, :string
      add :headline, :string
      add :narrative, :text, null: false
      add :stats, :map, null: false
      add :sources, {:array, :string}, default: []
      add :session_count, :integer, null: false
      add :total_turns, :integer, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:vibes, [:short_id])
  end
end
