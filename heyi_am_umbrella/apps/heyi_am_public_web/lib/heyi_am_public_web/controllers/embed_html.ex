defmodule HeyiAmPublicWeb.EmbedHTML do
  use HeyiAmPublicWeb, :html

  embed_templates "embed_html/*"

  def format_duration(nil), do: "0m"
  def format_duration(minutes) when minutes >= 60, do: "#{div(minutes, 60)}h"
  def format_duration(minutes), do: "#{minutes}m"

  def format_number(n) when is_number(n) and n >= 1_000_000, do: "#{Float.round(n / 1_000_000, 1)}M"
  def format_number(n) when is_number(n) and n >= 1000, do: "#{Float.round(n / 1000, 1)}k"
  def format_number(n) when is_number(n), do: "#{n}"
  def format_number(_), do: "0"

  @tool_labels %{
    "claude" => "Claude Code",
    "cursor" => "Cursor",
    "codex" => "Codex",
    "gemini" => "Gemini CLI"
  }

  def tool_label(tool), do: Map.get(@tool_labels, tool, tool || "Unknown")

  def heatmap_level(0), do: 0
  def heatmap_level(1), do: 1
  def heatmap_level(2), do: 2
  def heatmap_level(n) when n <= 4, do: 3
  def heatmap_level(_), do: 4

  # Theme CSS variables
  def theme_vars("light") do
    %{
      bg: "#ffffff", text: "#1f2937", text_muted: "#6b7280", text_faint: "#9ca3af",
      border: "#e5e7eb", chip_bg: "#f3f4f6", chip_text: "#4b5563",
      accent: "#059669", stat_value: "#111827",
      hm0: "#ebedf0", hm1: "#9be9a8", hm2: "#40c463", hm3: "#30a14e", hm4: "#216e39"
    }
  end

  def theme_vars(_dark) do
    %{
      bg: "#0a0a0f", text: "#e5e7eb", text_muted: "#6b7280", text_faint: "#4b5563",
      border: "#1f2937", chip_bg: "#1f2937", chip_text: "#9ca3af",
      accent: "#22c55e", stat_value: "#f9fafb",
      hm0: "#161b22", hm1: "#0e4429", hm2: "#006d32", hm3: "#26a641", hm4: "#39d353"
    }
  end

  # Section renderer — dispatches to the right markup
  def render_section(section, assigns) do
    data = assigns.section_data[section]
    section_assigns = Map.merge(assigns, %{data: data})
    render_section_content(section, section_assigns)
  end

  defp render_section_content("stats", assigns) do
    stats = assigns.stats
    assigns = Map.put(assigns, :s, stats)
    ~H"""
    <div class="embed-stats">
      <div class="embed-stat">
        <span class="embed-stat-value"><%= format_number(@s.total_sessions) %></span>
        <span class="embed-stat-label">Sessions</span>
      </div>
      <div class="embed-stat">
        <span class="embed-stat-value"><%= format_number(@s.total_loc) %></span>
        <span class="embed-stat-label">Lines Changed</span>
      </div>
      <div class="embed-stat">
        <span class="embed-stat-value"><%= format_duration(@s.total_duration) %></span>
        <span class="embed-stat-label">Active Time</span>
      </div>
      <%= if @s.multiplier do %>
      <div class="embed-stat">
        <div class="embed-leverage">
          <span class="embed-leverage-multi"><%= @s.multiplier %>x</span>
          <span class="embed-leverage-sub">leverage</span>
        </div>
        <span class="embed-stat-label">Human + Agents</span>
      </div>
      <% end %>
    </div>
    """
  end

  defp render_section_content("tools", assigns) do
    tools = assigns.data || []
    max_sessions = Enum.max_by(tools, & &1.sessions, fn -> %{sessions: 1} end).sessions
    assigns = Map.merge(assigns, %{tools: tools, max_sessions: max(max_sessions, 1)})
    ~H"""
    <div class="embed-section-title">Tools</div>
    <div class="embed-tools">
      <%= for t <- @tools do %>
      <div class="embed-tool">
        <div class="embed-tool-bar" style={"width: #{max(round(t.sessions / @max_sessions * 60), 4)}px"}></div>
        <span class="embed-tool-name"><%= tool_label(t.tool) %></span>
        <span class="embed-tool-count"><%= t.sessions %></span>
      </div>
      <% end %>
    </div>
    """
  end

  defp render_section_content("skills", assigns) do
    skills = assigns.data || []
    assigns = Map.put(assigns, :skills_data, skills)
    ~H"""
    <div class="embed-section-title">Skills</div>
    <div class="embed-skills">
      <%= for s <- @skills_data do %>
      <span class="embed-chip"><%= s.skill %><span class="embed-skill-count"><%= s.count %></span></span>
      <% end %>
    </div>
    """
  end

  defp render_section_content("heatmap", assigns) do
    heatmap = assigns.data || %{weeks: [], month_labels: [], today: Date.utc_today()}
    # Build a map of week_idx => label for quick lookup
    month_map = Map.new(heatmap.month_labels)
    assigns = Map.merge(assigns, %{heatmap: heatmap, month_map: month_map})
    ~H"""
    <div class="embed-section-title">Activity</div>
    <div class="embed-heatmap-container">
      <%!-- Month labels row: same flex layout as cell grid so columns align --%>
      <div class="embed-heatmap-row">
        <div class="embed-heatmap-day-spacer"></div>
        <div class="embed-heatmap-months">
          <%= for {_week, idx} <- Enum.with_index(@heatmap.weeks) do %>
          <div class="embed-heatmap-month-cell">
            <%= if label = @month_map[idx] do %><span><%= label %></span><% end %>
          </div>
          <% end %>
        </div>
      </div>
      <%!-- Cell grid with day labels --%>
      <div class="embed-heatmap-row">
        <div class="embed-heatmap-days">
          <span></span>
          <span>Mon</span>
          <span></span>
          <span>Wed</span>
          <span></span>
          <span>Fri</span>
          <span></span>
        </div>
        <div class="embed-heatmap">
          <%= for week <- @heatmap.weeks do %>
          <div class="embed-heatmap-week">
            <%= for day <- week do %>
            <div class={"embed-heatmap-cell embed-heatmap-#{heatmap_level(day.count)}"} title={"#{day.date}: #{day.count} sessions"}></div>
            <% end %>
          </div>
          <% end %>
        </div>
      </div>
    </div>
    """
  end

  defp render_section_content("recent", assigns) do
    recent = assigns.data || %{sessions_30d: 0, loc_30d: 0, hours_30d: 0}
    assigns = Map.put(assigns, :recent, recent)
    ~H"""
    <div class="embed-recent">
      <span class="embed-recent-value"><%= @recent.sessions_30d %></span> sessions &middot;
      <span class="embed-recent-value"><%= format_number(@recent.loc_30d) %></span> lines &middot;
      <span class="embed-recent-value"><%= @recent.hours_30d %></span>h
      <span class="embed-recent-period">in the last 30 days</span>
    </div>
    """
  end

  defp render_section_content(_, _assigns), do: ""
end
