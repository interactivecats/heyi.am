defmodule HeyiAm.Repo.Migrations.InitialSchema do
  use Ecto.Migration

  def change do
    execute "CREATE EXTENSION IF NOT EXISTS citext", "DROP EXTENSION IF EXISTS citext"

    # ----------------------------------------------------------------
    # users
    # ----------------------------------------------------------------
    create table(:users) do
      add :email, :citext, null: false
      add :hashed_password, :string
      add :confirmed_at, :utc_datetime
      add :username, :string
      add :display_name, :string
      add :bio, :text
      add :avatar_url, :string
      add :github_id, :integer
      add :github_url, :string
      add :location, :string
      add :status, :string
      add :portfolio_layout, :string, default: "editorial"
      add :portfolio_accent, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:users, [:email])
    create unique_index(:users, [:username])
    create unique_index(:users, [:github_id])

    # ----------------------------------------------------------------
    # users_tokens
    # ----------------------------------------------------------------
    create table(:users_tokens) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :token, :binary, null: false
      add :context, :string, null: false
      add :sent_to, :string
      add :authenticated_at, :utc_datetime

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:users_tokens, [:user_id])
    create unique_index(:users_tokens, [:context, :token])

    # ----------------------------------------------------------------
    # projects
    # ----------------------------------------------------------------
    create table(:projects) do
      add :slug, :string, null: false
      add :title, :string, null: false
      add :narrative, :text
      add :repo_url, :string
      add :project_url, :string
      add :screenshot_key, :string
      add :timeline, :jsonb, default: "[]"
      add :skills, {:array, :string}, default: []
      add :total_sessions, :integer
      add :total_loc, :integer
      add :total_duration_minutes, :integer
      add :total_files_changed, :integer
      add :skipped_sessions, :jsonb, default: "[]"
      add :user_id, references(:users, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:projects, [:user_id, :slug])
    create index(:projects, [:user_id])

    # ----------------------------------------------------------------
    # shares
    # ----------------------------------------------------------------
    create table(:shares) do
      add :token, :string, null: false
      add :title, :string
      add :dev_take, :text
      add :context, :text
      add :duration_minutes, :integer
      add :turns, :integer
      add :files_changed, :integer
      add :loc_changed, :integer
      add :recorded_at, :utc_datetime
      add :verified_at, :utc_datetime
      add :sealed, :boolean, default: false
      add :template, :string, default: "editorial"
      add :language, :string
      add :tools, {:array, :string}, default: []
      add :skills, {:array, :string}, default: []
      add :narrative, :text
      add :project_name, :string
      add :signature, :text
      add :public_key, :text
      add :status, :string, null: false, default: "draft"
      add :raw_storage_key, :string
      add :log_storage_key, :string
      add :session_storage_key, :string
      add :slug, :string
      add :source_tool, :string, default: "claude"
      add :end_time, :utc_datetime
      add :cwd, :string
      add :wall_clock_minutes, :integer
      add :user_id, references(:users, on_delete: :nilify_all)
      add :project_id, references(:projects, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:shares, [:token])
    create index(:shares, [:user_id])
    create index(:shares, [:project_id])

    create constraint(:shares, :valid_status,
      check: "status IN ('draft', 'listed', 'unlisted')"
    )

    # ----------------------------------------------------------------
    # portfolio_sessions
    # ----------------------------------------------------------------
    create table(:portfolio_sessions) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :share_id, references(:shares, on_delete: :delete_all), null: false
      add :project_name, :string
      add :position, :integer
      add :visible, :boolean, default: true

      timestamps(type: :utc_datetime)
    end

    create unique_index(:portfolio_sessions, [:user_id, :share_id])
    create index(:portfolio_sessions, [:user_id])
    create index(:portfolio_sessions, [:share_id])

    # ----------------------------------------------------------------
    # device_codes
    # ----------------------------------------------------------------
    create table(:device_codes) do
      add :device_code, :binary, null: false
      add :user_code, :string, null: false, size: 9
      add :user_id, references(:users, on_delete: :delete_all)
      add :status, :string, null: false, default: "pending"
      add :expires_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create unique_index(:device_codes, [:device_code])
    create unique_index(:device_codes, [:user_code])
    create index(:device_codes, [:status])

    # ----------------------------------------------------------------
    # enhancement_usage
    # ----------------------------------------------------------------
    create table(:enhancement_usage) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :provider, :string, null: false
      add :model, :string, null: false
      add :input_tokens, :integer, null: false, default: 0
      add :output_tokens, :integer, null: false, default: 0
      add :estimated_cost_cents, :integer, null: false, default: 0
      add :duration_ms, :integer, null: false, default: 0
      add :status, :string, null: false
      add :error_code, :string

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:enhancement_usage, [:user_id, :inserted_at])
  end
end
