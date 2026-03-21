defmodule HeyiAm.Repo.Migrations.ChangeSharesStatusDefault do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      modify :status, :string, default: "draft", null: false, from: {:string, default: "listed", null: false}
    end
  end
end
