defmodule HeyiAmWeb.PortfolioController do
  use HeyiAmWeb, :controller

  import HeyiAmWeb.Helpers, only: [format_loc: 1]

  alias HeyiAm.Accounts
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
        projects = Projects.list_user_projects_with_published_shares(user.id)
        all_shares = Enum.flat_map(projects, & &1.shares)

        render(conn, :show,
          portfolio_user: user,
          projects: build_projects(projects),
          collab_profile: build_collab_profile(all_shares),
          metrics: build_metrics(all_shares),
          recent_activity: build_recent_activity(all_shares),
          page_title: user.display_name || user.username
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
        case Projects.get_project_with_published_shares(user.id, slug) do
          nil ->
            conn
            |> put_status(:not_found)
            |> put_view(HeyiAmWeb.ErrorHTML)
            |> render(:"404")

          project ->
            sessions =
              Enum.map(project.shares, fn s ->
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

            growth_data = Projects.Stats.compute_cumulative_loc(project.shares)
            chart = compute_chart(growth_data)
            work_timeline_json = build_work_timeline_json(project.shares)
            heatmap_data = Projects.Stats.compute_file_heatmap(project.shares)
            top_files = Projects.Stats.compute_top_files(project.shares) |> Enum.take(10)

            heatmap_sessions =
              project.shares
              |> Enum.sort_by(& &1.recorded_at, DateTime)
              |> Enum.map(fn s -> %{token: s.token, title: truncate(s.title, 12)} end)

            render(conn, :project,
              portfolio_user: user,
              project: build_project_detail(project),
              sessions: sessions,
              growth_data: growth_data,
              chart: chart,
              work_timeline_json: work_timeline_json,
              heatmap_data: heatmap_data,
              heatmap_sessions: heatmap_sessions,
              top_files: top_files,
              page_title: "#{project.title} — #{user.display_name || user.username}"
            )
        end
    end
  end

  # -- Private helpers --

  defp build_projects(projects) do
    Enum.map(projects, fn project ->
      stats = Projects.Stats.compute_project_stats(project.shares)

      %{
        title: project.title,
        slug: project.slug,
        description: project.shares |> List.first() |> then(& &1 && &1.dev_take),
        status: "active",
        skills: project.skills || [],
        session_count: project.total_sessions || stats.total_sessions,
        total_minutes: project.total_duration_minutes || stats.total_duration,
        loc_changed: format_loc(project.total_loc || stats.total_loc)
      }
    end)
  end

  defp build_project_detail(project) do
    stats = Projects.Stats.compute_project_stats(project.shares)

    %{
      title: project.title,
      slug: project.slug,
      narrative: project.narrative,
      repo_url: project.repo_url,
      project_url: project.project_url,
      status: "active",
      skills: project.skills || [],
      session_count: project.total_sessions || stats.total_sessions,
      uploaded_count: length(project.shares),
      total_minutes: project.total_duration_minutes || stats.total_duration,
      files_touched: project.total_files_changed || stats.unique_files,
      loc_changed: format_loc(project.total_loc || stats.total_loc),
      timeline: project.timeline || []
    }
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

  # Serialize shares into the JSON shape the WorkTimeline React component expects
  defp build_work_timeline_json(shares) do
    sessions =
      shares
      |> Enum.filter(& &1.recorded_at)
      |> Enum.sort_by(&DateTime.to_unix(&1.recorded_at, :millisecond))
      |> Enum.map(fn s ->
        base = %{
          id: s.token,
          title: s.title || "",
          date: DateTime.to_iso8601(s.recorded_at),
          durationMinutes: s.duration_minutes || 0,
          linesOfCode: s.loc_changed || 0,
          turns: s.turns || 0,
          skills: s.skills || [],
          filesChanged: Enum.map(s.top_files || [], fn
            %{"path" => p} -> p
            p when is_binary(p) -> p
            _ -> ""
          end)
        }

        # Add agent children if orchestrated
        case s.agent_summary do
          %{"is_orchestrated" => true, "agents" => agents} when is_list(agents) and agents != [] ->
            Map.put(base, :children, Enum.map(agents, fn a ->
              %{
                sessionId: a["role"] || "agent",
                role: a["role"],
                durationMinutes: a["duration_minutes"] || 0,
                linesOfCode: a["loc_changed"] || 0
              }
            end))

          _ ->
            base
        end
      end)

    Jason.encode!(%{sessions: sessions})
  end
end
