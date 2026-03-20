defmodule HeyiAm.Repo.Migrations.AddSealedFieldsToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :sealed_at, :utc_datetime
      add :seal_signature, :string
    end
  end
end
