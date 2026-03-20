defmodule HeyiAm.Repo.Migrations.AddChallengeIdToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :challenge_id, references(:challenges, on_delete: :nilify_all)
    end

    create index(:shares, [:challenge_id])
  end
end
