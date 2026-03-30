defmodule HeyiAm.Shares.Share do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_templates ~w(editorial terminal minimal brutalist campfire neon-night)
  @valid_statuses ~w(draft listed unlisted archived)

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
    field :template, :string, default: "editorial"
    field :language, :string
    field :tools, {:array, :string}, default: []
    field :skills, {:array, :string}, default: []
    field :narrative, :string
    field :project_name, :string
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

  def changeset(share, attrs) do
    share
    |> cast(attrs, [
      :token, :title, :dev_take, :context, :duration_minutes, :turns, :files_changed,
      :loc_changed, :recorded_at, :template, :language,
      :tools, :skills, :narrative, :project_name, :user_id,
      :status,
      :raw_storage_key, :log_storage_key, :session_storage_key,
      :slug, :project_id, :source_tool,
      :end_time, :cwd, :wall_clock_minutes,
      :agent_summary
      # rendered_html is intentionally excluded — it is only writable
      # via rendered_html_changeset/2 (CLI upload pipeline), never the session create API.
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

  @doc """
  A changeset for updating rendered HTML from the CLI upload pipeline only.
  Separate from changeset/2 to prevent stored HTML injection via the session create API.
  """
  def rendered_html_changeset(share, attrs) do
    sanitized = sanitize_rendered_html(attrs)

    share
    |> cast(sanitized, [:rendered_html])
    |> validate_length(:rendered_html, max: 5_000_000, message: "rendered HTML is too large (max 5MB)")
  end

  defp sanitize_rendered_html(%{"rendered_html" => html} = attrs) when is_binary(html) do
    Map.put(attrs, "rendered_html", HeyiAm.HtmlSanitizer.sanitize(html))
  end
  defp sanitize_rendered_html(%{rendered_html: html} = attrs) when is_binary(html) do
    Map.put(attrs, :rendered_html, HeyiAm.HtmlSanitizer.sanitize(html))
  end
  defp sanitize_rendered_html(attrs), do: attrs

  defp validate_skills_length(changeset) do
    validate_change(changeset, :skills, fn :skills, skills ->
      if length(skills) > 50,
        do: [skills: "cannot have more than 50 items"],
        else: []
    end)
  end
end
