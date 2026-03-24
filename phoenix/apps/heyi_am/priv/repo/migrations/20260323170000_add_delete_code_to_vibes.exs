defmodule HeyiAm.Repo.Migrations.AddDeleteCodeToVibes do
  use Ecto.Migration

  def change do
    alter table(:vibes) do
      add :delete_code, :string, null: false, default: ""
    end
  end
end
