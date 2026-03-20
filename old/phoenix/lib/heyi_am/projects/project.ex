defmodule HeyiAm.Projects.Project do
  use Ecto.Schema
  import Ecto.Changeset

  schema "projects" do
    field :project_key, :string
    field :display_name, :string
    field :description, :string
    field :visible, :boolean, default: true
    field :featured_quote, :string
    field :position, :integer, default: 0
    field :stats_cache, :map, default: %{}
    field :featured_sessions, {:array, :string}, default: []

    belongs_to :user, HeyiAm.Accounts.User
    has_many :shares, HeyiAm.Shares.Share

    timestamps(type: :utc_datetime)
  end

  @required_fields [:project_key]
  @optional_fields [
    :display_name,
    :description,
    :visible,
    :featured_quote,
    :position,
    :stats_cache,
    :featured_sessions
  ]

  def changeset(project, attrs) do
    project
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_length(:display_name, max: 80)
    |> validate_length(:description, max: 300)
    |> validate_length(:featured_quote, max: 300)
    |> validate_length(:project_key, max: 255)
    |> validate_number(:position, greater_than_or_equal_to: 0)
    |> unique_constraint([:user_id, :project_key])
  end

  @doc """
  Changeset for updates -- does not allow changing project_key.
  """
  def update_changeset(project, attrs) do
    project
    |> cast(attrs, @optional_fields)
    |> validate_length(:display_name, max: 80)
    |> validate_length(:description, max: 300)
    |> validate_length(:featured_quote, max: 300)
    |> validate_number(:position, greater_than_or_equal_to: 0)
  end
end
