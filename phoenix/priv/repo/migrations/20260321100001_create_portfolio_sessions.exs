defmodule HeyiAm.Repo.Migrations.CreatePortfolioSessions do
  use Ecto.Migration

  def change do
    create table(:portfolio_sessions) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :share_id, references(:shares, on_delete: :delete_all), null: false
      add :project_name, :string
      add :position, :integer
      add :visible, :boolean, default: true

      timestamps(type: :utc_datetime)
    end

    create unique_index(:portfolio_sessions, [:user_id, :share_id])
    create index(:portfolio_sessions, [:user_id])
  end
end
