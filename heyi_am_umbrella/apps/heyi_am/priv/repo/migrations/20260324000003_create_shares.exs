defmodule HeyiAm.Repo.Migrations.CreateShares do
  use Ecto.Migration

  def change do
    create table(:shares) do
      add :user_id, references(:users, on_delete: :nilify_all)
      add :project_id, references(:projects, on_delete: :nilify_all)
      add :token, :string, null: false
      add :title, :string
      add :dev_take, :text
      add :context, :text
      add :duration_minutes, :integer
      add :turns, :integer
      add :files_changed, :integer
      add :loc_changed, :integer
      add :recorded_at, :utc_datetime
      add :template, :string, default: "editorial"
      add :language, :string
      add :tools, {:array, :string}, default: []
      add :skills, {:array, :string}, default: []
      add :narrative, :text
      add :project_name, :string
      add :status, :string, null: false, default: "draft"
      add :raw_storage_key, :string
      add :log_storage_key, :string
      add :session_storage_key, :string
      add :slug, :string
      add :source_tool, :string, default: "claude"
      add :end_time, :utc_datetime
      add :cwd, :string
      add :wall_clock_minutes, :integer
      add :agent_summary, :map
      add :rendered_html, :text

      timestamps(type: :utc_datetime)
    end

    create unique_index(:shares, [:token])
    create index(:shares, [:user_id])
    create index(:shares, [:project_id])

    create unique_index(:shares, [:project_id, :slug],
      where: "project_id IS NOT NULL",
      name: :shares_project_id_slug_index
    )

    create constraint(:shares, :valid_status,
      check: "status IN ('draft', 'listed', 'unlisted')"
    )
  end
end
