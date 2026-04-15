defmodule HeyiAm.Repo.Migrations.AddProfilePhotoSmallKeyToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :profile_photo_small_key, :string
    end
  end
end
