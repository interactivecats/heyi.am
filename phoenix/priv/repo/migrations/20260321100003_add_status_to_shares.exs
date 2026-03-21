defmodule HeyiAm.Repo.Migrations.AddStatusToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :status, :string, default: "listed", null: false
    end

    create constraint(:shares, :valid_status,
      check: "status IN ('draft', 'listed', 'unlisted')"
    )
  end
end
