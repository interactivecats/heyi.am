defmodule HeyiAm.Repo.Migrations.ChangeHighlightsToArray do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      modify :highlights, :jsonb, default: "[]", from: {:jsonb, default: "{}"}
    end
  end
end
