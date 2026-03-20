defmodule HeyiAm.Repo.Migrations.AddProfileFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :username, :string
      add :display_name, :string
      add :bio, :text
      add :avatar_url, :string
      add :github_id, :integer
      add :github_url, :string
      add :location, :string
      add :status, :string
      add :portfolio_layout, :string, default: "editorial"
      add :portfolio_accent, :string
    end

    create unique_index(:users, [:username])
    create unique_index(:users, [:github_id])
  end
end
