defmodule HeyiAmWeb.ProjectEditorLive do
  use HeyiAmWeb, :live_view

  import HeyiAmWeb.AppShell

  alias HeyiAm.Shares
  alias HeyiAm.Projects

  @impl true
  def mount(%{"slug" => slug}, _session, socket) do
    user = socket.assigns.current_scope.user
    db_project = Projects.get_project_with_published_shares(user.id, slug)

    shares = if db_project, do: db_project.shares, else: []

    all_skills =
      shares
      |> Enum.flat_map(& &1.skills)
      |> Enum.uniq()
      |> Enum.map(&String.upcase/1)

    sessions =
      Enum.map(shares, fn share ->
        %{
          id: share.id,
          title: share.title || "Untitled",
          status: if(share.sealed, do: :sealed, else: :published),
          visibility: :public,
          featured: false
        }
      end)

    project = %{
      slug: slug,
      name: (db_project && db_project.title) || unslugify(slug) || "Unnamed Project",
      version: "",
      take: (db_project && db_project.narrative) || Enum.find_value(shares, "", fn s -> s.dev_take end),
      tags: all_skills,
      github_synced: false,
      sessions: sessions
    }

    active_count = Enum.count(project.sessions, &(&1.status != :archived))
    archived_count = Enum.count(project.sessions, &(&1.status == :archived))

    {:ok,
     socket
     |> assign(:page_title, "Edit #{project.name}")
     |> assign(:project, project)
     |> assign(:active_count, active_count)
     |> assign(:archived_count, archived_count)}
  end

  defp unslugify(slug) do
    slug
    |> String.split("-")
    |> Enum.map_join(" ", &String.capitalize/1)
  end

  @impl true
  def handle_event("update_title", %{"value" => title}, socket) do
    project = %{socket.assigns.project | name: title}
    {:noreply, assign(socket, :project, project)}
  end

  def handle_event("update_take", %{"value" => take}, socket) do
    project = %{socket.assigns.project | take: take}
    {:noreply, assign(socket, :project, project)}
  end

  def handle_event("remove_tag", %{"tag" => tag}, socket) do
    project = %{socket.assigns.project | tags: Enum.reject(socket.assigns.project.tags, &(&1 == tag))}
    {:noreply, assign(socket, :project, project)}
  end

  def handle_event("add_tag", %{"tag" => tag}, socket) do
    tag = tag |> String.trim() |> String.upcase()

    if tag != "" and tag not in socket.assigns.project.tags do
      project = %{socket.assigns.project | tags: socket.assigns.project.tags ++ [tag]}
      {:noreply, assign(socket, :project, project)}
    else
      {:noreply, socket}
    end
  end

  def handle_event("toggle_visibility", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)
    session = Enum.find(socket.assigns.project.sessions, &(&1.id == id))

    if session do
      new_vis = if session.visibility == :public, do: :private, else: :public
      sessions = Enum.map(socket.assigns.project.sessions, fn s ->
        if s.id == id, do: %{s | visibility: new_vis}, else: s
      end)
      project = %{socket.assigns.project | sessions: sessions}
      {:noreply, assign(socket, :project, project)}
    else
      {:noreply, socket}
    end
  end

  def handle_event("toggle_star", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)

    sessions =
      Enum.map(socket.assigns.project.sessions, fn session ->
        if session.id == id do
          %{session | featured: !session.featured}
        else
          session
        end
      end)

    project = %{socket.assigns.project | sessions: sessions}
    {:noreply, assign(socket, :project, project)}
  end

  def handle_event("reorder", %{"ids" => ids}, socket) do
    session_map = Map.new(socket.assigns.project.sessions, &{to_string(&1.id), &1})
    reordered = Enum.map(ids, &Map.fetch!(session_map, &1))
    project = %{socket.assigns.project | sessions: reordered}
    {:noreply, assign(socket, :project, project)}
  end

  def handle_event("update_form", _params, socket) do
    {:noreply, socket}
  end

  def handle_event("save", _params, socket) do
    user = socket.assigns.current_scope.user
    project = socket.assigns.project

    shares = Shares.list_shares_for_user_project(user.id, project.name)

    results =
      Enum.map(shares, fn share ->
        Shares.update_share(share, %{
          dev_take: project.take,
          skills: Enum.map(project.tags, &String.downcase/1),
          project_name: project.name
        })
      end)

    case Enum.find(results, fn {status, _} -> status == :error end) do
      nil ->
        {:noreply, put_flash(socket, :info, "Changes saved")}

      {:error, changeset} ->
        require Logger
        Logger.error("Failed to save project: #{inspect(changeset.errors)}")
        {:noreply, put_flash(socket, :error, "Failed to save changes")}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <.editor_shell logo_text="Workbench" current_page="Editor">
      <:nav_item href="#" label="Portfolio" />
      <:nav_item href="#" label="Editor" />
      <:nav_item href="#" label="Insights" />
      <:actions>
        <button class="btn btn-secondary btn-sm">View Public Version</button>
        <button class="btn btn-primary btn-sm" phx-click="save">Save Changes</button>
      </:actions>
      <:sidebar>
        <div class="sidebar-header">
          <div class="sidebar-header-icon">P</div>
          <div>
            <div class="sidebar-header-title">{@project.name}</div>
            <div class="sidebar-header-subtitle">{@project.version}</div>
          </div>
        </div>
        <ul class="sidebar-nav">
          <li><a href="#" class="sidebar-nav-link active">Projects</a></li>
          <li><a href="#" class="sidebar-nav-link">Deployments</a></li>
          <li><a href="#" class="sidebar-nav-link">Metrics</a></li>
          <li><a href="#" class="sidebar-nav-link">Access Control</a></li>
          <li><a href="#" class="sidebar-nav-link">Settings</a></li>
        </ul>
        <div class="sidebar-footer">
          <a href="#" class="sidebar-nav-link">Documentation</a>
          <a href="#" class="sidebar-nav-link">Support</a>
        </div>
      </:sidebar>

      <div class="project-editor__breadcrumb">
        <span>Projects</span>
        <span class="project-editor__breadcrumb-sep">/</span>
        <span class="project-editor__breadcrumb-current">{@project.name}</span>
        <span class="project-editor__breadcrumb-sep">/</span>
        <span class="project-editor__breadcrumb-active">Editor</span>
      </div>

      <div class="project-editor">
        <%!-- Left Pane: Project Definition --%>
        <section class="project-editor__definition">
          <div style="max-width: 28rem;">
            <header style="margin-block-end: var(--spacing-10);">
              <span class="chip chip--primary" style="margin-block-end: var(--spacing-2); display: inline-block;">Configuration</span>
              <h1 class="headline-lg">Project Definition</h1>
            </header>

            <form class="project-editor__form" phx-change="update_form">
              <div class="stack stack--sm">
                <label class="label-sm">Project Title</label>
                <input
                  type="text"
                  class="project-editor__input project-editor__input--title"
                  value={@project.name}
                  phx-blur="update_title"
                />
              </div>

              <div class="stack stack--sm">
                <label class="label-sm">Technical Take</label>
                <textarea
                  class="project-editor__input"
                  rows="4"
                  phx-blur="update_take"
                >{@project.take}</textarea>
              </div>

              <div class="stack stack--sm">
                <label class="label-sm">Taxonomy / Tags</label>
                <div class="project-editor__tags">
                  <span :for={tag <- @project.tags} class="project-editor__tag">
                    {tag}
                    <button type="button" phx-click="remove_tag" phx-value-tag={tag} aria-label={"Remove #{tag}"}>
                      &times;
                    </button>
                  </span>
                  <form phx-submit="add_tag" class="project-editor__tag-form">
                    <input
                      type="text"
                      name="tag"
                      placeholder="Add tag..."
                      class="project-editor__tag-input"
                      autocomplete="off"
                      phx-mounted={Phoenix.LiveView.JS.focus()}
                    />
                  </form>
                </div>
              </div>

              <div :if={@project.github_synced} class="project-editor__repo-status">
                <div>
                  <p class="title-sm">Repository Mirroring</p>
                  <p class="label-sm" style="color: var(--outline);">Synchronized with GitHub</p>
                </div>
                <span style="color: var(--primary); font-size: 1.25rem;">&#10003;</span>
              </div>
            </form>
          </div>
        </section>

        <%!-- Right Pane: Session Management --%>
        <section class="project-editor__sessions">
          <header style="display: flex; justify-content: space-between; align-items: flex-end; margin-block-end: var(--spacing-8);">
            <div>
              <span class="label-sm" style="color: var(--on-surface-variant);">Workstream</span>
              <h2 class="headline-md">Session Management</h2>
            </div>
            <div style="display: flex; gap: var(--spacing-4);">
              <span class="label-sm">{@active_count} Active</span>
              <span class="label-sm">{@archived_count} Archived</span>
            </div>
          </header>

          <div class="stack stack--md" id="session-sortable" phx-hook="Sortable">
            <div
              :for={session <- @project.sessions}
              class={session_card_classes(session)}
              data-session-id={session.id}
              data-sort-id={session.id}
              draggable="true"
            >
              <div class="project-editor__session-drag drag-handle">&#x2630;</div>
              <div class="project-editor__session-content">
                <div class="project-editor__session-identity">
                  <p class="label-sm" style="color: var(--primary);">SESSION_ID: {session.id}</p>
                  <h3 class={["title-sm", session.status == :draft && "project-editor__session-title--draft"]}>
                    {session.title}
                  </h3>
                </div>
                <div class="project-editor__session-status">
                  {status_indicator(session)}
                </div>
                <div class="project-editor__session-actions">
                  <button
                    type="button"
                    class={["project-editor__visibility-btn", session.featured && "project-editor__visibility-btn--featured"]}
                    phx-click="toggle_visibility"
                    phx-value-id={session.id}
                  >
                    {if session.visibility == :public, do: "Public", else: "Private"}
                  </button>
                  <button
                    type="button"
                    class={["project-editor__star-btn", session.featured && "project-editor__star-btn--active"]}
                    phx-click="toggle_star"
                    phx-value-id={session.id}
                  >
                    {if session.featured, do: raw("&#9733;"), else: raw("&#9734;")}
                  </button>
                  <button type="button" class="project-editor__more-btn">&#8942;</button>
                </div>
              </div>
            </div>
          </div>

          <div class="project-editor__empty-state">
            <h4 class="title-sm" style="color: var(--on-surface-variant);">Ready for a new exploration?</h4>
            <p class="body-sm" style="color: var(--outline); max-width: 20rem; margin-block-start: var(--spacing-2);">
              Link an external GitHub Gist or start a fresh session locally to document your progress.
            </p>
          </div>
        </section>
      </div>
    </.editor_shell>
    """
  end

  defp session_card_classes(session) do
    base = "project-editor__session-card"

    classes = [base]

    classes =
      if session.featured,
        do: classes ++ ["project-editor__session-card--featured"],
        else: classes

    classes =
      if session.status == :draft,
        do: classes ++ ["project-editor__session-card--draft"],
        else: classes

    classes
  end

  defp status_indicator(%{status: :sealed} = _session) do
    assigns = %{}

    ~H"""
    <span class="badge badge--sealed">Sealed</span>
    """
  end

  defp status_indicator(%{featured: true} = _session) do
    assigns = %{}

    ~H"""
    <span class="badge badge--public">Featured</span>
    """
  end

  defp status_indicator(%{status: :draft} = _session) do
    assigns = %{}

    ~H"""
    <span class="badge badge--draft">Draft</span>
    """
  end

  defp status_indicator(_session) do
    assigns = %{}

    ~H"""
    <span class="badge badge--public">Published</span>
    """
  end
end
