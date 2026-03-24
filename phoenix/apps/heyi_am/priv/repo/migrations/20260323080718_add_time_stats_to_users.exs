defmodule HeyiAm.Repo.Migrations.AddTimeStatsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add_if_not_exists :time_stats, :map
    end

    alter table(:projects) do
      add_if_not_exists :total_agent_duration_minutes, :integer
    end
  end
end
