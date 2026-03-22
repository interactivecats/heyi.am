defmodule HeyiAm.Repo.Migrations.AddProjectMetaToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :project_meta, :map
    end
  end
end
