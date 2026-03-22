defmodule HeyiAm.Repo.Migrations.AddSourceToolToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :source_tool, :string, default: "claude"
    end
  end
end
