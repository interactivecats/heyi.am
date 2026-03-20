defmodule HeyiAm.Repo.Migrations.AddSessionQuestionsToShares do
  use Ecto.Migration

  def change do
    alter table(:shares) do
      add :session_questions, :map
    end
  end
end
