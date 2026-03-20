defmodule HeyiAm.Repo.Migrations.CreateShares do
  use Ecto.Migration

  def change do
    create table(:shares) do
      add :token, :string, null: false
      add :delete_token, :string, null: false
      add :title, :text, null: false
      add :one_line_summary, :text
      add :narrative, :text
      add :summary, :map
      add :skills, {:array, :string}, default: []
      add :annotation, :text
      add :source_tool, :string, default: "claude-code"
      add :project_name, :string
      add :duration_minutes, :integer
      add :turn_count, :integer
      add :step_count, :integer
      add :session_month, :string
      add :hero_image_url, :string
      add :result_url, :string
      add :machine_token, :string
      add :session_id, :string
      add :user_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:shares, [:token])
    create index(:shares, [:user_id])
    create index(:shares, [:machine_token, :session_id])
  end
end
