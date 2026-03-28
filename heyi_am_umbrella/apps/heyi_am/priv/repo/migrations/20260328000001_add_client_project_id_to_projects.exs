defmodule HeyiAm.Repo.Migrations.AddClientProjectIdToProjects do
  use Ecto.Migration

  def change do
    alter table(:projects) do
      add :client_project_id, :uuid
    end

    create unique_index(:projects, [:user_id, :client_project_id],
      where: "client_project_id IS NOT NULL",
      name: :projects_user_id_client_project_id_index
    )
  end
end
