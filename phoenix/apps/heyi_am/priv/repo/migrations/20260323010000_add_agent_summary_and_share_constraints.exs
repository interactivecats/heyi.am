defmodule HeyiAm.Repo.Migrations.AddAgentSummaryAndShareConstraints do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :agent_summary, :map
    end

    create unique_index(:shares, [:project_id, :slug],
      where: "project_id IS NOT NULL",
      name: :shares_project_id_slug_index)
  end
end
