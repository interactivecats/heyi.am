defmodule HeyiAm.Projects.Project do
  use Ecto.Schema
  import Ecto.Changeset

  schema "projects" do
    field :slug, :string
    field :title, :string
    field :narrative, :string
    field :repo_url, :string
    field :project_url, :string
    field :screenshot_key, :string
    field :timeline, {:array, :map}, default: []
    field :skills, {:array, :string}, default: []
    field :total_sessions, :integer
    field :total_loc, :integer
    field :total_duration_minutes, :integer
    field :total_agent_duration_minutes, :integer
    field :total_files_changed, :integer
    field :skipped_sessions, {:array, :map}, default: []

    belongs_to :user, HeyiAm.Accounts.User
    has_many :shares, HeyiAm.Shares.Share

    timestamps(type: :utc_datetime)
  end

  def changeset(project, attrs) do
    project
    |> cast(attrs, [
      :slug, :title, :narrative, :repo_url, :project_url, :screenshot_key,
      :timeline, :skills, :total_sessions, :total_loc, :total_duration_minutes,
      :total_agent_duration_minutes, :total_files_changed, :skipped_sessions, :user_id
    ])
    |> validate_required([:slug, :title, :user_id])
    |> validate_length(:slug, max: 100)
    |> validate_length(:title, max: 200)
    |> validate_format(:slug, ~r/^[a-z0-9-]+$/, message: "must be lowercase alphanumeric with hyphens")
    |> unique_constraint([:user_id, :slug])
    |> foreign_key_constraint(:user_id)
  end
end
