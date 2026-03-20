defmodule HeyiAm.Repo.Migrations.AddLocationAndStatusToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :location, :string
      add :status, :string
    end
  end
end
