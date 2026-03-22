defmodule HeyiAmWeb.PortfolioController do
  use HeyiAmWeb, :controller

  import HeyiAmWeb.Helpers, only: [format_loc: 1, slugify: 1]

  alias HeyiAm.Accounts
  alias HeyiAm.Portfolios
  alias HeyiAm.Profiles
  alias HeyiAm.Projects

  def show(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      user ->
        portfolio_sessions = Portfolios.list_visible_portfolio_sessions(user.id)
        shares = Enum.map(portfolio_sessions, fn ps -> ps.share end)

        # Use portfolio_session.project_name (snapshot at publish time) for grouping
        projects = build_projects(portfolio_sessions)
        collab_profile = build_collab_profile(shares)
        metrics = build_metrics(shares)
        recent_activity = build_recent_activity(shares)

        render(conn, :show,
          portfolio_user: user,
          projects: projects,
          collab_profile: collab_profile,
          metrics: metrics,
          recent_activity: recent_activity,
          page_title: user.display_name || user.username,
          portfolio_layout: user.portfolio_layout || "editorial"
        )
    end
  end

  def project(conn, %{"username" => username, "project" => slug}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      user ->
        portfolio_sessions = Portfolios.list_visible_portfolio_sessions(user.id)

        project_shares =
          portfolio_sessions
          |> Enum.filter(fn ps -> slugify(ps.project_name) == slug end)
          |> Enum.map(& &1.share)

        case project_shares do
          [] ->
            conn
            |> put_status(:not_found)
            |> put_view(HeyiAmWeb.ErrorHTML)
            |> render(:"404")

          _ ->
            project = build_project_detail(project_shares, slug)

            sessions =
              Enum.map(project_shares, fn s ->
                %{
                  token: s.token,
                  title: s.title,
                  description: s.dev_take,
                  duration_minutes: s.duration_minutes,
                  turns: s.turns,
                  files_changed: s.files_changed,
                  loc_changed: format_loc(s.loc_changed),
                  skills: s.skills || [],
                  recorded_at: s.recorded_at,
                  verified_at: s.verified_at
                }
              end)

            growth_data = Projects.compute_cumulative_loc(project_shares)
            chart = compute_chart(growth_data)
            heatmap_data = Projects.compute_file_heatmap(project_shares)
            top_files = Projects.compute_top_files(project_shares) |> Enum.take(10)

            # Build ordered session tokens for heatmap columns
            heatmap_sessions =
              project_shares
              |> Enum.sort_by(& &1.recorded_at, DateTime)
              |> Enum.map(fn s -> %{token: s.token, title: truncate(s.title, 12)} end)

            render(conn, :project,
              portfolio_user: user,
              project: project,
              sessions: sessions,
              growth_data: growth_data,
              chart: chart,
              heatmap_data: heatmap_data,
              heatmap_sessions: heatmap_sessions,
              top_files: top_files,
              page_title: "#{project.title} — #{user.display_name || user.username}",
              portfolio_layout: user.portfolio_layout || "editorial"
            )
        end
    end
  end

  # -- Private helpers --

  defp build_projects(portfolio_sessions) do
    portfolio_sessions
    |> Enum.group_by(& &1.project_name)
    |> Enum.map(fn {project_name, pss} ->
      project_shares = Enum.map(pss, & &1.share)
      stats = Projects.compute_project_stats(project_shares)

      %{
        title: project_name || "Untitled Project",
        slug: slugify(project_name),
        description: List.first(project_shares).dev_take,
        status: "active",
        skills: project_shares |> Enum.flat_map(& (&1.skills || [])) |> Enum.uniq(),
        session_count: stats.total_sessions,
        total_minutes: stats.total_duration,
        loc_changed: format_loc(stats.total_loc)
      }
    end)
  end

  defp build_collab_profile(shares) do
    case Profiles.compute_profile(shares) do
      nil ->
        %{task_scoping: 0, redirection: 0, verification: 0, orchestration: 0}

      %{dimensions: dimensions} ->
        dim_map =
          Map.new(dimensions, fn d -> {d.key, d.score} end)

        %{
          task_scoping: dim_map[:task_scoping] || 0,
          redirection: dim_map[:active_redirection] || 0,
          verification: dim_map[:verification] || 0,
          orchestration: dim_map[:tool_orchestration] || 0
        }
    end
  end

  defp build_metrics(shares) do
    total_minutes = Enum.sum(Enum.map(shares, & (&1.duration_minutes || 0)))
    count = length(shares)
    avg_minutes = if count > 0, do: div(total_minutes, count), else: 0

    %{
      uptime: format_duration(total_minutes),
      avg_cycle: "#{avg_minutes}m",
      error_budget: "—"
    }
  end

  defp build_recent_activity(shares) do
    shares
    |> Enum.sort_by(& &1.inserted_at, {:desc, DateTime})
    |> Enum.take(5)
    |> Enum.map(fn s ->
      %{
        label: s.title,
        date: Calendar.strftime(s.recorded_at || s.inserted_at, "%b %d")
      }
    end)
  end

  defp build_project_detail([], slug) do
    %{
      title: slug,
      slug: slug,
      description: nil,
      status: "active",
      skills: [],
      session_count: 0,
      total_minutes: 0,
      files_touched: 0,
      loc_changed: "0",
      dev_take: nil,
      architecture: nil
    }
  end

  defp build_project_detail(project_shares, slug) do
    stats = Projects.compute_project_stats(project_shares)
    first = List.first(project_shares)

    # Use project_meta from the most recently published share if available
    meta =
      project_shares
      |> Enum.sort_by(& &1.recorded_at, {:desc, DateTime})
      |> Enum.find_value(fn s -> s.project_meta end)

    uploaded_count = stats.total_sessions

    {session_count, total_minutes, files_touched, loc_changed} =
      if meta do
        {
          Map.get(meta, "total_sessions") || uploaded_count,
          Map.get(meta, "total_duration_minutes") || stats.total_duration,
          Map.get(meta, "total_files_changed") || stats.unique_files,
          format_loc(Map.get(meta, "total_loc") || stats.total_loc)
        }
      else
        {uploaded_count, stats.total_duration, stats.unique_files, format_loc(stats.total_loc)}
      end

    %{
      title: first.project_name || slug,
      slug: slug,
      description: first.dev_take,
      status: "active",
      skills: project_shares |> Enum.flat_map(& (&1.skills || [])) |> Enum.uniq(),
      session_count: session_count,
      uploaded_count: uploaded_count,
      total_minutes: total_minutes,
      files_touched: files_touched,
      loc_changed: loc_changed,
      dev_take: first.dev_take,
      architecture: first.narrative
    }
  end

  defp compute_chart([]), do: nil

  defp compute_chart(growth_data) do
    max_loc = Enum.max_by(growth_data, & &1.loc).loc
    max_loc = if max_loc == 0, do: 1, else: max_loc
    count = length(growth_data)

    chart_left = 40
    chart_right = 490
    chart_top = 10
    chart_bottom = 140
    chart_w = chart_right - chart_left
    chart_h = chart_bottom - chart_top

    points =
      growth_data
      |> Enum.with_index()
      |> Enum.map(fn {d, i} ->
        x = if count == 1, do: chart_left + div(chart_w, 2), else: chart_left + round(chart_w * i / (count - 1))
        y = chart_bottom - round(chart_h * d.loc / max_loc)
        %{x: x, y: y, loc: d.loc, title: d.title, delta: d.loc_delta}
      end)

    y_steps = [0, round(max_loc * 0.33), round(max_loc * 0.66), max_loc]

    poly_points =
      if count > 1 do
        first_x = List.first(points).x
        last_x = List.last(points).x
        coords = Enum.map(points, fn p -> "#{p.x},#{p.y}" end)
        "#{first_x},#{chart_bottom} #{Enum.join(coords, " ")} #{last_x},#{chart_bottom}"
      end

    line_points =
      if count > 1, do: Enum.map_join(points, " ", fn p -> "#{p.x},#{p.y}" end)

    y_grid =
      y_steps
      |> Enum.with_index()
      |> Enum.map(fn {val, i} ->
        y = chart_bottom - round(chart_h * val / max_loc)
        %{y: y, label: format_loc(val), show_line: i > 0}
      end)

    deltas =
      if count > 1 do
        points
        |> Enum.with_index()
        |> Enum.filter(fn {_, i} -> i > 0 end)
        |> Enum.map(fn {p, i} ->
          prev = Enum.at(points, i - 1)
          %{x: round((prev.x + p.x) / 2), y: round((prev.y + p.y) / 2) - 8, delta: p.delta}
        end)
      else
        []
      end

    %{
      points: points,
      poly_points: poly_points,
      line_points: line_points,
      y_grid: y_grid,
      deltas: deltas,
      chart_left: chart_left,
      chart_right: chart_right,
      chart_top: chart_top,
      chart_bottom: chart_bottom
    }
  end

  defp format_duration(minutes) when minutes >= 60, do: "#{div(minutes, 60)}h"
  defp format_duration(minutes), do: "#{minutes}m"

  defp truncate(nil, _max), do: ""
  defp truncate(str, max) when byte_size(str) <= max, do: str
  defp truncate(str, max), do: String.slice(str, 0, max) <> "…"

end
