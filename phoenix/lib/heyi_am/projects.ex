defmodule HeyiAm.Projects do
  import Ecto.Query

  alias HeyiAm.Repo
  alias HeyiAm.Projects.Project
  alias HeyiAm.Shares.Share

  def create_project(attrs) do
    %Project{}
    |> Project.changeset(attrs)
    |> Repo.insert()
  end

  def update_project(%Project{} = project, attrs) do
    project
    |> Project.changeset(attrs)
    |> Repo.update()
  end

  def get_project_by_slug(user_id, slug) do
    Repo.get_by(Project, user_id: user_id, slug: slug)
  end

  def list_user_projects(user_id) do
    Project
    |> where([p], p.user_id == ^user_id)
    |> order_by([p], asc: p.inserted_at)
    |> Repo.all()
  end

  def get_user_project(user_id, project_id) do
    Repo.get_by(Project, id: project_id, user_id: user_id)
  end

  def list_user_projects_with_published_shares(user_id) do
    published = from(s in Share, where: s.status != "draft", order_by: [asc: s.recorded_at])

    Project
    |> where([p], p.user_id == ^user_id)
    |> order_by([p], asc: p.inserted_at)
    |> preload(shares: ^published)
    |> Repo.all()
  end

  def get_project_with_published_shares(user_id, slug) do
    published = from(s in Share, where: s.status != "draft", order_by: [asc: s.recorded_at])

    Project
    |> where([p], p.user_id == ^user_id and p.slug == ^slug)
    |> preload(shares: ^published)
    |> Repo.one()
  end

  def get_project_by_slug_any_user(slug) do
    Repo.get_by(Project, slug: slug)
  end

  def get_user_project_by_slug(user_id, slug) do
    Repo.get_by(Project, user_id: user_id, slug: slug)
  end

  def update_screenshot_key(user_id, slug, key) do
    case get_user_project_by_slug(user_id, slug) do
      nil -> {:error, :not_found}
      project -> update_project(project, %{"screenshot_key" => key})
    end
  end

  def upsert_project(user_id, attrs) do
    # Normalize to string keys so changeset cast doesn't get mixed atom/string maps
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)
    slug = attrs["slug"]

    # Skip lookup when slug is nil — changeset validation will handle the error
    existing = if slug, do: get_project_by_slug(user_id, slug), else: nil

    case existing do
      nil ->
        create_project(Map.put(attrs, "user_id", user_id))

      %Project{} = project ->
        update_project(project, attrs)
    end
  end
end
