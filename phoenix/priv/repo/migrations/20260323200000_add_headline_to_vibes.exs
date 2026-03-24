defmodule HeyiAm.Repo.Migrations.AddHeadlineToVibes do
  use Ecto.Migration

  def change do
    alter table(:vibes) do
      add :headline, :string
    end
  end
end
