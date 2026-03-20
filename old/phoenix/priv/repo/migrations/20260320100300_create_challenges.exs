defmodule HeyiAm.Repo.Migrations.CreateChallenges do
  use Ecto.Migration

  def change do
    create table(:challenges) do
      add :token, :string, null: false
      add :description, :text
      add :posted_by, :string
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :is_private, :boolean, default: false
      add :access_code_hash, :string
      add :status, :string, default: "open"
      add :expires_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:challenges, [:token])
    create index(:challenges, [:user_id])
  end
end
