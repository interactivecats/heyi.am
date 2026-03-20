defmodule HeyiAm.Projects do
  import Ecto.Query
  alias HeyiAm.Repo
  alias HeyiAm.Projects.Project
  alias HeyiAm.Shares.Share

  @doc """
  Find a project by user_id + project_key, or create it if it doesn't exist.
  Returns {:ok, project} or {:error, changeset}.
  """
  def find_or_create_project(user_id, project_key, attrs \\ %{}) do
    case get_project(user_id, project_key) do
      nil ->
        %Project{user_id: user_id}
        |> Project.changeset(Map.put(attrs, :project_key, project_key))
        |> Repo.insert()

      project ->
        {:ok, project}
    end
  end

  @doc """
  All projects for a user, ordered by position.
  """
  def get_user_projects(user_id) do
    from(p in Project,
      where: p.user_id == ^user_id,
      order_by: [asc: p.position, asc: p.inserted_at]
    )
    |> Repo.all()
  end

  @doc """
  Single project by user_id + project_key.
  """
  def get_project(user_id, project_key) do
    Repo.get_by(Project, user_id: user_id, project_key: project_key)
  end

  @doc """
  Update a project's settings.
  """
  def update_project(%Project{} = project, attrs) do
    project
    |> Project.update_changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Recompute aggregate stats from shares linked to this project.
  Stores share_count, total_duration_minutes, tools, and skills in stats_cache.
  """
  def recompute_stats(%Project{} = project) do
    stats =
      from(s in Share,
        where: s.project_id == ^project.id,
        select: %{
          share_count: count(s.id),
          total_duration_minutes: sum(s.duration_minutes)
        }
      )
      |> Repo.one()

    skills =
      from(s in Share,
        where: s.project_id == ^project.id and not is_nil(s.skills),
        select: s.skills
      )
      |> Repo.all()
      |> List.flatten()
      |> Enum.uniq()

    tools =
      from(s in Share,
        where: s.project_id == ^project.id and not is_nil(s.source_tool),
        select: s.source_tool
      )
      |> Repo.all()
      |> Enum.uniq()

    cache = %{
      "share_count" => stats.share_count || 0,
      "total_duration_minutes" => stats.total_duration_minutes || 0,
      "skills" => skills,
      "tools" => tools
    }

    project
    |> Ecto.Changeset.change(stats_cache: cache)
    |> Repo.update()
  end

  @doc """
  Main API entry point for CLI sync. Finds or creates the project,
  then updates it with the provided settings.
  Returns {:ok, project} or {:error, changeset}.
  """
  def sync_project_settings(user_id, project_key, settings_map) do
    case get_project(user_id, project_key) do
      nil ->
        %Project{user_id: user_id}
        |> Project.changeset(Map.put(settings_map, :project_key, project_key))
        |> Repo.insert()

      project ->
        update_project(project, settings_map)
    end
  end

  @doc "Get all shares linked to a project, ordered by most recent first."
  def get_project_shares(project_id, user_id) do
    from(s in Share,
      where: s.project_id == ^project_id and s.user_id == ^user_id,
      order_by: [desc: s.inserted_at]
    )
    |> Repo.all()
  end

  @doc "Get all shares not linked to any project for a user."
  def get_orphan_shares(user_id) do
    from(s in Share,
      where: s.user_id == ^user_id and is_nil(s.project_id),
      order_by: [desc: s.inserted_at]
    )
    |> Repo.all()
  end

  @doc """
  Link a share to its project. Finds or creates the project by project_name,
  sets share.project_id, and recomputes stats.
  """
  def link_share_to_project(%Share{user_id: user_id, project_name: project_name} = share)
      when is_binary(project_name) and project_name != "" and not is_nil(user_id) do
    with {:ok, project} <- find_or_create_project(user_id, project_name),
         {:ok, _share} <- update_share_project_id(share, project.id),
         {:ok, project} <- recompute_stats(project) do
      {:ok, project}
    end
  end

  def link_share_to_project(_share), do: :noop

  defp update_share_project_id(share, project_id) do
    share
    |> Ecto.Changeset.change(project_id: project_id)
    |> Repo.update()
  end
end
