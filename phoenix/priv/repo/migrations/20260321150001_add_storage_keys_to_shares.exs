defmodule HeyiAm.Repo.Migrations.AddStorageKeysToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :raw_storage_key, :string
      add :log_storage_key, :string
    end
  end
end
