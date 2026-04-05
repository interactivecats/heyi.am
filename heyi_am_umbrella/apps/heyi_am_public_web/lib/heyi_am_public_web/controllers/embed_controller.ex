defmodule HeyiAmPublicWeb.EmbedController do
  use HeyiAmPublicWeb, :controller

  alias HeyiAm.Accounts
  alias HeyiAm.Projects
  alias HeyiAm.Shares

  @valid_sections ~w(stats tools skills heatmap recent)
  @default_sections ["stats"]
  @valid_themes ~w(dark light)

  # GET /:username/embed
  def portfolio_html(conn, %{"username" => username} = params) do
    with {:ok, user, projects} <- fetch_portfolio(username) do
      sections = parse_sections(params)
      theme = parse_theme(params)
      shares = fetch_shares_if_needed(user.id, sections)
      stats = build_portfolio_stats(projects)
      section_data = build_section_data(sections, shares, stats)

      conn
      |> put_cache_headers()
      |> put_root_layout(false)
      |> put_layout(false)
      |> render(:portfolio_embed,
        stats: stats,
        user: user,
        sections: sections,
        section_data: section_data,
        theme: theme
      )
    else
      :not_found -> send_resp(conn, 404, "Not found")
    end
  end

  # GET /:username/embed.svg
  def portfolio_svg(conn, %{"username" => username} = params) do
    with {:ok, user, projects} <- fetch_portfolio(username) do
      stats = build_portfolio_stats(projects)
      style = Map.get(params, "style", "card")

      svg =
        Phoenix.Template.render_to_string(
          HeyiAmPublicWeb.EmbedHTML,
          "portfolio_badge",
          "html",
          Map.merge(stats, %{user: user, style: style})
        )
        |> clean_svg()

      conn
      |> put_resp_content_type("image/svg+xml")
      |> put_cache_headers()
      |> send_resp(200, svg)
    else
      :not_found -> send_resp(conn, 404, "Not found")
    end
  end

  # GET /:username/:project/embed
  def project_html(conn, %{"username" => username, "project" => slug} = params) do
    with {:ok, user, project} <- fetch_project(username, slug) do
      sections = parse_sections(params)
      theme = parse_theme(params)
      shares = if needs_shares?(sections), do: Shares.list_shares_for_project(project.id), else: []
      stats = build_project_stats(project)
      section_data = build_section_data(sections, shares, stats)

      conn
      |> put_cache_headers()
      |> put_root_layout(false)
      |> put_layout(false)
      |> render(:project_embed,
        stats: stats,
        user: user,
        project: project,
        sections: sections,
        section_data: section_data,
        theme: theme
      )
    else
      :not_found -> send_resp(conn, 404, "Not found")
    end
  end

  # GET /:username/:project/embed.svg
  def project_svg(conn, %{"username" => username, "project" => slug} = params) do
    with {:ok, user, project} <- fetch_project(username, slug) do
      stats = build_project_stats(project)
      style = Map.get(params, "style", "card")

      svg =
        Phoenix.Template.render_to_string(
          HeyiAmPublicWeb.EmbedHTML,
          "project_badge",
          "html",
          Map.merge(stats, %{user: user, project: project, style: style})
        )
        |> clean_svg()

      conn
      |> put_resp_content_type("image/svg+xml")
      |> put_cache_headers()
      |> send_resp(200, svg)
    else
      :not_found -> send_resp(conn, 404, "Not found")
    end
  end

  # --- Section parsing ---

  defp parse_sections(%{"sections" => sections_str}) when is_binary(sections_str) do
    sections_str
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.filter(&(&1 in @valid_sections))
    |> case do
      [] -> @default_sections
      sections -> sections
    end
  end

  defp parse_sections(_), do: @default_sections

  defp parse_theme(%{"theme" => theme}) when theme in @valid_themes, do: theme
  defp parse_theme(_), do: "dark"

  defp needs_shares?(sections) do
    Enum.any?(sections, &(&1 in ~w(tools heatmap recent skills)))
  end

  defp fetch_shares_if_needed(user_id, sections) do
    if needs_shares?(sections),
      do: Shares.list_published_shares_slim(user_id),
      else: []
  end

  # --- Section data builders ---

  defp build_section_data(sections, shares, stats) do
    Map.new(sections, fn section ->
      {section, build_one_section(section, shares, stats)}
    end)
  end

  defp build_one_section("stats", _shares, stats), do: stats

  defp build_one_section("tools", shares, _stats) do
    shares
    |> Enum.group_by(& &1.source_tool)
    |> Enum.map(fn {tool, tool_shares} ->
      %{
        tool: tool || "unknown",
        sessions: length(tool_shares),
        loc: Enum.sum(Enum.map(tool_shares, &(&1.loc_changed || 0)))
      }
    end)
    |> Enum.sort_by(& &1.sessions, :desc)
  end

  defp build_one_section("skills", shares, _stats) do
    shares
    |> Enum.flat_map(&(&1.skills || []))
    |> Enum.frequencies()
    |> Enum.sort_by(fn {_skill, count} -> count end, :desc)
    |> Enum.take(8)
    |> Enum.map(fn {skill, count} -> %{skill: skill, count: count} end)
  end

  @month_abbrevs ~w(Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec)

  defp build_one_section("heatmap", shares, _stats) do
    # Build 52-week heatmap data (most recent 52 weeks)
    today = Date.utc_today()
    # Start from the Monday 52 weeks ago
    start_date = Date.add(today, -(52 * 7 + Date.day_of_week(today) - 1))

    weeks =
      for week <- 0..51 do
        for day <- 0..6 do
          date = Date.add(start_date, week * 7 + day)
          count =
            Enum.count(shares, fn s ->
              s.recorded_at && DateTime.to_date(s.recorded_at) == date
            end)

          %{date: date, count: count}
        end
      end

    # Month labels: find the first week where each month starts
    month_labels =
      weeks
      |> Enum.with_index()
      |> Enum.reduce([], fn {week_days, week_idx}, acc ->
        first_day = List.first(week_days)
        if first_day && first_day.date.day <= 7 do
          label = Enum.at(@month_abbrevs, first_day.date.month - 1)
          [{week_idx, label} | acc]
        else
          acc
        end
      end)
      |> Enum.reverse()

    %{weeks: weeks, month_labels: month_labels, start_date: start_date, today: today}
  end

  defp build_one_section("recent", shares, _stats) do
    cutoff = DateTime.add(DateTime.utc_now(), -30, :day)

    recent =
      Enum.filter(shares, fn s ->
        s.recorded_at && DateTime.compare(s.recorded_at, cutoff) != :lt
      end)

    %{
      sessions_30d: length(recent),
      loc_30d: Enum.sum(Enum.map(recent, &(&1.loc_changed || 0))),
      hours_30d: Float.round(Enum.sum(Enum.map(recent, &(&1.duration_minutes || 0))) / 60, 1)
    }
  end

  defp build_one_section(_, _shares, _stats), do: nil

  # --- Data fetching ---

  defp fetch_portfolio(username) do
    case Accounts.get_user_by_username(username) do
      nil ->
        :not_found

      user ->
        projects =
          Projects.list_user_projects_with_published_shares(user.id)
          |> Enum.filter(fn p -> p.rendered_html && p.shares != [] end)

        if projects == [], do: :not_found, else: {:ok, user, projects}
    end
  end

  defp fetch_project(username, slug) do
    case Accounts.get_user_by_username(username) do
      nil ->
        :not_found

      user ->
        case Projects.get_project_with_published_shares(user.id, slug) do
          nil -> :not_found
          %{shares: []} -> :not_found
          project -> {:ok, user, project}
        end
    end
  end

  # --- Stats computation ---

  defp build_portfolio_stats(projects) do
    total_sessions = projects |> Enum.map(&(&1.total_sessions || length(&1.shares))) |> Enum.sum()
    total_loc = projects |> Enum.map(&(&1.total_loc || 0)) |> Enum.sum()
    total_duration = projects |> Enum.map(&(&1.total_duration_minutes || 0)) |> Enum.sum()
    total_agent = projects |> Enum.map(&(&1.total_agent_duration_minutes || 0)) |> Enum.sum()
    all_skills = projects |> Enum.flat_map(&(&1.skills || [])) |> Enum.uniq() |> Enum.take(8)

    multiplier =
      if total_duration > 0 && total_agent > 0,
        do: Float.round(total_agent / total_duration, 1),
        else: nil

    %{
      total_sessions: total_sessions,
      total_loc: total_loc,
      total_duration: total_duration,
      total_agent: total_agent,
      multiplier: multiplier,
      skills: all_skills,
      project_count: length(projects)
    }
  end

  defp build_project_stats(project) do
    duration = project.total_duration_minutes || 0
    agent = project.total_agent_duration_minutes

    multiplier =
      if duration > 0 && agent && agent > 0,
        do: Float.round(agent / duration, 1),
        else: nil

    %{
      title: project.title,
      total_sessions: project.total_sessions || 0,
      total_loc: project.total_loc || 0,
      total_duration: duration,
      total_agent: agent,
      multiplier: multiplier,
      skills: project.skills || [],
      total_files_changed: project.total_files_changed || 0
    }
  end

  # --- Helpers ---

  defp put_cache_headers(conn) do
    put_resp_header(conn, "cache-control", "public, max-age=3600, s-maxage=86400")
  end

  defp clean_svg(svg) do
    svg
    |> String.replace(~r/ data-phx-[a-z]+="[^"]*"/, "")
    |> String.replace(~r/<!--.*?-->/s, "")
  end
end
