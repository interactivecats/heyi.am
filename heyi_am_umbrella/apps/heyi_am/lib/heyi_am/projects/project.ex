defmodule HeyiAm.Projects.Project do
  use Ecto.Schema
  import Ecto.Changeset

  schema "projects" do
    field :client_project_id, Ecto.UUID
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
    field :rendered_html, :string
    field :unlisted_token, :string

    belongs_to :user, HeyiAm.Accounts.User
    has_many :shares, HeyiAm.Shares.Share

    timestamps(type: :utc_datetime)
  end

  def changeset(project, attrs) do
    attrs = attrs |> sanitize_html() |> normalize_slug()

    project
    |> cast(attrs, [
      :client_project_id, :slug, :title, :narrative, :repo_url, :project_url, :screenshot_key,
      :timeline, :skills, :total_sessions, :total_loc, :total_duration_minutes,
      :total_agent_duration_minutes, :total_files_changed, :skipped_sessions, :rendered_html, :user_id
    ])
    |> validate_required([:slug, :title, :user_id])
    |> validate_length(:slug, max: 100)
    |> validate_length(:title, max: 200)
    |> validate_format(:slug, ~r/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, message: "must be lowercase alphanumeric with hyphens, cannot start or end with hyphen")
    |> maybe_generate_unlisted_token()
    |> unique_constraint([:user_id, :slug])
    |> unique_constraint([:user_id, :client_project_id], name: :projects_user_id_client_project_id_index)
    |> unique_constraint(:unlisted_token)
    |> foreign_key_constraint(:user_id)
  end

  defp maybe_generate_unlisted_token(changeset) do
    if get_field(changeset, :unlisted_token) do
      changeset
    else
      put_change(changeset, :unlisted_token, generate_token())
    end
  end

  defp generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end

  defp normalize_slug(%{"slug" => slug} = attrs) when is_binary(slug) do
    normalized =
      slug
      |> String.downcase()
      |> String.replace(~r/[^a-z0-9]+/, "-")
      |> String.replace(~r/^-|-$/, "")
      |> String.slice(0, 100)

    Map.put(attrs, "slug", normalized)
  end
  defp normalize_slug(%{slug: slug} = attrs) when is_binary(slug) do
    normalized =
      slug
      |> String.downcase()
      |> String.replace(~r/[^a-z0-9]+/, "-")
      |> String.replace(~r/^-|-$/, "")
      |> String.slice(0, 100)

    Map.put(attrs, :slug, normalized)
  end
  defp normalize_slug(attrs), do: attrs

  defp sanitize_html(%{"rendered_html" => html} = attrs) when is_binary(html) do
    Map.put(attrs, "rendered_html", HeyiAm.HtmlSanitizer.sanitize(html))
  end
  defp sanitize_html(%{rendered_html: html} = attrs) when is_binary(html) do
    Map.put(attrs, :rendered_html, HeyiAm.HtmlSanitizer.sanitize(html))
  end
  defp sanitize_html(attrs), do: attrs
end
