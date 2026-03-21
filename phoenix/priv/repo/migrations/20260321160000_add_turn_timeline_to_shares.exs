defmodule HeyiAm.Repo.Migrations.AddTurnTimelineToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :turn_timeline, :jsonb, default: "[]"
    end
  end
end
