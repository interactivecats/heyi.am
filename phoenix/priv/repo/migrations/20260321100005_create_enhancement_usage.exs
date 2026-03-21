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

      timestamps(updated_at: false, type: :utc_datetime)
    end

    create index(:enhancement_usage, [:user_id])
    create index(:enhancement_usage, [:inserted_at])
  end
end
