defmodule HeyiAm.Repo.Migrations.CreateProjects do
  use Ecto.Migration

  def change do
    create table(:projects) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :slug, :string, null: false
      add :title, :string, null: false
      add :narrative, :text
      add :repo_url, :string
      add :project_url, :string
      add :screenshot_key, :string
      add :timeline, :jsonb, default: "[]"
      add :skills, {:array, :string}, default: []
      add :total_sessions, :integer
      add :total_loc, :integer
      add :total_duration_minutes, :integer
      add :total_agent_duration_minutes, :integer
      add :total_files_changed, :integer
      add :skipped_sessions, :jsonb, default: "[]"
      add :rendered_html, :text

      timestamps(type: :utc_datetime)
    end

    create index(:projects, [:user_id])
    create unique_index(:projects, [:user_id, :slug])
  end
end
