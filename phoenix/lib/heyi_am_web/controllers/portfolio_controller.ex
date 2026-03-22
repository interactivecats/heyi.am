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

            render(conn, :project,
              portfolio_user: user,
              project: project_detail,
              sessions: sessions,
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
        loc_changed: format_loc(project.total_loc || stats.total_loc),
        repo_url: project.repo_url,
        project_url: project.project_url,
        screenshot_url: presign_screenshot(project.screenshot_key)
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
      screenshot_url: presign_screenshot(project.screenshot_key),
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

  defp presign_screenshot(nil), do: nil
  defp presign_screenshot(""), do: nil
  defp presign_screenshot(key) do
    case HeyiAm.ObjectStorage.presign_get(key) do
      {:ok, url} -> url
      _ -> nil
    end
  end

end
