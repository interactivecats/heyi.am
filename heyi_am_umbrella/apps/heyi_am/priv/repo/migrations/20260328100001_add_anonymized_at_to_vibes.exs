defmodule HeyiAm.Repo.Migrations.AddAnonymizedAtToVibes do
  use Ecto.Migration

  def change do
    alter table(:vibes) do
      add :anonymized_at, :utc_datetime
    end
  end
end
