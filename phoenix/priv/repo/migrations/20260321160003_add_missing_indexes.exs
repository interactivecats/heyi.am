defmodule HeyiAm.Repo.Migrations.AddMissingIndexes do
  use Ecto.Migration

  def change do
    create index(:portfolio_sessions, [:share_id])

    drop index(:enhancement_usage, [:user_id])
    drop index(:enhancement_usage, [:inserted_at])
    create index(:enhancement_usage, [:user_id, :inserted_at])
  end
end
