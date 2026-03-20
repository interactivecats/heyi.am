defmodule HeyiAm.Repo.Migrations.AddProfilePublicAndDataToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_public, :boolean, default: false, null: false
      add :profile_data, :map, default: %{}
    end
  end
end
