defmodule HeyiAm.Repo.Migrations.AddNotNullToSharesToken do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      modify :token, :string, null: false, from: :string
    end
  end
end
