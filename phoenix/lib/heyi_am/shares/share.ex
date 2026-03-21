defmodule HeyiAm.Shares.Share do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_templates ~w(editorial terminal minimal brutalist campfire neon-night)

  schema "shares" do
    field :token, :string
    field :title, :string
    field :dev_take, :string
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
    field :beats, {:array, :map}, default: []
    field :qa_pairs, {:array, :map}, default: []
    field :highlights, {:array, :map}, default: []
    field :tool_breakdown, {:array, :map}, default: []
    field :top_files, {:array, :map}, default: []
    field :transcript_excerpt, {:array, :map}, default: []
    field :narrative, :string
    field :project_name, :string
    field :pinned_turns, {:array, :string}, default: []
    field :highlighted_steps, {:array, :integer}, default: []
    field :signature, :string
    field :public_key, :string

    belongs_to :user, HeyiAm.Accounts.User
    belongs_to :challenge, HeyiAm.Challenges.Challenge

    timestamps(type: :utc_datetime)
  end

  def valid_templates, do: @valid_templates

  def changeset(%{sealed: true} = share, _attrs) do
    share
    |> change()
    |> add_error(:sealed, "sealed sessions cannot be modified")
  end

  def changeset(share, attrs) do
    share
    |> cast(attrs, [
      :token, :title, :dev_take, :duration_minutes, :turns, :files_changed,
      :loc_changed, :recorded_at, :verified_at, :sealed, :template, :language,
      :tools, :skills, :beats, :qa_pairs, :highlights, :tool_breakdown,
      :top_files, :transcript_excerpt, :narrative, :project_name, :user_id,
      :pinned_turns, :highlighted_steps, :signature, :public_key,
      :challenge_id
    ])
    |> validate_required([:token, :title])
    |> validate_length(:title, max: 200)
    |> validate_length(:dev_take, max: 2000)
    |> validate_length(:narrative, max: 10000)
    |> validate_length(:project_name, max: 200)
    |> validate_skills_length()
    |> validate_inclusion(:template, @valid_templates)
    |> unique_constraint(:token)
  end

  defp validate_skills_length(changeset) do
    validate_change(changeset, :skills, fn :skills, skills ->
      if length(skills) > 50,
        do: [skills: "cannot have more than 50 items"],
        else: []
    end)
  end
end
