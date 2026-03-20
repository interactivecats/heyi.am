defmodule HeyiAm.Repo.Migrations.AddProfileFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :username, :string
      add :github_id, :bigint
      add :display_name, :string
      add :bio, :text
      add :avatar_url, :string
      add :github_url, :string
      add :links, :map, default: %{}
      add :portfolio_layout, :string, default: "highlights"
      add :portfolio_accent, :string, default: "violet"
    end

    create unique_index(:users, [:username])
    create unique_index(:users, [:github_id], where: "github_id IS NOT NULL")
  end
end
