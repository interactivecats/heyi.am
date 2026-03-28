defmodule HeyiAmAppWeb.DashboardLive do
  use HeyiAmAppWeb, :live_view

  alias HeyiAm.Projects
  alias HeyiAm.Shares

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user

    socket =
      socket
      |> assign(:page_title, "Dashboard")
      |> load_data(user)

    {:ok, socket}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="dashboard">
      <div class="dashboard-header">
        <h1 class="headline-lg">Dashboard</h1>
        <a
          :if={@current_scope.user.username}
          href={"#{Application.get_env(:heyi_am_app_web, :public_url)}/#{@current_scope.user.username}"}
          target="_blank"
          class="btn-tertiary"
        >
          View portfolio &rarr;
        </a>
      </div>

      <div class="stats-strip">
        <div class="stat-card">
          <span class="stat-card-label">Projects</span>
          <span class="stat-card-value stat-card-value--sm">{length(@projects)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-label">Sessions</span>
          <span class="stat-card-value stat-card-value--sm">{@total_sessions}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-label">Time</span>
          <span class="stat-card-value stat-card-value--sm">{format_duration(@total_minutes)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-label">Published</span>
          <span class="stat-card-value stat-card-value--sm">{@published_count}</span>
        </div>
      </div>

      <div :if={@projects == [] and @unassigned == []} class="dashboard-empty">
        <p class="body-md" style="color: var(--on-surface-variant);">
          No projects or sessions yet. Upload from the CLI to get started.
        </p>
        <code class="label-lg" style="color: var(--primary);">npx heyiam</code>
      </div>

      <div :for={project <- @projects} class="project-card" id={"project-#{project.id}"}>
        <div class="project-card-header">
          <div class="project-card-info">
            <h2 class="headline-sm">{project.title}</h2>
            <p :if={project.narrative} class="body-sm project-narrative">
              {String.slice(project.narrative, 0, 160)}<span :if={String.length(project.narrative || "") > 160}>...</span>
            </p>
          </div>
          <a
            :if={@current_scope.user.username && has_listed?(project) && project.rendered_html}
            href={"#{Application.get_env(:heyi_am_app_web, :public_url)}/#{@current_scope.user.username}/#{project.slug}"}
            target="_blank"
            class="btn-tertiary"
          >
            View &rarr;
          </a>
          <a
            :if={!has_listed?(project) && project.rendered_html}
            href={~p"/preview/project/#{project.slug}"}
            target="_blank"
            class="btn-tertiary"
          >
            Preview &rarr;
          </a>
        </div>

        <div class="project-card-actions">
          <button
            phx-click="delete_project"
            phx-value-project-id={project.id}
            data-confirm={"Delete \"#{project.title}\" and all its sessions? This cannot be undone."}
            class="btn-delete-project"
          >
            Delete project
          </button>
        </div>

        <div class="project-card-stats">
          <span class="label-sm">{length(project.shares)} sessions</span>
          <span :if={project.total_duration_minutes} class="label-sm">{format_duration(project.total_duration_minutes)}</span>
          <span :if={project.total_loc} class="label-sm">{format_number(project.total_loc)} loc</span>
          <span :if={project.total_files_changed} class="label-sm">{project.total_files_changed} files</span>
        </div>

        <div :if={project.skills != []} class="project-card-skills">
          <span :for={skill <- Enum.take(project.skills, 6)} class="chip">{skill}</span>
          <span :if={length(project.skills) > 6} class="chip">+{length(project.skills) - 6}</span>
        </div>

        <div :if={project.shares != []} class="project-visibility">
          <span class="label-md">Visibility</span>
          <form phx-change="update_project_status" phx-value-project-id={project.id}>
            <select name="status" class={"status-select status-select--#{project_status(project)}"}>
              <option value="draft" selected={project_status(project) == "draft"}>Private</option>
              <option value="unlisted" selected={project_status(project) == "unlisted"}>Unlisted</option>
              <option value="listed" selected={project_status(project) == "listed"}>Published</option>
            </select>
          </form>
        </div>

        <details class="project-sessions">
          <summary class="project-sessions-toggle">
            <span class="label-md">Sessions</span>
            <span class="label-sm" style="color: var(--outline);">
              {count_by_status(project.shares)}
            </span>
          </summary>
          <div class="project-sessions-list">
            <div :for={share <- project.shares} class="session-row" id={"share-#{share.id}"}>
              <div class="session-row-info">
                <span class="title-sm session-title">{share.title}</span>
                <div class="session-meta">
                  <span :if={share.duration_minutes} class="label-sm">{share.duration_minutes}m</span>
                  <span :if={share.files_changed} class="label-sm">{share.files_changed} files</span>
                  <span :if={share.loc_changed} class="label-sm">{share.loc_changed} loc</span>
                </div>
              </div>
              <div class="session-row-actions">
                <form phx-change="update_status" phx-value-share-id={share.id}>
                  <select name="status" class={"status-select status-select--#{share.status}"}>
                    <option value="draft" selected={share.status == "draft"}>Private</option>
                    <option value="unlisted" selected={share.status == "unlisted"}>Unlisted</option>
                    <option value="listed" selected={share.status == "listed"}>Published</option>
                  </select>
                </form>
                <button
                  phx-click="delete_session"
                  phx-value-share-id={share.id}
                  data-confirm="Delete this session? This cannot be undone."
                  class="btn-delete"
                  aria-label="Delete session"
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>

      <div :if={@unassigned != []} class="project-card project-card--unassigned">
        <div class="project-card-header">
          <h2 class="headline-sm" style="color: var(--on-surface-variant);">Unassigned Sessions</h2>
        </div>
        <div class="project-sessions-list">
          <div :for={share <- @unassigned} class="session-row" id={"share-#{share.id}"}>
            <div class="session-row-info">
              <span class="title-sm session-title">{share.title}</span>
              <div class="session-meta">
                <span :if={share.duration_minutes} class="label-sm">{share.duration_minutes}m</span>
                <span :if={share.files_changed} class="label-sm">{share.files_changed} files</span>
                <span :if={share.loc_changed} class="label-sm">{share.loc_changed} loc</span>
              </div>
            </div>
            <div class="session-row-actions">
              <form phx-change="update_status" phx-value-share-id={share.id}>
                <select name="status" class={"status-select status-select--#{share.status}"}>
                  <option value="draft" selected={share.status == "draft"}>Private</option>
                  <option value="unlisted" selected={share.status == "unlisted"}>Unlisted</option>
                  <option value="listed" selected={share.status == "listed"}>Published</option>
                </select>
              </form>
              <button
                phx-click="delete_session"
                phx-value-share-id={share.id}
                data-confirm="Delete this session? This cannot be undone."
                class="btn-delete"
                aria-label="Delete session"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("update_status", %{"share-id" => share_id, "status" => status}, socket) do
    user = socket.assigns.current_scope.user

    case Shares.get_user_share(user.id, share_id) do
      nil ->
        {:noreply, put_flash(socket, :error, "Session not found.")}

      share ->
        case Shares.update_share(share, %{status: status}) do
          {:ok, _share} ->
            {:noreply, load_data(socket, user)}

          {:error, _changeset} ->
            {:noreply, put_flash(socket, :error, "Could not update status.")}
        end
    end
  end

  def handle_event("update_project_status", %{"project-id" => project_id, "status" => status}, socket) do
    user = socket.assigns.current_scope.user

    case Projects.get_user_project(user.id, project_id) do
      nil ->
        {:noreply, put_flash(socket, :error, "Project not found.")}

      project ->
        project_with_shares = Projects.get_project_with_all_shares(user.id, project.slug)
        results = Enum.map(project_with_shares.shares, &Shares.update_share(&1, %{status: status}))
        failed = Enum.count(results, &match?({:error, _}, &1))

        if failed > 0 do
          {:noreply, socket |> put_flash(:error, "#{failed} session(s) failed to update.") |> load_data(user)}
        else
          {:noreply, load_data(socket, user)}
        end
    end
  end

  def handle_event("delete_project", %{"project-id" => project_id}, socket) do
    user = socket.assigns.current_scope.user

    case Projects.get_user_project(user.id, project_id) do
      nil ->
        {:noreply, put_flash(socket, :error, "Project not found.")}

      project ->
        # Delete all sessions belonging to this project first
        project_with_shares = Projects.get_project_with_all_shares(user.id, project.slug)
        Enum.each(project_with_shares.shares, &Shares.delete_share/1)

        case Projects.delete_project(project) do
          {:ok, _} ->
            {:noreply, socket |> put_flash(:info, "Project deleted.") |> load_data(user)}

          {:error, _} ->
            {:noreply, put_flash(socket, :error, "Could not delete project.")}
        end
    end
  end

  def handle_event("delete_session", %{"share-id" => share_id}, socket) do
    user = socket.assigns.current_scope.user

    case Shares.get_user_share(user.id, share_id) do
      nil ->
        {:noreply, put_flash(socket, :error, "Session not found.")}

      share ->
        case Shares.delete_share(share) do
          {:ok, _} ->
            {:noreply, socket |> put_flash(:info, "Session deleted.") |> load_data(user)}

          {:error, _} ->
            {:noreply, put_flash(socket, :error, "Could not delete session.")}
        end
    end
  end

  defp load_data(socket, user) do
    projects = Projects.list_user_projects_with_all_shares(user.id)
    unassigned = Shares.list_unassigned_shares_for_user(user.id)

    all_shares = Enum.flat_map(projects, & &1.shares) ++ unassigned

    socket
    |> assign(:projects, projects)
    |> assign(:unassigned, unassigned)
    |> assign(:total_sessions, length(all_shares))
    |> assign(:total_minutes, all_shares |> Enum.map(& (&1.duration_minutes || 0)) |> Enum.sum())
    |> assign(:published_count, Enum.count(all_shares, &(&1.status == "listed")))
  end

  defp format_duration(nil), do: "0m"
  defp format_duration(minutes) when minutes < 60, do: "#{minutes}m"
  defp format_duration(minutes), do: "#{div(minutes, 60)}h"

  defp format_number(n) when n >= 1000, do: "#{Float.round(n / 1000, 1)}k"
  defp format_number(n), do: "#{n}"

  defp project_status(project) do
    statuses = Enum.map(project.shares, & &1.status) |> Enum.uniq()

    cond do
      statuses == ["listed"] -> "listed"
      statuses == ["draft"] -> "draft"
      statuses == ["unlisted"] -> "unlisted"
      "listed" in statuses -> "listed"
      "unlisted" in statuses -> "unlisted"
      true -> "draft"
    end
  end

  defp has_listed?(project) do
    Enum.any?(project.shares, &(&1.status == "listed"))
  end

  defp count_by_status(shares) do
    listed = Enum.count(shares, &(&1.status == "listed"))
    draft = Enum.count(shares, &(&1.status == "draft"))
    unlisted = Enum.count(shares, &(&1.status == "unlisted"))

    parts =
      [
        if(listed > 0, do: "#{listed} published"),
        if(unlisted > 0, do: "#{unlisted} unlisted"),
        if(draft > 0, do: "#{draft} private")
      ]
      |> Enum.reject(&is_nil/1)

    Enum.join(parts, ", ")
  end
end
