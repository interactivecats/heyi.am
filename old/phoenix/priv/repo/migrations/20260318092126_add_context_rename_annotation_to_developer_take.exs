defmodule HeyiAm.Repo.Migrations.AddContextRenameAnnotationToDeveloperTake do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :context, :text
    end

    rename table(:shares), :annotation, to: :developer_take
  end
end
