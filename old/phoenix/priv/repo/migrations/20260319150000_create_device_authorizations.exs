defmodule HeyiAm.Repo.Migrations.CreateDeviceAuthorizations do
  use Ecto.Migration

  def change do
    create table(:device_authorizations) do
      add :device_code, :string, null: false
      add :user_code, :string, null: false, size: 6
      add :user_id, references(:users, on_delete: :delete_all)
      add :status, :string, null: false, default: "pending"
      add :expires_at, :utc_datetime, null: false
      # Temporary storage for the plaintext API token.
      # Set when authorized, cleared after CLI retrieves it.
      # The device_code (256-bit secret) gates access to this value.
      add :api_token_plaintext, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:device_authorizations, [:device_code])
    create unique_index(:device_authorizations, [:user_code], where: "status = 'pending'")
    create index(:device_authorizations, [:user_id])
    create index(:device_authorizations, [:expires_at])

    create constraint(:device_authorizations, :valid_status,
      check: "status IN ('pending', 'authorized', 'expired')"
    )

    # Long-lived API tokens for CLI Bearer auth.
    # Tokens are hashed with SHA-256 -- plaintext shown once at creation.
    create table(:api_tokens) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :hashed_token, :binary, null: false
      add :label, :string, null: false, default: "ccs-cli"
      add :last_used_at, :utc_datetime
      add :expires_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:api_tokens, [:hashed_token])
    create index(:api_tokens, [:user_id])
  end
end
