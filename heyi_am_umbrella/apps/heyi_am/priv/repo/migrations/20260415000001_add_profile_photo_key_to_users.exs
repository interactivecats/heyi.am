defmodule HeyiAm.Repo.Migrations.AddProfilePhotoKeyToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_photo_key, :string
    end
  end
end
