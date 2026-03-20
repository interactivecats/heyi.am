defmodule HeyiAm.Shares.Share do
  use Ecto.Schema
  import Ecto.Changeset
  import HeyiAm.ChangesetHelpers, only: [validate_url_scheme: 2]

  schema "shares" do
    field :token, :string
    field :delete_token, :string
    field :title, :string
    field :one_line_summary, :string
    field :narrative, :string
    field :summary, :map
    field :skills, {:array, :string}, default: []
    field :context, :string
    field :developer_take, :string
    field :source_tool, :string, default: "claude-code"
    field :project_name, :string
    field :duration_minutes, :integer
    field :turn_count, :integer
    field :step_count, :integer
    field :session_month, :string
    field :hero_image_url, :string
    field :result_url, :string
    field :machine_token, :string
    field :session_id, :string
    field :session_questions, :map
    field :sealed_at, :utc_datetime
    field :seal_signature, :string

    belongs_to :user, HeyiAm.Accounts.User
    belongs_to :project, HeyiAm.Projects.Project
    belongs_to :challenge, HeyiAm.Challenges.Challenge

    timestamps(type: :utc_datetime)
  end

  @required_fields [:token, :delete_token, :title]
  @optional_fields [
    :one_line_summary,
    :narrative,
    :summary,
    :skills,
    :context,
    :developer_take,
    :source_tool,
    :project_name,
    :duration_minutes,
    :turn_count,
    :step_count,
    :session_month,
    :hero_image_url,
    :result_url,
    :machine_token,
    :session_id,
    :user_id,
    :session_questions,
    :sealed_at,
    :seal_signature,
    :challenge_id
  ]

  def changeset(share, attrs) do
    share
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> reject_if_sealed()
    |> validate_required(@required_fields)
    |> unique_constraint(:token)
    |> validate_length(:context, max: 200)
    |> validate_length(:developer_take, max: 300)
    |> validate_url_scheme(:result_url)
    |> validate_url_scheme(:hero_image_url)
  end

  @doc "Changeset for sealing a share — sets sealed_at and signature."
  def seal_changeset(share, attrs) do
    share
    |> cast(attrs, [:sealed_at, :seal_signature])
    |> validate_required([:sealed_at, :seal_signature])
  end

  defp reject_if_sealed(changeset) do
    case get_field(changeset, :sealed_at) do
      nil -> changeset
      _ -> add_error(changeset, :sealed_at, "cannot update a sealed session")
    end
  end
end
