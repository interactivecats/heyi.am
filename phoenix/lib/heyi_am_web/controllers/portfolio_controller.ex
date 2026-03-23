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

        display_name = user.display_name || user.username
        project_count = length(projects)
        session_count = Enum.sum(Enum.map(projects, fn p -> p.total_sessions || length(p.shares) end))

        og_description =
          cond do
            user.bio && user.bio != "" ->
              user.bio

            project_count > 0 ->
              "#{project_count} #{if project_count == 1, do: "project", else: "projects"}, " <>
                "#{session_count} AI-assisted coding #{if session_count == 1, do: "session", else: "sessions"}"

            true ->
              "AI-assisted development portfolio on heyi.am"
          end

        render(conn, :show,
          portfolio_user: user,
          projects: build_projects(projects, user.username),
          collab_profile: build_collab_profile(all_shares),
          metrics: build_metrics(all_shares),
          recent_activity: build_recent_activity(all_shares),
          page_title: display_name,
          og_title: "#{display_name} — heyi.am",
          og_description: og_description,
          og_url: HeyiAmWeb.Endpoint.url() <> "/#{user.username}",
          og_type: "profile"
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

            project_detail = build_project_detail(project, user.username)

            display_name = user.display_name || user.username
            og_title = "#{project.title} — #{display_name}"

            og_description =
              cond do
                project.narrative && project.narrative != "" ->
                  String.slice(project.narrative, 0, 200)

                true ->
                  session_count = length(project.shares)
                  skills_text = if (project.skills || []) != [], do: " using #{Enum.join(Enum.take(project.skills, 3), ", ")}", else: ""
                  "#{session_count} AI-assisted coding #{if session_count == 1, do: "session", else: "sessions"}#{skills_text}"
              end

            og_image =
              case screenshot_url(project.screenshot_key, user.username, project.slug) do
                nil -> nil
                path -> HeyiAmWeb.Endpoint.url() <> path
              end

            render(conn, :project,
              portfolio_user: user,
              project: project_detail,
              sessions: sessions,
              page_title: "#{project.title} — #{display_name}",
              og_title: og_title,
              og_description: og_description,
              og_url: HeyiAmWeb.Endpoint.url() <> "/#{user.username}/#{project.slug}",
              og_image: og_image
            )
        end
    end
  end

  def time(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      user ->
        projects = Projects.list_user_projects_with_published_shares(user.id)
        display_name = user.display_name || user.username

        project_stats = build_time_stats(projects)

        totals = %{
          your_minutes: Enum.sum(Enum.map(project_stats, & &1.your_minutes)),
          agent_minutes: Enum.sum(Enum.map(project_stats, & &1.agent_minutes)),
          sessions: Enum.sum(Enum.map(project_stats, & &1.sessions)),
        }

        total_orchestrated = Enum.sum(Enum.map(project_stats, & &1.orchestrated_sessions))
        global_max_parallel = project_stats |> Enum.map(& &1.max_parallel_agents) |> Enum.max(fn -> 0 end)
        all_roles = project_stats |> Enum.flat_map(& &1.unique_roles) |> Enum.uniq()

        multiplier = if totals.your_minutes > 0,
          do: Float.round(totals.agent_minutes / totals.your_minutes, 1),
          else: 1.0

        og_description = "#{display_name} spent #{format_duration(totals.your_minutes)} coding with AI. " <>
          "Agents worked #{format_duration(totals.agent_minutes)} (#{multiplier}x multiplier)."

        render(conn, :time,
          portfolio_user: user,
          project_stats: project_stats,
          totals: totals,
          total_orchestrated: total_orchestrated,
          global_max_parallel: global_max_parallel,
          all_roles: all_roles,
          multiplier: multiplier,
          page_title: "#{display_name} — You / Agents",
          og_title: "#{display_name} — You / Agents · heyi.am",
          og_description: og_description,
          og_url: HeyiAmWeb.Endpoint.url() <> "/#{user.username}/time"
        )
    end
  end

  # -- Private helpers --

  defp build_projects(projects, username) do
    Enum.map(projects, fn project ->
      stats = Projects.Stats.compute_project_stats(project.shares)
      agent_minutes = project.total_agent_duration_minutes || compute_agent_minutes(project.shares)

      %{
        title: project.title,
        slug: project.slug,
        description: project.shares |> List.first() |> then(& &1 && &1.dev_take),
        status: "active",
        skills: project.skills || [],
        session_count: project.total_sessions || stats.total_sessions,
        total_minutes: project.total_duration_minutes || stats.total_duration,
        agent_minutes: agent_minutes,
        loc_changed: format_loc(project.total_loc || stats.total_loc),
        repo_url: project.repo_url,
        project_url: project.project_url,
        screenshot_url: screenshot_url(project.screenshot_key, username, project.slug)
      }
    end)
  end

  defp build_project_detail(project, username) do
    stats = Projects.Stats.compute_project_stats(project.shares)
    total_loc = project.total_loc || stats.total_loc
    agent_minutes = project.total_agent_duration_minutes || compute_agent_minutes(project.shares)

    %{
      title: project.title,
      slug: project.slug,
      narrative: project.narrative,
      repo_url: project.repo_url,
      project_url: project.project_url,
      screenshot_url: screenshot_url(project.screenshot_key, username, project.slug),
      skills: project.skills || [],
      session_count: project.total_sessions || stats.total_sessions,
      uploaded_count: length(project.shares),
      total_minutes: project.total_duration_minutes || stats.total_duration,
      agent_minutes: agent_minutes,
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

  defp build_time_stats(projects) do
    projects
    |> Enum.map(fn project ->
      shares = project.shares
      your_minutes = project.total_duration_minutes || Enum.sum(Enum.map(shares, &(&1.duration_minutes || 0)))
      agent_minutes = project.total_agent_duration_minutes || compute_agent_minutes(shares)

      orchestrated_shares = Enum.filter(shares, fn s ->
        match?(%{"is_orchestrated" => true}, s.agent_summary)
      end)

      max_parallel = orchestrated_shares
        |> Enum.map(fn s ->
          case s.agent_summary do
            %{"agents" => agents} when is_list(agents) -> length(agents)
            _ -> 0
          end
        end)
        |> Enum.max(fn -> 0 end)

      roles = orchestrated_shares
        |> Enum.flat_map(fn s ->
          case s.agent_summary do
            %{"agents" => agents} when is_list(agents) ->
              agents |> Enum.map(& &1["role"]) |> Enum.filter(& &1)
            _ -> []
          end
        end)
        |> Enum.uniq()

      total_child_count = orchestrated_shares
        |> Enum.map(fn s ->
          case s.agent_summary do
            %{"agents" => agents} when is_list(agents) -> length(agents)
            _ -> 0
          end
        end)
        |> Enum.sum()

      session_count = length(shares)
      avg_agents = if session_count > 0,
        do: Float.round(total_child_count / session_count + 1, 1),
        else: 1.0

      %{
        title: project.title,
        slug: project.slug,
        sessions: session_count,
        your_minutes: your_minutes || 0,
        agent_minutes: agent_minutes || 0,
        orchestrated_sessions: length(orchestrated_shares),
        max_parallel_agents: max_parallel,
        avg_agents_per_session: avg_agents,
        unique_roles: roles,
      }
    end)
    |> Enum.filter(& &1.your_minutes > 0)
    |> Enum.sort_by(& &1.agent_minutes, :desc)
  end

  # Agent time = every session's duration (the AI was working the whole time)
  # + child/subagent durations from agent_summary on top.
  defp compute_agent_minutes(shares) do
    # Base: every session had an AI agent working alongside the developer
    session_minutes = Enum.sum(Enum.map(shares, &(&1.duration_minutes || 0)))

    # Plus: subagent work from orchestrated sessions
    child_minutes =
      shares
      |> Enum.map(fn share ->
        case share.agent_summary do
          %{"agents" => agents} when is_list(agents) ->
            Enum.sum(Enum.map(agents, fn a -> a["duration_minutes"] || 0 end))
          _ -> 0
        end
      end)
      |> Enum.sum()

    total = session_minutes + child_minutes
    if total > 0, do: total, else: nil
  end

  defp format_duration(minutes) when minutes >= 60, do: "#{div(minutes, 60)}h"
  defp format_duration(minutes), do: "#{minutes}m"

  defp screenshot_url(nil, _username, _slug), do: nil
  defp screenshot_url("", _username, _slug), do: nil
  defp screenshot_url(_key, username, slug), do: "/api/projects/#{username}/#{slug}/screenshot"

end
