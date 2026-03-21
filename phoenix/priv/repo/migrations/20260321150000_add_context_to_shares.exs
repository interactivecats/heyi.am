defmodule HeyiAm.Repo.Migrations.AddContextToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :context, :text
    end
  end
end
