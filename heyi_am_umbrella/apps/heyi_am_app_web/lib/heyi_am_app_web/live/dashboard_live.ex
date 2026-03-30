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
          href={"#{public_url()}/#{@current_scope.user.username}"}
          target="_blank"
          class="btn-tertiary"
        >
          View portfolio &rarr;
        </a>
      </div>

      <div :if={@projects == [] and @unassigned == []} class="dashboard-empty">
        <p class="body-md" style="color: var(--on-surface-variant);">
          No projects yet. Upload from the CLI to get started.
        </p>
        <code class="label-lg" style="color: var(--primary);">npx heyiam</code>
      </div>

      <div :for={project <- @projects} class="project-card" id={"project-#{project.id}"}>
        <div class="project-card-top">
          <div class="project-card-info">
            <h2 class="title-lg">{project.title}</h2>
            <p :if={project.narrative} class="body-sm project-narrative">
              {String.slice(project.narrative, 0, 120)}<span :if={String.length(project.narrative || "") > 120}>...</span>
            </p>
          </div>

          <div :if={project.shares != [] and project_status(project) != "archived"} class="project-visibility-control">
            <form phx-change="update_project_status" phx-value-project-id={project.id}>
              <div class="segmented-control">
                <label class={"segmented-control-option #{if project_status(project) == "draft", do: "segmented-control-option--active segmented-control-option--draft"}"}>
                  <input type="radio" name="status" value="draft" checked={project_status(project) == "draft"} />
                  Private
                </label>
                <label class={"segmented-control-option #{if project_status(project) == "unlisted", do: "segmented-control-option--active segmented-control-option--unlisted"}"}>
                  <input type="radio" name="status" value="unlisted" checked={project_status(project) == "unlisted"} />
                  Unlisted
                </label>
                <label class={"segmented-control-option #{if project_status(project) == "listed", do: "segmented-control-option--active segmented-control-option--listed"}"}>
                  <input type="radio" name="status" value="listed" checked={project_status(project) == "listed"} />
                  Published
                </label>
              </div>
            </form>
          </div>
        </div>

        <div :if={project_status(project) == "unlisted" && project.unlisted_token} class="project-url-bar project-url-bar--unlisted">
          <div class="project-url-bar-label">
            <span class="label-sm">Unlisted</span>
            <span class="label-sm project-url-bar-hint">Only people with the link can see this</span>
          </div>
          <div class="project-url-bar-row">
            <code class="label-sm project-url-text">{"#{public_url()}/p/#{project.unlisted_token}"}</code>
            <a
              id={"copy-project-#{project.id}"}
              phx-hook="CopyLink"
              data-url={"#{public_url()}/p/#{project.unlisted_token}"}
              href="#"
              class="btn-copy-link"
            >
              Copy
            </a>
          </div>
        </div>

        <div :if={project_status(project) == "listed" && @current_scope.user.username} class="project-url-bar project-url-bar--listed">
          <div class="project-url-bar-label">
            <span class="label-sm">Published</span>
            <span class="label-sm project-url-bar-hint">Visible on your portfolio</span>
          </div>
          <div class="project-url-bar-row">
            <code class="label-sm project-url-text">{"#{public_url()}/#{@current_scope.user.username}/#{project.slug}"}</code>
            <a
              href={"#{public_url()}/#{@current_scope.user.username}/#{project.slug}"}
              target="_blank"
              class="btn-copy-link"
            >
              Open
            </a>
          </div>
        </div>

        <div class="project-card-meta">
          <span class="label-sm">{project.total_sessions || length(project.shares)} sessions</span>
          <span :if={project.total_duration_minutes} class="label-sm">{format_duration(project.total_duration_minutes)}</span>
          <span :if={project.total_loc} class="label-sm">{format_number(project.total_loc)} lines</span>
        </div>

        <div :if={project.skills != []} class="project-card-skills">
          <span :for={skill <- Enum.take(project.skills, 5)} class="chip">{skill}</span>
          <span :if={length(project.skills) > 5} class="chip chip--more">+{length(project.skills) - 5}</span>
        </div>

        <details class="project-sessions" open>
          <summary class="project-sessions-toggle">
            <span class="label-md">Sessions</span>
            <span class="label-sm" style="color: var(--outline);">
              {length(project.shares)} uploaded
            </span>
          </summary>
          <div class="project-sessions-list">
            <div :for={share <- project.shares} class="session-row" id={"share-#{share.id}"}>
              <div class="session-row-main">
                <.session_title_link share={share} username={@current_scope.user.username} project_status={project_status(project)} />
              </div>
              <div class="session-meta">
                <span :if={share.duration_minutes}>{share.duration_minutes}m</span>
                <span :if={share.files_changed}>{share.files_changed} files</span>
                <span :if={share.loc_changed}>{format_number(share.loc_changed)} lines</span>
              </div>
            </div>
          </div>
        </details>
      </div>

      <div :if={@unassigned != []} class="project-card project-card--unassigned">
        <div class="project-card-top">
          <h2 class="title-lg" style="color: var(--on-surface-variant);">Unassigned Sessions</h2>
          <span class="label-sm" style="color: var(--outline);">{length(@unassigned)} sessions not linked to a project</span>
        </div>
        <div class="project-sessions-list">
          <div :for={share <- @unassigned} class="session-row" id={"share-#{share.id}"}>
            <div class="session-row-main">
              <span class="title-sm session-title">{share.title}</span>
            </div>
            <div class="session-meta">
              <span :if={share.duration_minutes}>{share.duration_minutes}m</span>
              <span :if={share.files_changed}>{share.files_changed} files</span>
              <span :if={share.loc_changed}>{format_number(share.loc_changed)} lines</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  attr :share, :map, required: true
  attr :username, :string, required: true
  attr :project_status, :string, required: true

  defp session_title_link(assigns) do
    ~H"""
    <%= cond do %>
      <% @project_status in ["listed", "unlisted"] && @share.token -> %>
        <a href={"#{public_url()}/s/#{@share.token}"} target="_blank" class="title-sm session-title session-title--link">
          {@share.title}
        </a>
      <% @share.rendered_html -> %>
        <a href={~p"/preview/session/#{@share.id}"} target="_blank" class="title-sm session-title session-title--link">
          {@share.title}
        </a>
      <% true -> %>
        <span class="title-sm session-title">{@share.title}</span>
    <% end %>
    """
  end

  @impl true
  def handle_event("update_project_status", %{"project-id" => project_id, "status" => status}, socket)
      when status in ["draft", "unlisted", "listed"] do
    user = socket.assigns.current_scope.user

    case Projects.get_user_project(user.id, project_id) do
      nil ->
        {:noreply, put_flash(socket, :error, "Project not found.")}

      project ->
        project_with_shares = Projects.get_project_with_all_shares(user.id, project.slug)
        active_shares = Enum.reject(project_with_shares.shares, &(&1.status == "archived"))
        results = Enum.map(active_shares, &Shares.update_share(&1, %{status: status}))
        failed = Enum.count(results, &match?({:error, _}, &1))

        if failed > 0 do
          {:noreply, socket |> put_flash(:error, "#{failed} session(s) failed to update.") |> load_data(user)}
        else
          {:noreply, load_data(socket, user)}
        end
    end
  end

  defp load_data(socket, user) do
    projects = Projects.list_user_projects_with_all_shares(user.id)
    unassigned = Shares.list_unassigned_shares_for_user(user.id)

    all_shares = Enum.flat_map(projects, & &1.shares) ++ unassigned

    # Use project-level totals (from CLI) when available, fall back to share counts
    total_sessions =
      projects
      |> Enum.map(fn p -> p.total_sessions || length(p.shares) end)
      |> Enum.sum()
      |> Kernel.+(length(unassigned))

    total_minutes =
      projects
      |> Enum.map(fn p -> p.total_duration_minutes || Enum.sum(Enum.map(p.shares, &(&1.duration_minutes || 0))) end)
      |> Enum.sum()
      |> Kernel.+(unassigned |> Enum.map(&(&1.duration_minutes || 0)) |> Enum.sum())

    socket
    |> assign(:projects, projects)
    |> assign(:unassigned, unassigned)
    |> assign(:total_sessions, total_sessions)
    |> assign(:total_minutes, total_minutes)
    |> assign(:published_count, Enum.count(all_shares, &(&1.status == "listed")))
  end

  defp public_url, do: Application.get_env(:heyi_am_app_web, :public_url)

  defp format_duration(nil), do: "0m"
  defp format_duration(minutes) when minutes < 60, do: "#{minutes}m"
  defp format_duration(minutes), do: "#{div(minutes, 60)}h"

  defp format_number(n) when n >= 1000, do: "#{Float.round(n / 1000, 1)}k"
  defp format_number(n), do: "#{n}"

  defp project_status(project) do
    statuses =
      project.shares
      |> Enum.reject(&(&1.status == "archived"))
      |> Enum.map(& &1.status)
      |> Enum.uniq()

    cond do
      statuses == [] -> "archived"
      statuses == ["listed"] -> "listed"
      statuses == ["draft"] -> "draft"
      statuses == ["unlisted"] -> "unlisted"
      "listed" in statuses -> "listed"
      "unlisted" in statuses -> "unlisted"
      true -> "draft"
    end
  end

end
