defmodule HeyiAm.Repo.Migrations.CreatePortfolioEntries do
  use Ecto.Migration

  def change do
    create table(:portfolio_entries) do
      add :pinned, :boolean, default: false, null: false
      add :position, :integer, default: 0, null: false
      add :visible, :boolean, default: true, null: false
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :share_id, references(:shares, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:portfolio_entries, [:user_id, :share_id])
    create index(:portfolio_entries, [:user_id])
  end
end
