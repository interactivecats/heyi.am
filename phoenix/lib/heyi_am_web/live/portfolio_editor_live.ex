defmodule HeyiAmWeb.PortfolioEditorLive do
  use HeyiAmWeb, :live_view

  import HeyiAmWeb.AppShell

  alias HeyiAm.Shares
  alias HeyiAm.Accounts
  alias HeyiAm.Projects

  @accent_colors [
    %{id: "seal-blue", label: "Seal Blue", hex: "#084471"},
    %{id: "violet", label: "Violet", hex: "#7C5CFC"},
    %{id: "rose", label: "Rose", hex: "#E05297"},
    %{id: "teal", label: "Teal", hex: "#0D9488"},
    %{id: "amber", label: "Amber", hex: "#D97706"},
    %{id: "sky", label: "Sky", hex: "#0284C7"}
  ]

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user

    profile = %{
      name: user.display_name || user.username || "Unnamed",
      bio: user.bio || "",
      location: user.location || "",
      status: user.status || ""
    }

    raw_projects = Projects.list_user_projects_with_published_shares(user.id)

    projects =
      Enum.map(raw_projects, fn p ->
        first_share = List.first(p.shares)

        %{
          id: p.slug,
          slug: p.slug,
          name: p.title,
          description: (first_share && first_share.dev_take) || "",
          category: "project",
          skills: p.skills || [],
          visible: true,
          sessions:
            Enum.map(p.shares, fn s ->
              %{
                id: s.id,
                title: s.title || "Untitled",
                status: if(s.sealed, do: :sealed, else: :published),
                visibility: :public,
                featured: false
              }
            end)
        }
      end)

    shares = if raw_projects == [], do: Shares.list_shares_for_user(user.id), else: Enum.flat_map(raw_projects, & &1.shares)
    expertise = compute_expertise(shares)

    {:ok,
     socket
     |> assign(:page_title, "Portfolio Editor")
     |> assign(:accent_colors, @accent_colors)
     |> assign(:selected_accent, user.portfolio_accent || "seal-blue")
     |> assign(:visitor_mode, false)
     |> assign(:profile, profile)
     |> assign(:projects, projects)
     |> assign(:expertise, expertise)
     |> assign(:expanded_project, nil)}
  end

  @impl true
  def handle_event("select_accent", %{"accent" => accent_id}, socket) do
    user = socket.assigns.current_scope.user
    Accounts.update_user_profile(user, %{portfolio_accent: accent_id})
    {:noreply, assign(socket, :selected_accent, accent_id)}
  end

  def handle_event("toggle_visitor_mode", _params, socket) do
    {:noreply, assign(socket, :visitor_mode, !socket.assigns.visitor_mode)}
  end

  @allowed_profile_fields ~w(name bio)

  def handle_event("update_profile", %{"field" => field, "value" => value}, socket)
      when field in @allowed_profile_fields do
    profile = Map.put(socket.assigns.profile, String.to_existing_atom(field), value)
    user = socket.assigns.current_scope.user

    db_field = if field == "name", do: :display_name, else: String.to_existing_atom(field)
    Accounts.update_user_profile(user, %{db_field => value})

    {:noreply, assign(socket, :profile, profile)}
  end

  def handle_event("update_profile", _params, socket) do
    {:noreply, socket}
  end

  def handle_event("toggle_project_visibility", %{"id" => id}, socket) do
    projects =
      Enum.map(socket.assigns.projects, fn project ->
        if project.id == id do
          new_visible = !project.visible
          %{project | visible: new_visible}
        else
          project
        end
      end)

    {:noreply, assign(socket, :projects, projects)}
  end

  def handle_event("toggle_project", %{"id" => id}, socket) do
    current = socket.assigns.expanded_project
    {:noreply, assign(socket, :expanded_project, if(current == id, do: nil, else: id))}
  end

  def handle_event("toggle_session_visibility", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)

    projects =
      Enum.map(socket.assigns.projects, fn project ->
        sessions =
          Enum.map(project.sessions, fn session ->
            if session.id == id do
              new_vis = if session.visibility == :public, do: :private, else: :public
              %{session | visibility: new_vis}
            else
              session
            end
          end)

        %{project | sessions: sessions}
      end)

    {:noreply, assign(socket, :projects, projects)}
  end

  def handle_event("reorder", %{"ids" => ids}, socket) do
    expanded_id = socket.assigns.expanded_project

    if is_nil(expanded_id) do
      {:noreply, socket}
    else
      projects =
        Enum.map(socket.assigns.projects, fn project ->
          if project.id == expanded_id do
            session_map = Map.new(project.sessions, &{to_string(&1.id), &1})

            reordered =
              ids
              |> Enum.map(&Map.get(session_map, &1))
              |> Enum.reject(&is_nil/1)

            %{project | sessions: reordered}
          else
            project
          end
        end)

      {:noreply, assign(socket, :projects, projects)}
    end
  end

  def handle_event("toggle_session_featured", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)

    projects =
      Enum.map(socket.assigns.projects, fn project ->
        sessions =
          Enum.map(project.sessions, fn session ->
            if session.id == id do
              %{session | featured: !session.featured}
            else
              session
            end
          end)

        %{project | sessions: sessions}
      end)

    {:noreply, assign(socket, :projects, projects)}
  end

  defp compute_expertise(shares) do
    skill_counts =
      shares
      |> Enum.flat_map(& &1.skills)
      |> Enum.frequencies()

    max_count = skill_counts |> Map.values() |> Enum.max(fn -> 1 end)

    skill_counts
    |> Enum.sort_by(fn {_skill, count} -> -count end)
    |> Enum.take(8)
    |> Enum.map(fn {skill, count} ->
      %{
        label: String.upcase(skill),
        techs: skill,
        level: round(count / max_count * 100)
      }
    end)
  end

  defp accent_hex(accent_id) do
    case Enum.find(@accent_colors, fn c -> c.id == accent_id end) do
      %{hex: hex} -> hex
      _ -> "#084471"
    end
  end

  defp project_category_index(projects, project) do
    idx = Enum.find_index(projects, fn p -> p.id == project.id end) || 0
    String.pad_leading(Integer.to_string(idx + 1), 2, "0")
  end

  defp grid_span(index) do
    case rem(index, 3) do
      0 -> "pe-card--wide"
      1 -> "pe-card--narrow"
      2 -> "pe-card--full"
    end
  end

  defp status_badge_class(:sealed), do: "badge badge--sealed"
  defp status_badge_class(:published), do: "badge badge--public"
  defp status_badge_class(:draft), do: "badge badge--draft"
  defp status_badge_class(_), do: "badge"

  defp status_label(:sealed), do: "Sealed"
  defp status_label(:published), do: "Published"
  defp status_label(:draft), do: "Draft"
  defp status_label(_), do: "Unknown"

  @impl true
  def render(assigns) do
    ~H"""
    <.editor_shell logo_text="Workbench" current_page="Portfolio">
      <:nav_item href="#" label="Drafts" />
      <:nav_item href="#" label="Sessions" />
      <:nav_item href="#" label="Portfolio" />
      <:actions>
        <button class="btn btn-secondary btn-sm">Seal</button>
        <button class="btn btn-primary btn-sm">Save & Deploy</button>
      </:actions>
      <:sidebar>
        <div class="sidebar-header">
          <div class="sidebar-header-icon">P</div>
          <div>
            <div class="sidebar-header-title">{@profile.name}</div>
            <div class="sidebar-header-subtitle">Portfolio Editor</div>
          </div>
        </div>
        <ul class="sidebar-nav">
          <li :for={project <- @projects}>
            <a href={"#project-#{project.slug}"} class="sidebar-nav-link">
              <span class="sidebar-nav-dot"></span>
              {project.name}
            </a>
          </li>
        </ul>
      </:sidebar>

      <div class="pe-canvas" style={"--accent: #{accent_hex(@selected_accent)}"}>
        <div class="pe-content">
          <%!-- Hero Section --%>
          <section class="pe-hero">
            <div class="pe-hero-meta">
              <span class="label-sm" style="color: var(--accent); opacity: 0.6;">ID: USER_082</span>
              <div class="pe-hero-rule"></div>
            </div>
            <%= if @visitor_mode do %>
              <h1 class="display-lg">{@profile.name}</h1>
              <p class="body-lg pe-hero-bio">{@profile.bio}</p>
            <% else %>
              <input
                type="text"
                class="display-lg pe-inline-input"
                name="name"
                value={@profile.name}
                phx-blur="update_profile"
                phx-value-field="name"
              />
              <textarea
                class="body-lg pe-hero-bio pe-inline-input"
                name="bio"
                rows="2"
                phx-blur="update_profile"
                phx-value-field="bio"
              >{@profile.bio}</textarea>
            <% end %>
            <div class="pe-hero-badges">
              <div class="pe-location-badge label-sm">LOC: {@profile.location}</div>
              <div class="pe-status-badge label-sm">STATUS: {@profile.status}</div>
            </div>
          </section>

          <%!-- Projects Grid --%>
          <section class="pe-projects">
            <div class="pe-section-header">
              <h2 class="label-md" style="letter-spacing: 0.12em;">Deployed Projects</h2>
            </div>
            <div class="pe-bento-grid">
              <div
                :for={{project, idx} <- Enum.with_index(@projects)}
                id={"project-#{project.slug}"}
                class={["pe-project-card", grid_span(idx), !project.visible && "pe-card--hidden"]}
              >
                <div :if={!@visitor_mode} class="pe-card-controls">
                  <button
                    class="pe-control-btn"
                    phx-click="toggle_project_visibility"
                    phx-value-id={project.id}
                    aria-label={if(project.visible, do: "Hide project", else: "Show project")}
                  >
                    {if project.visible, do: "visibility", else: "visibility_off"}
                  </button>
                  <button class="pe-control-btn drag-handle" aria-label="Drag to reorder">
                    drag_indicator
                  </button>
                </div>

                <span class="label-sm" style="color: var(--accent);">
                  {project_category_index(@projects, project)} / {project.category}
                </span>
                <h3
                  class="headline-md pe-project-title"
                  contenteditable={if(!@visitor_mode, do: "true")}
                >
                  {project.name}
                </h3>
                <p
                  class="body-sm pe-project-desc"
                  contenteditable={if(!@visitor_mode, do: "true")}
                >
                  {project.description}
                </p>
                <div class="pe-skill-tags">
                  <span :for={skill <- project.skills} class="chip">{String.upcase(skill)}</span>
                </div>

                <%!-- Expand/collapse for sessions --%>
                <button
                  class="pe-expand-btn"
                  phx-click="toggle_project"
                  phx-value-id={project.id}
                  aria-expanded={@expanded_project == project.id}
                  aria-label={"Toggle sessions for #{project.name}"}
                >
                  <span class="label-sm">
                    {length(project.sessions)} sessions
                  </span>
                  <span class="pe-chevron">{if @expanded_project == project.id, do: "expand_less", else: "expand_more"}</span>
                </button>

                <%!-- Session list (expanded) --%>
                <div :if={@expanded_project == project.id} class="pe-session-list" id={"session-sortable-#{project.id}"} phx-hook="Sortable">
                  <%= if project.sessions == [] do %>
                    <div class="pe-empty-sessions">
                      <p class="body-sm" style="color: var(--outline);">Ready for a new exploration?</p>
                    </div>
                  <% else %>
                    <div
                      :for={session <- project.sessions}
                      class={[
                        "pe-session-row",
                        session.featured && "pe-session-row--featured",
                        session.status == :draft && "pe-session-row--draft"
                      ]}
                      data-sort-id={session.id}
                      draggable="true"
                    >
                      <span :if={!@visitor_mode} class="pe-control-btn drag-handle" style="font-size: 0.75rem;">
                        drag_indicator
                      </span>
                      <span class="body-sm pe-session-title">{session.title}</span>
                      <span class={status_badge_class(session.status)}>{status_label(session.status)}</span>
                      <span :if={session.featured} class="badge badge--sealed">Featured</span>
                      <div :if={!@visitor_mode} class="pe-session-actions">
                        <button
                          class="pe-control-btn"
                          phx-click="toggle_session_visibility"
                          phx-value-id={session.id}
                          aria-label={if(session.visibility == :public, do: "Make private", else: "Make public")}
                        >
                          {if session.visibility == :public, do: "Public", else: "Private"}
                        </button>
                        <button
                          class="pe-control-btn"
                          phx-click="toggle_session_featured"
                          phx-value-id={session.id}
                          aria-label={if(session.featured, do: "Unfeature", else: "Feature")}
                        >
                          {if session.featured, do: "star", else: "star_border"}
                        </button>
                      </div>
                    </div>
                  <% end %>
                </div>
              </div>
            </div>
          </section>

          <%!-- Expertise Ledger --%>
          <section class="pe-expertise">
            <div class="pe-expertise-grid">
              <div class="pe-expertise-header">
                <h2 class="label-md" style="color: var(--accent); letter-spacing: 0.12em;">Expertise Ledger</h2>
                <p class="body-sm" style="color: var(--on-surface-variant); font-style: italic;">
                  Quantifiable proficiency levels based on production cycle involvement.
                </p>
              </div>
              <div class="pe-expertise-bars">
                <div :for={skill <- @expertise} class="pe-skill-row">
                  <span class="label-sm pe-skill-label">{skill.label}</span>
                  <div class="pe-skill-rule"></div>
                  <span class="label-sm pe-skill-techs">{skill.techs}</span>
                  <div class="progress-bar" style="width: 8rem;">
                    <div class="progress-bar-fill" style={"width: #{skill.level}%; background-color: var(--accent);"}></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <%!-- Floating Bottom Dock --%>
        <div class="pe-dock glass-bar">
          <div class="pe-dock-section">
            <span class="label-sm">Accent</span>
            <div class="pe-dock-accents">
              <button
                :for={color <- @accent_colors}
                class={["pe-accent-dot", @selected_accent == color.id && "pe-accent-dot--active"]}
                style={"background-color: #{color.hex}; color: #{color.hex};"}
                phx-click="select_accent"
                phx-value-accent={color.id}
                aria-label={"Select #{color.label} accent"}
              >
              </button>
            </div>
          </div>

          <div class="pe-dock-divider"></div>

          <div class="pe-dock-section pe-dock-toggle">
            <span class="body-sm" style="font-weight: 500;">View as Visitor</span>
            <button
              class={["pe-toggle", @visitor_mode && "pe-toggle--active"]}
              phx-click="toggle_visitor_mode"
              role="switch"
              aria-checked={to_string(@visitor_mode)}
              aria-label="Toggle visitor mode"
            >
              <span class="pe-toggle-thumb"></span>
            </button>
          </div>
        </div>
      </div>
    </.editor_shell>
    """
  end
end
