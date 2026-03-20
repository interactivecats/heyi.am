defmodule HeyiAmWeb.PortfolioComponents do
  @moduledoc """
  Shared function components for rendering portfolios.
  Used by both the public PortfolioController and the PortfolioLive editor.
  """
  use Phoenix.Component

  alias HeyiAm.Projects
  alias HeyiAm.Portfolios

  @accent_colors ~w(violet teal rose amber sky)

  # ── Data helpers ──

  @doc """
  Builds a unified project data shape for portfolio rendering.

  Options:
    - `editing: true` — loads shares and in_portfolio data for the editor
    - `filter_visible: true` — only returns visible projects (for public view)
  """
  def build_portfolio_projects(projects, opts \\ []) do
    editing = Keyword.get(opts, :editing, false)
    filter_visible = Keyword.get(opts, :filter_visible, false)
    user_id = Keyword.get(opts, :user_id)

    entry_share_ids =
      if editing && user_id do
        entries = Portfolios.list_all_entries(user_id)
        MapSet.new(entries, & &1.share_id)
      else
        MapSet.new()
      end

    projects
    |> then(fn ps -> if filter_visible, do: Enum.filter(ps, & &1.visible), else: ps end)
    |> Enum.map(fn project ->
      cache = project.stats_cache || %{}

      shares =
        if editing && user_id do
          Projects.get_project_shares(project.id, user_id)
        else
          []
        end

      in_portfolio =
        if editing do
          MapSet.new(
            shares |> Enum.filter(&MapSet.member?(entry_share_ids, &1.id)),
            & &1.id
          )
        else
          MapSet.new()
        end

      %{
        project: project,
        name: project.display_name || project.project_key,
        description: project.description,
        featured_quote: project.featured_quote,
        share_count: cache["share_count"] || 0,
        total_duration: cache["total_duration_minutes"] || 0,
        skills: (cache["skills"] || []) |> Enum.take(4),
        initials: project_initials(project.display_name || project.project_key),
        shares: shares,
        in_portfolio: in_portfolio
      }
    end)
  end

  # ── Function components ──

  @doc "Renders the portfolio hero section (editor mode)"
  attr :user, :map, required: true
  attr :top_skills, :list, default: []
  attr :editing, :boolean, default: false
  attr :is_owner, :boolean, default: false

  def portfolio_hero(assigns) do
    ~H"""
    <div class="portfolio-hero">
      <%= if @editing do %>
        <h1
          class="edit-hover"
          contenteditable="true"
          spellcheck="false"
          phx-blur="save_inline"
          phx-value-field="display_name"
          phx-hook="InlineEdit"
          id="pe-display-name"
        >{@user.display_name || @user.username}</h1>
      <% else %>
        <h1>{@user.display_name || @user.username}</h1>
      <% end %>

      <%= if @editing do %>
        <p
          class="portfolio-bio edit-hover"
          contenteditable="true"
          spellcheck="false"
          phx-blur="save_inline"
          phx-value-field="bio"
          phx-hook="InlineEdit"
          id="pe-bio"
        >{@user.bio || "Add a bio..."}</p>
      <% else %>
        <%= if @user.bio do %>
          <p class="portfolio-bio">{@user.bio}</p>
        <% end %>
      <% end %>

      <div class="hero-links">
        <%= if @user.github_url do %>
          <%= if @editing do %>
            <a href={@user.github_url} class="edit-hover" target="_blank" rel="noopener">{@user.github_url |> String.replace(~r{https?://}, "")}</a>
          <% else %>
            <a href={@user.github_url} target="_blank">github.com/{@user.username}</a>
          <% end %>
        <% end %>
        <%= if @editing do %>
          <%= for {label, url} <- Map.to_list(@user.links || %{}) do %>
            <a href={url} class="edit-hover" target="_blank" rel="noopener">{label}</a>
          <% end %>
        <% end %>
      </div>

      <%= if length(@top_skills) > 0 do %>
        <div class="skills-line" style="margin-top:16px;">
          <%= for skill <- @top_skills do %>
            <span class="skill-tag">{skill}</span>
          <% end %>
        </div>
      <% end %>
    </div>
    """
  end

  @doc "Renders a project card for the public grid view"
  attr :proj, :map, required: true
  attr :idx, :integer, required: true
  attr :user, :map, required: true

  def public_project_card(assigns) do
    assigns = assign(assigns, :color, Enum.at(@accent_colors, rem(assigns.idx, length(@accent_colors))))

    ~H"""
    <a href={"/" <> @user.username <> "/" <> @proj.project.project_key} class="project-card">
      <div class="card-hero" style={"background:linear-gradient(135deg,var(--#{@color}-bg) 0%,var(--surface-low) 100%)"}>
        <span class="card-hero-initials" style={"color:var(--#{@color});opacity:0.5"}>{@proj.initials}</span>
      </div>
      <div class="card-body">
        <div class="card-name">{@proj.name}</div>
        <%= if @proj.featured_quote do %>
          <div class="card-quote">"{@proj.featured_quote}"</div>
        <% end %>
        <div class="card-stats">
          <%= if @proj.share_count > 0 do %>
            <div class="card-stat">
              <span class="card-stat-value">{@proj.share_count}</span>
              <span class="card-stat-label">sessions</span>
            </div>
          <% end %>
          <%= if @proj.total_duration > 0 do %>
            <div class="card-stat">
              <span class="card-stat-value">{@proj.total_duration}</span>
              <span class="card-stat-label">minutes</span>
            </div>
          <% end %>
        </div>
        <%= if length(@proj.skills) > 0 do %>
          <div class="card-tags">
            <%= for skill <- @proj.skills do %>
              <span class="skill-tag">{skill}</span>
            <% end %>
          </div>
        <% end %>
      </div>
    </a>
    """
  end

  @doc "Renders a project card for the editor with drag handle, visibility toggle, expand/collapse"
  attr :proj, :map, required: true
  attr :idx, :integer, required: true
  attr :total, :integer, required: true
  attr :expanded, :boolean, default: false

  def editor_project_card(assigns) do
    ~H"""
    <div
      class={"pe-project-card #{unless @proj.project.visible, do: "pe-project-card--hidden", else: ""}"}
      data-project-id={@proj.project.id}
    >
      <div class="pe-project-header">
        <span class="pe-drag-handle">&#8942;&#8942;</span>
        <span class="pe-project-name">{@proj.name}</span>
        <span class="pe-project-meta">
          {length(@proj.shares)} session{if length(@proj.shares) != 1, do: "s", else: ""}
          · {MapSet.size(@proj.in_portfolio)} published
        </span>
        <button
          phx-click="toggle_project_visible"
          phx-value-id={@proj.project.id}
          class={"pe-eye-btn #{unless @proj.project.visible, do: "hidden", else: ""}"}
          aria-label={if @proj.project.visible, do: "Hide project", else: "Show project"}
        >
          &#128065;
        </button>
        <button
          phx-click="toggle_expand"
          phx-value-id={@proj.project.id}
          class="pe-expand-btn"
        >
          {if @expanded, do: "Collapse", else: "Expand"}
        </button>
      </div>

      <%= if @expanded do %>
        <div class="pe-sessions">
          <%= for share <- @proj.shares do %>
            <div class="pe-session-row">
              <button
                phx-click="toggle_in_portfolio"
                phx-value-share-id={share.id}
                class={"pe-session-toggle #{if MapSet.member?(@proj.in_portfolio, share.id), do: "on", else: "off"}"}
                aria-label={if MapSet.member?(@proj.in_portfolio, share.id), do: "Remove from portfolio", else: "Add to portfolio"}
              ></button>
              <span class={"pe-session-title #{unless MapSet.member?(@proj.in_portfolio, share.id), do: "pe-session-title--off", else: ""}"}>
                {share.title}
                <%= if share.sealed_at do %>
                  <span class="pe-sealed-badge">sealed</span>
                <% end %>
              </span>
              <span class="pe-session-date">
                {share.session_month || ""}
              </span>
            </div>
          <% end %>
        </div>
      <% end %>
    </div>
    """
  end

  @doc "Renders the project grid section"
  attr :projects, :list, required: true
  attr :user, :map, required: true
  attr :editing, :boolean, default: false
  attr :expanded_projects, :any, default: nil

  def project_section(assigns) do
    ~H"""
    <%= if @editing do %>
      <div class="pe-section-label">
        <span>PROJECTS</span>
        <span>{length(@projects)} projects</span>
      </div>

      <%= if length(@projects) == 0 do %>
        <div class="pe-empty">
          No published sessions yet. Use the CLI to publish your first session.
        </div>
      <% end %>

      <div id="project-list" phx-hook="SortableProjects">
        <%= for {proj, idx} <- Enum.with_index(@projects) do %>
          <.editor_project_card
            proj={proj}
            idx={idx}
            total={length(@projects)}
            expanded={MapSet.member?(@expanded_projects, proj.project.id)}
          />
        <% end %>
      </div>
    <% else %>
      <%= if length(@projects) > 0 do %>
        <div class="section-label">
          <span>PROJECTS</span>
          <span>{length(@projects)} projects</span>
        </div>

        <div class="project-grid">
          <%= for {proj, idx} <- Enum.with_index(@projects) do %>
            <.public_project_card proj={proj} idx={idx} user={@user} />
          <% end %>
        </div>
      <% end %>
    <% end %>
    """
  end

  # ── Helpers ──

  def project_initials(name) do
    name
    |> String.split(~r/[\s._-]+/)
    |> Enum.take(2)
    |> Enum.map(&String.first/1)
    |> Enum.join()
    |> String.downcase()
  end
end
