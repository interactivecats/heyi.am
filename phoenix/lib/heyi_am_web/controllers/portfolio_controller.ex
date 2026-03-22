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

            project_detail = build_project_detail(project)
            work_timeline_json = build_work_timeline_json(project.shares)
            growth_chart_json = build_growth_chart_json(project.shares, project_detail)
            heatmap_json = build_heatmap_json(project.shares, project)

            render(conn, :project,
              portfolio_user: user,
              project: project_detail,
              sessions: sessions,
              work_timeline_json: work_timeline_json,
              growth_chart_json: growth_chart_json,
              heatmap_json: heatmap_json,
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
    total_loc = project.total_loc || stats.total_loc

    %{
      title: project.title,
      slug: project.slug,
      narrative: project.narrative,
      repo_url: project.repo_url,
      project_url: project.project_url,
      skills: project.skills || [],
      session_count: project.total_sessions || stats.total_sessions,
      uploaded_count: length(project.shares),
      total_minutes: project.total_duration_minutes || stats.total_duration,
      total_files: project.total_files_changed || stats.unique_files,
      total_loc: total_loc,
      loc_display: format_loc(total_loc),
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

  defp format_duration(minutes) when minutes >= 60, do: "#{div(minutes, 60)}h"
  defp format_duration(minutes), do: "#{minutes}m"

  # Serialize shares for GrowthChart React component
  defp build_growth_chart_json(shares, project_detail) do
    sessions = build_session_json(shares)

    Jason.encode!(%{
      sessions: sessions,
      totalLoc: project_detail.total_loc,
      totalFiles: project_detail.total_files
    })
  end

  # Serialize shares for DirectoryHeatmap React component
  defp build_heatmap_json(shares, _project) do
    sessions = build_session_json(shares)

    # Use cwd from the first share that has one — this is the real project root
    dir_name =
      shares
      |> Enum.find_value("", fn s -> s.cwd end)

    Jason.encode!(%{
      sessions: sessions,
      projectDirName: dir_name
    })
  end

  # Shared session serialization for all React islands
  defp build_session_json(shares) do
    shares
    |> Enum.filter(& &1.recorded_at)
    |> Enum.sort_by(&DateTime.to_unix(&1.recorded_at, :millisecond))
    |> Enum.map(&share_to_session_json/1)
  end

  defp share_to_session_json(s) do
    dur = s.duration_minutes || 0

    end_time =
      cond do
        s.end_time -> DateTime.to_iso8601(s.end_time)
        s.recorded_at -> DateTime.add(s.recorded_at, dur * 60, :second) |> DateTime.to_iso8601()
        true -> nil
      end

    base = %{
      id: s.token,
      title: s.title || "",
      date: DateTime.to_iso8601(s.recorded_at),
      endTime: end_time,
      durationMinutes: dur,
      wallClockMinutes: s.wall_clock_minutes,
      cwd: s.cwd,
      linesOfCode: s.loc_changed || 0,
      turns: s.turns || 0,
      skills: s.skills || [],
      filesChanged: Enum.map(s.top_files || [], fn
        %{"path" => p} -> %{path: p, additions: 0, deletions: 0}
        p when is_binary(p) -> %{path: p, additions: 0, deletions: 0}
        %{"path" => p, "additions" => a, "deletions" => d} -> %{path: p, additions: a, deletions: d}
        _ -> %{path: "", additions: 0, deletions: 0}
      end),
      turnTimeline: Enum.map(s.turn_timeline || [], fn t ->
        %{
          timestamp: t["timestamp"] || "",
          type: t["type"] || "response",
          content: t["content"] || "",
          tools: t["tools"] || []
        }
      end),
      status: s.status || "listed",
      projectName: s.project_name || "",
      rawLog: []
    }

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
      _ -> base
    end
  end

  # All React islands use the same session JSON shape
  defp build_work_timeline_json(shares) do
    Jason.encode!(%{sessions: build_session_json(shares)})
  end
end
