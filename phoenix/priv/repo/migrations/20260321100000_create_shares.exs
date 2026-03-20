defmodule HeyiAm.Repo.Migrations.CreateShares do
  use Ecto.Migration

  def change do
    create table(:shares) do
      add :token, :string, null: false
      add :title, :string
      add :dev_take, :text
      add :duration_minutes, :integer
      add :turns, :integer
      add :files_changed, :integer
      add :loc_changed, :integer
      add :recorded_at, :utc_datetime
      add :verified_at, :utc_datetime
      add :sealed, :boolean, default: false
      add :template, :string, default: "editorial"
      add :language, :string
      add :tools, :map, default: "[]"
      add :skills, :map, default: "[]"
      add :beats, :map, default: "[]"
      add :qa_pairs, :map, default: "[]"
      add :highlights, :map, default: "{}"
      add :tool_breakdown, :map, default: "[]"
      add :top_files, :map, default: "[]"
      add :transcript_excerpt, :map, default: "[]"
      add :narrative, :text
      add :project_name, :string
      add :user_id, references(:users, on_delete: :nilify_all), null: true
      add :pinned_turns, {:array, :string}, default: []
      add :highlighted_steps, {:array, :integer}, default: []
      add :signature, :text
      add :public_key, :text

      timestamps(type: :utc_datetime)
    end

    create unique_index(:shares, [:token])
    create index(:shares, [:user_id])
  end
end
