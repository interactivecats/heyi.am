defmodule HeyiAm.Repo.Migrations.AddEndTimeAndCwdToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :end_time, :utc_datetime
      add :cwd, :string
      add :wall_clock_minutes, :integer
    end
  end
end
