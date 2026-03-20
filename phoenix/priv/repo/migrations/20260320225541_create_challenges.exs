defmodule HeyiAm.Repo.Migrations.CreateChallenges do
  use Ecto.Migration

  def change do
    create table(:challenges) do
      add :title, :string, null: false
      add :problem_statement, :text, null: false
      add :evaluation_criteria, :jsonb, default: "[]"
      add :time_limit_minutes, :integer
      add :access_code_hash, :string
      add :slug, :string, null: false
      add :max_responses, :integer
      add :status, :string, null: false, default: "draft"
      add :creator_id, references(:users, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:challenges, [:slug])
    create index(:challenges, [:creator_id])
    create index(:challenges, [:status])
  end
end
