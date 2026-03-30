defmodule HeyiAm.Repo.Migrations.AddUnlistedTokenToProjects do
  use Ecto.Migration

  def change do
    alter table(:projects) do
      add :unlisted_token, :string
    end

    create unique_index(:projects, [:unlisted_token])
  end
end
