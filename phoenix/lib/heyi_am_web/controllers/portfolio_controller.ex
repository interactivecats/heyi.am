defmodule HeyiAmWeb.PortfolioController do
  use HeyiAmWeb, :controller

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
        shares = Enum.map(portfolio_sessions, fn ps -> Map.from_struct(ps.share) end)

        projects = build_projects(shares)
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
        shares = Enum.map(portfolio_sessions, fn ps -> Map.from_struct(ps.share) end)

        project_shares =
          Enum.filter(shares, fn s ->
            slugify(s.project_name) == slug
          end)

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

        render(conn, :project,
          portfolio_user: user,
          project: project,
          sessions: sessions,
          page_title: "#{project.title} — #{user.display_name || user.username}",
          portfolio_layout: user.portfolio_layout || "editorial"
        )
    end
  end

  # -- Private helpers --

  defp build_projects(shares) do
    shares
    |> Enum.group_by(& &1.project_name)
    |> Enum.map(fn {project_name, project_shares} ->
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

    %{
      title: first.project_name || slug,
      slug: slug,
      description: first.dev_take,
      status: "active",
      skills: project_shares |> Enum.flat_map(& (&1.skills || [])) |> Enum.uniq(),
      session_count: stats.total_sessions,
      total_minutes: stats.total_duration,
      files_touched: stats.unique_files,
      loc_changed: format_loc(stats.total_loc),
      dev_take: first.dev_take,
      architecture: first.narrative
    }
  end

  defp format_loc(nil), do: "0"
  defp format_loc(n) when is_integer(n) and n >= 1000, do: "#{Float.round(n / 1000, 1)}k"
  defp format_loc(n) when is_integer(n), do: to_string(n)

  defp format_duration(minutes) when minutes >= 60, do: "#{div(minutes, 60)}h"
  defp format_duration(minutes), do: "#{minutes}m"

  defp slugify(nil), do: ""
  defp slugify(name) do
    name
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s-]/, "")
    |> String.replace(~r/\s+/, "-")
    |> String.trim("-")
  end
end
