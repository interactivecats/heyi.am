defmodule HeyiAm.Projects do
  import Ecto.Query
  require Logger

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
    listed = from(s in Share, where: s.status == "listed", order_by: [asc: s.recorded_at])

    Project
    |> where([p], p.user_id == ^user_id)
    |> order_by([p], asc: p.inserted_at)
    |> preload(shares: ^listed)
    |> Repo.all()
  end

  def list_user_projects_with_all_shares(user_id) do
    all_shares = from(s in Share, order_by: [desc: s.recorded_at])

    Project
    |> where([p], p.user_id == ^user_id)
    |> order_by([p], asc: p.inserted_at)
    |> preload(shares: ^all_shares)
    |> Repo.all()
  end

  def get_project_with_published_shares(user_id, slug) do
    listed = from(s in Share, where: s.status == "listed", order_by: [asc: s.recorded_at])

    Project
    |> where([p], p.user_id == ^user_id and p.slug == ^slug)
    |> preload(shares: ^listed)
    |> Repo.one()
  end

  def get_project_with_accessible_shares(user_id, slug) do
    visible = from(s in Share, where: s.status in ["listed", "unlisted"], order_by: [asc: s.recorded_at])

    Project
    |> where([p], p.user_id == ^user_id and p.slug == ^slug)
    |> preload(shares: ^visible)
    |> Repo.one()
  end

  def get_project_with_all_shares(user_id, slug) do
    all_shares = from(s in Share, order_by: [asc: s.recorded_at])

    Project
    |> where([p], p.user_id == ^user_id and p.slug == ^slug)
    |> preload(shares: ^all_shares)
    |> Repo.one()
  end

  def get_user_project_by_slug(user_id, slug) do
    Repo.get_by(Project, user_id: user_id, slug: slug)
  end

  def update_screenshot_key(user_id, slug, key) do
    case get_user_project_by_slug(user_id, slug) do
      nil ->
        {:error, :not_found}

      project ->
        old_key = project.screenshot_key

        case update_project(project, %{"screenshot_key" => key}) do
          {:ok, updated} ->
            # Clean up old S3 image after successful DB update
            if old_key && old_key != "" && old_key != key do
              HeyiAm.ObjectStorage.delete_object(old_key)
            end

            {:ok, updated}

          error ->
            error
        end
    end
  end

  def get_project_by_client_id(user_id, client_project_id) do
    Repo.get_by(Project, user_id: user_id, client_project_id: client_project_id)
  end

  def upsert_project(user_id, attrs) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)
    client_id = attrs["client_project_id"]
    slug = attrs["slug"]

    existing =
      (client_id && get_project_by_client_id(user_id, client_id)) ||
        (slug && get_project_by_slug(user_id, slug))

    result =
      case existing do
        nil ->
          create_project(Map.put(attrs, "user_id", user_id))

        %Project{} = project ->
          update_project(project, attrs)
      end

    case result do
      {:error, %Ecto.Changeset{} = changeset} ->
        if slug_conflict?(changeset), do: {:error, :slug_conflict}, else: {:error, changeset}

      ok ->
        ok
    end
  end

  defp slug_conflict?(%Ecto.Changeset{} = changeset) do
    Enum.any?(changeset.errors, fn
      {_field, {_, opts}} ->
        Keyword.get(opts, :constraint_name) == "projects_user_id_slug_index"

      _ ->
        false
    end)
  end

  def get_project_by_unlisted_token(token) do
    visible = from(s in Share, where: s.status in ["listed", "unlisted"], order_by: [asc: s.recorded_at])

    Project
    |> where([p], p.unlisted_token == ^token)
    |> preload([:user, shares: ^visible])
    |> Repo.one()
  end

  @doc """
  Deletes a project owned by `user_id`. Returns `{:error, :not_found}` if the
  project doesn't exist or doesn't belong to the user (BOLA protection).
  Cleans up S3 screenshot after successful DB delete.
  """
  def delete_project(user_id, slug) when is_integer(user_id) and is_binary(slug) do
    case get_user_project_by_slug(user_id, slug) do
      nil ->
        {:error, :not_found}

      project ->
        case Repo.delete(project) do
          {:ok, deleted} ->
            # Clean up S3 screenshot after successful DB delete
            if deleted.screenshot_key && deleted.screenshot_key != "" do
              case HeyiAm.ObjectStorage.delete_object(deleted.screenshot_key) do
                :ok -> :ok
                {:error, reason} ->
                  Logger.warning("Orphaned S3 key #{deleted.screenshot_key}: #{inspect(reason)}")
              end
            end

            {:ok, deleted}

          error ->
            error
        end
    end
  end
end
