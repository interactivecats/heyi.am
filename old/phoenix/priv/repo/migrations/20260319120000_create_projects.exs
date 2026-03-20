defmodule HeyiAm.Repo.Migrations.CreateProjects do
  use Ecto.Migration

  def change do
    create table(:projects) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :project_key, :string, null: false
      add :display_name, :string
      add :description, :string
      add :visible, :boolean, default: true, null: false
      add :featured_quote, :text
      add :position, :integer, default: 0, null: false
      add :stats_cache, :map, default: %{}
      add :featured_sessions, {:array, :string}, default: []

      timestamps(type: :utc_datetime)
    end

    create unique_index(:projects, [:user_id, :project_key])
    create index(:projects, [:user_id])

    alter table(:shares) do
      add :project_id, references(:projects, on_delete: :nilify_all)
    end

    create index(:shares, [:project_id])
  end
end
