defmodule HeyiAm.Shares.Share do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_templates ~w(editorial terminal minimal brutalist campfire neon-night)
  @valid_statuses ~w(draft listed unlisted)

  schema "shares" do
    field :token, :string
    field :title, :string
    field :dev_take, :string
    field :context, :string
    field :duration_minutes, :integer
    field :turns, :integer
    field :files_changed, :integer
    field :loc_changed, :integer
    field :recorded_at, :utc_datetime
    field :verified_at, :utc_datetime
    field :sealed, :boolean, default: false
    field :template, :string, default: "editorial"
    field :language, :string
    field :tools, {:array, :string}, default: []
    field :skills, {:array, :string}, default: []
    field :narrative, :string
    field :project_name, :string
    field :signature, :string
    field :public_key, :string
    field :status, :string, default: "draft"
    field :raw_storage_key, :string
    field :log_storage_key, :string
    field :session_storage_key, :string
    field :slug, :string
    field :source_tool, :string, default: "claude"
    field :end_time, :utc_datetime
    field :cwd, :string
    field :wall_clock_minutes, :integer
    field :agent_summary, :map
    field :rendered_html, :string

    belongs_to :user, HeyiAm.Accounts.User
    belongs_to :project, HeyiAm.Projects.Project

    timestamps(type: :utc_datetime)
  end

  def valid_templates, do: @valid_templates
  def valid_statuses, do: @valid_statuses

  def changeset(%{sealed: true} = share, _attrs) do
    share
    |> change()
    |> add_error(:sealed, "sealed sessions cannot be modified")
  end

  def changeset(share, attrs) do
    share
    |> cast(attrs, [
      :token, :title, :dev_take, :context, :duration_minutes, :turns, :files_changed,
      :loc_changed, :recorded_at, :verified_at, :sealed, :template, :language,
      :tools, :skills, :narrative, :project_name, :user_id,
      :signature, :public_key,
      :status,
      :raw_storage_key, :log_storage_key, :session_storage_key,
      :slug, :project_id, :source_tool,
      :end_time, :cwd, :wall_clock_minutes,
      :agent_summary, :rendered_html
    ])
    |> validate_required([:token, :title])
    |> validate_length(:title, max: 200)
    |> validate_length(:dev_take, max: 2000)
    |> validate_length(:context, max: 500)
    |> validate_length(:narrative, max: 10000)
    |> validate_length(:project_name, max: 200)
    |> validate_skills_length()
    |> validate_inclusion(:template, @valid_templates)
    |> validate_inclusion(:status, @valid_statuses)
    |> unique_constraint(:token)
    |> unique_constraint(:slug, name: :shares_project_id_slug_index)
  end

  defp validate_skills_length(changeset) do
    validate_change(changeset, :skills, fn :skills, skills ->
      if length(skills) > 50,
        do: [skills: "cannot have more than 50 items"],
        else: []
    end)
  end
end
