defmodule HeyiAm.Repo.Migrations.BackfillRecordedAtOnShares do
  use Ecto.Migration

  def up do
    execute "UPDATE shares SET recorded_at = inserted_at WHERE recorded_at IS NULL"
  end

  def down do
    :ok
  end
end
