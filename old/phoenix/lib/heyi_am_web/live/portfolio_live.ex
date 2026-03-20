defmodule HeyiAmWeb.PortfolioLive do
  use HeyiAmWeb, :live_view

  alias HeyiAm.Accounts
  alias HeyiAm.Projects
  alias HeyiAm.Portfolios
  alias HeyiAm.Shares
  alias HeyiAmWeb.PortfolioComponents
  import HeyiAmWeb.PortfolioComponents

  require Logger

  @templates [
    {"editorial", "Editorial"},
    {"minimal", "Minimal"},
    {"terminal", "Terminal"},
    {"brutalist", "Brutalist"},
    {"campfire", "Campfire"},
    {"neon", "Neon Night"}
  ]

  @impl true
  def mount(%{"username" => username}, _session, socket) do
    user = Accounts.get_user_by_username(username)
    current_user = socket.assigns[:current_scope] && socket.assigns.current_scope.user

    if is_nil(user) || is_nil(current_user) || user.id != current_user.id do
      {:ok, socket |> put_flash(:error, "Not authorized") |> redirect(to: "/")}
    else
      {:ok,
       socket
       |> assign(:user, user)
       |> assign(:share_count, Shares.count_user_shares(user.id))
       |> assign(:page_title, "Edit Portfolio")
       |> assign(:templates, @templates)
       |> assign(:expanded_projects, MapSet.new())
       |> assign(:vibe_picker_open, false)
       |> load_projects()}
    end
  end

  defp load_projects(socket) do
    user_id = socket.assigns.user.id
    projects = Projects.get_user_projects(user_id)

    project_shares =
      PortfolioComponents.build_portfolio_projects(projects,
        editing: true,
        user_id: user_id
      )

    entries = Portfolios.list_all_entries(user_id)
    orphan_shares = Projects.get_orphan_shares(user_id)

    total_sessions =
      Enum.reduce(project_shares, 0, fn ps, acc -> acc + length(ps.shares) end) +
        length(orphan_shares)

    top_skills =
      project_shares
      |> Enum.flat_map(fn ps -> ps.skills end)
      |> Enum.uniq()
      |> Enum.take(8)

    socket
    |> assign(:project_shares, project_shares)
    |> assign(:orphan_shares, orphan_shares)
    |> assign(:entries, entries)
    |> assign(:total_sessions, total_sessions)
    |> assign(:top_skills, top_skills)
  end

  defp current_template(user) do
    layout = user.portfolio_layout || "editorial"
    if layout in ~w(editorial minimal terminal brutalist campfire neon), do: layout, else: "editorial"
  end

  # ── Profile events ──

  @impl true
  def handle_event("update_profile", params, socket) do
    case Accounts.update_profile(socket.assigns.user, params) do
      {:ok, user} ->
        {:noreply, socket |> assign(:user, user) |> put_flash(:info, "Profile updated")}
      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to update profile")}
    end
  end

  @impl true
  def handle_event("save_inline", %{"field" => field, "value" => value}, socket)
      when field in ~w(display_name bio) do
    sanitized_value = String.trim(value)

    case Accounts.update_profile(socket.assigns.user, %{field => sanitized_value}) do
      {:ok, user} ->
        {:noreply, assign(socket, :user, user)}
      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to save")}
    end
  end

  def handle_event("save_inline", _params, socket), do: {:noreply, socket}

  @impl true
  def handle_event("set_layout", %{"layout" => layout}, socket) do
    case Accounts.update_profile(socket.assigns.user, %{"portfolio_layout" => layout}) do
      {:ok, user} ->
        {:noreply, socket |> assign(:user, user) |> put_flash(:info, "Layout updated")}
      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Invalid layout")}
    end
  end

  @impl true
  def handle_event("select_template", %{"template" => template}, socket) do
    case Accounts.update_profile(socket.assigns.user, %{"portfolio_layout" => template}) do
      {:ok, user} ->
        {:noreply, socket |> assign(:user, user)}
      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Invalid template")}
    end
  end

  @impl true
  def handle_event("set_accent", %{"accent" => accent}, socket) do
    case Accounts.update_profile(socket.assigns.user, %{"portfolio_accent" => accent}) do
      {:ok, user} ->
        {:noreply, socket |> assign(:user, user)}
      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Invalid accent color")}
    end
  end

  @impl true
  def handle_event("toggle_vibe_picker", _params, socket) do
    {:noreply, assign(socket, :vibe_picker_open, !socket.assigns.vibe_picker_open)}
  end

  @impl true
  def handle_event("toggle_profile_public", _params, socket) do
    new_value = !socket.assigns.user.profile_public
    case Accounts.update_profile(socket.assigns.user, %{"profile_public" => new_value}) do
      {:ok, user} ->
        label = if new_value, do: "Profile visible on portfolio", else: "Profile hidden"
        {:noreply, socket |> assign(:user, user) |> put_flash(:info, label)}
      {:error, _} ->
        {:noreply, put_flash(socket, :error, "Failed to update profile visibility")}
    end
  end

  # ── Project events ──

  @impl true
  def handle_event("toggle_project_visible", %{"id" => id}, socket) do
    with {int_id, _} <- Integer.parse(id),
         project when not is_nil(project) <- HeyiAm.Repo.get(Projects.Project, int_id),
         true <- project.user_id == socket.assigns.user.id do
      Projects.update_project(project, %{visible: !project.visible})
      label = if project.visible, do: "Project hidden", else: "Project visible"
      {:noreply, socket |> load_projects() |> put_flash(:info, label)}
    else
      _ -> {:noreply, socket}
    end
  end

  @impl true
  def handle_event("toggle_expand", %{"id" => id}, socket) do
    {int_id, _} = Integer.parse(id)
    expanded = socket.assigns.expanded_projects

    new_expanded =
      if MapSet.member?(expanded, int_id),
        do: MapSet.delete(expanded, int_id),
        else: MapSet.put(expanded, int_id)

    {:noreply, assign(socket, :expanded_projects, new_expanded)}
  end

  @impl true
  def handle_event("reorder_projects", %{"ids" => ids}, socket) do
    user_id = socket.assigns.user.id

    ids
    |> Enum.with_index()
    |> Enum.each(fn {id, idx} ->
      with {int_id, _} <- Integer.parse(id),
           project when not is_nil(project) <- HeyiAm.Repo.get(Projects.Project, int_id),
           true <- project.user_id == user_id do
        Projects.update_project(project, %{position: idx})
      end
    end)

    {:noreply, load_projects(socket)}
  end

  # ── Share events ──

  @impl true
  def handle_event("toggle_in_portfolio", %{"share-id" => share_id}, socket) do
    with {int_id, _} <- Integer.parse(share_id) do
      user_id = socket.assigns.user.id
      entry_share_ids = MapSet.new(socket.assigns.entries, & &1.share_id)

      if MapSet.member?(entry_share_ids, int_id) do
        Portfolios.remove_from_portfolio(user_id, int_id)
        {:noreply, socket |> load_projects() |> put_flash(:info, "Removed from portfolio")}
      else
        Portfolios.add_to_portfolio(user_id, int_id)
        {:noreply, socket |> load_projects() |> put_flash(:info, "Added to portfolio")}
      end
    else
      _ -> {:noreply, socket}
    end
  end

  @impl true
  def handle_event("delete_share", %{"share-id" => share_id}, socket) do
    with {int_id, _} <- Integer.parse(share_id) do
      case Shares.delete_owned_share(socket.assigns.user.id, int_id) do
        {:ok, _} ->
          {:noreply, socket |> load_projects() |> put_flash(:info, "Share deleted")}
        {:error, _} ->
          {:noreply, put_flash(socket, :error, "Failed to delete share")}
      end
    else
      _ -> {:noreply, socket}
    end
  end

  # ── Helpers ──

  defp build_user_skills(project_shares) do
    project_shares
    |> Enum.flat_map(fn ps ->
      cache = ps.project.stats_cache || %{}
      skills = cache["skills"] || []
      Enum.map(skills, fn skill -> {skill, ps.project.id} end)
    end)
    |> Enum.group_by(fn {skill, _} -> skill end, fn {_, pid} -> pid end)
    |> Enum.map(fn {skill, project_ids} ->
      %{name: skill, project_count: length(Enum.uniq(project_ids))}
    end)
    |> Enum.sort_by(& &1.project_count, :desc)
    |> Enum.take(8)
  end

  # ── Render ──

  @impl true
  def render(assigns) do
    assigns =
      assigns
      |> assign(:user_skills, build_user_skills(assigns.project_shares))
      |> assign(:current_tpl, current_template(assigns.user))

    ~H"""
    <%!-- Editor top bar --%>
    <div class="pe-topbar">
      <div class="pe-topbar__left">
        <span class="pe-topbar__label">Editing your portfolio</span>
        <span class="pe-topbar__url">heyi.am/{@user.username}</span>
      </div>
      <div class="pe-topbar__right">
        <.link
          href={"/" <> @user.username}
          class="pe-toggle-btn"
        >
          View as visitor &rarr;
        </.link>
      </div>
    </div>

    <div class="pe-page">
      <%!-- WYSIWYG hero (shared component, editing mode) --%>
      <.portfolio_hero user={@user} top_skills={@top_skills} editing={true} />

      <hr class="pe-divider">

      <%!-- Project cards (shared component, editing mode) --%>
      <.project_section
        projects={@project_shares}
        user={@user}
        editing={true}
        expanded_projects={@expanded_projects}
      />

      <%!-- Orphan shares --%>
      <%= if length(@orphan_shares) > 0 do %>
        <div class="pe-project-card">
          <div class="pe-project-header">
            <span class="pe-drag-handle" style="visibility:hidden">&#8942;&#8942;</span>
            <span class="pe-project-name" style="color:var(--light)">Other sessions</span>
            <span class="pe-project-meta">{length(@orphan_shares)}</span>
          </div>
          <div class="pe-sessions">
            <%= for share <- @orphan_shares do %>
              <div class="pe-session-row">
                <button
                  phx-click="toggle_in_portfolio"
                  phx-value-share-id={share.id}
                  class="pe-session-toggle off"
                  aria-label="Toggle portfolio inclusion"
                ></button>
                <span class="pe-session-title">{share.title}</span>
                <button
                  phx-click="delete_share"
                  phx-value-share-id={share.id}
                  data-confirm="Permanently delete this share?"
                  class="pe-delete-btn"
                >
                  Delete
                </button>
              </div>
            <% end %>
          </div>
        </div>
      <% end %>

      <%!-- Expertise ledger --%>
      <%= if length(@user_skills) > 0 do %>
        <hr class="pe-divider">
        <div class="pe-expertise">
          <div class="pe-section-label">
            <span>EXPERTISE</span>
            <span>across {length(@project_shares)} projects</span>
          </div>
          <div class="pe-skill-bars">
            <%= for skill <- @user_skills do %>
              <div class="pe-skill-row">
                <span class="pe-skill-name">{skill.name}</span>
                <div class="pe-skill-bar">
                  <div
                    class="pe-skill-bar__fill"
                    style={"width: #{min(round(skill.project_count / max(length(@project_shares), 1) * 100), 100)}%"}
                  ></div>
                </div>
                <span class="pe-skill-count">
                  {skill.project_count} project{if skill.project_count != 1, do: "s", else: ""}
                </span>
              </div>
            <% end %>
          </div>
        </div>
      <% end %>

      <div class="pe-footer"><a href="/">heyi.am</a></div>
    </div>

    <%!-- Vibe Picker Panel --%>
    <%= if @vibe_picker_open do %>
      <div class="vp-overlay" phx-click="toggle_vibe_picker"></div>
      <div class="vp-panel">
        <div class="vp-panel__header">
          <div>
            <h2 class="vp-panel__title">Choose Your Vibe</h2>
            <p class="vp-panel__sub">One template for your portfolio and all session pages</p>
          </div>
          <button phx-click="toggle_vibe_picker" class="vp-panel__close">&times;</button>
        </div>

        <div class="vp-grid">
          <%= for {key, label} <- @templates do %>
            <% desc = case key do
              "editorial" -> "Clean two-column grid with cards, serif-like feel. The professional default."
              "minimal" -> "Single column, no cards, dividers only. Ultra-clean and content-focused."
              "terminal" -> "Dark background, green monospace accents. For the CLI devotees."
              "brutalist" -> "High contrast, thick borders, raw typography. No decoration."
              "campfire" -> "Warm earth tones, soft solarized palette. Approachable and calm."
              "neon" -> "Dark with cyan and magenta neon accents. Bold and expressive."
              _ -> ""
            end %>
            <button
              phx-click="select_template"
              phx-value-template={key}
              class={"vp-card #{if @current_tpl == key, do: "vp-card--active", else: ""}"}
            >
              <div class={"vp-card__preview vp-preview--#{key}"}>
                <div class="vp-preview__bar"></div>
                <div class="vp-preview__hero"></div>
                <div class="vp-preview__grid">
                  <div class="vp-preview__card"></div>
                  <div class="vp-preview__card"></div>
                </div>
              </div>
              <div class="vp-card__info">
                <span class="vp-card__name">{label}</span>
                <%= if @current_tpl == key do %>
                  <span class="vp-card__badge">Active</span>
                <% end %>
              </div>
              <p class="vp-card__desc">{desc}</p>
            </button>
          <% end %>
        </div>
      </div>
    <% end %>

    <%!-- Bottom-docked toolbar: template picker + accent dots + view as visitor --%>
    <div class="pe-dock">
      <div class="pe-dock__templates">
        <button
          phx-click="toggle_vibe_picker"
          class="pe-dock__tpl-btn pe-dock__tpl-btn--vibe"
        >
          &#9783; Vibes
        </button>
        <%= for {key, label} <- @templates do %>
          <button
            phx-click="select_template"
            phx-value-template={key}
            class={"pe-dock__tpl-btn #{if @current_tpl == key, do: "active", else: ""}"}
          >
            {label}
          </button>
        <% end %>
      </div>
      <div class="pe-dock__sep"></div>
      <div class="pe-dock__accents">
        <%= for {accent, color_hex} <- [{"violet", "#7C5CFC"}, {"teal", "#06B6A0"}, {"rose", "#F9507A"}, {"sky", "#3B82F6"}, {"amber", "#F29D0B"}] do %>
          <button
            phx-click="set_accent"
            phx-value-accent={accent}
            class={"pe-color-dot #{if @user.portfolio_accent == accent, do: "active", else: ""}"}
            style={"background:#{color_hex}"}
            aria-label={"Set accent color to #{accent}"}
          >
          </button>
        <% end %>
      </div>
      <div class="pe-dock__sep"></div>
      <.link href={"/" <> @user.username} class="pe-dock__visit">
        View as Visitor &rarr;
      </.link>
    </div>
    """
  end
end
