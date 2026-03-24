defmodule HeyiAm.Repo.Migrations.CreateEnhancementUsage do
  use Ecto.Migration

  def change do
    create table(:enhancement_usage) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :provider, :string, null: false
      add :model, :string, null: false
      add :input_tokens, :integer, null: false, default: 0
      add :output_tokens, :integer, null: false, default: 0
      add :estimated_cost_cents, :integer, null: false, default: 0
      add :duration_ms, :integer, null: false, default: 0
      add :status, :string, null: false
      add :error_code, :string

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:enhancement_usage, [:user_id, :inserted_at])
  end
end
