defmodule HeyiAmPublicWeb.PortfolioController do
  use HeyiAmPublicWeb, :controller

  alias HeyiAm.Accounts
  alias HeyiAm.Projects

  # Extract template name from data-template="..." in rendered HTML
  defp extract_template(html) when is_binary(html) do
    case Regex.run(~r/data-template="([^"]+)"/, html) do
      [_, name] -> name
      _ -> "editorial"
    end
  end
  defp extract_template(_), do: "editorial"

  def show(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmPublicWeb.ErrorHTML)
        |> render(:"404")

      user ->
        display_name = user.display_name || user.username

        og_description =
          if user.bio && user.bio != "",
            do: user.bio,
            else: "AI-assisted development portfolio on heyi.am"

        case user.rendered_portfolio_html do
          html when is_binary(html) and html != "" ->
            render(conn, :rendered,
              rendered_html: html,
              template_name: extract_template(html),
              page_title: display_name,
              og_title: "#{display_name} — heyi.am",
              og_description: og_description,
              og_url: HeyiAmPublicWeb.Endpoint.url() <> "/#{user.username}",
              og_type: "profile"
            )

          _ ->
            projects =
              Projects.list_user_projects_with_published_shares(user.id)
              |> Enum.filter(fn p -> p.rendered_html && p.shares != [] end)

            total_sessions = projects |> Enum.map(&(&1.total_sessions || length(&1.shares))) |> Enum.sum()
            total_lines = projects |> Enum.map(&(&1.total_loc || 0)) |> Enum.sum()

            render(conn, :portfolio,
              portfolio_user: user,
              projects: projects,
              total_sessions: total_sessions,
              total_lines: total_lines,
              page_title: display_name,
              og_title: "#{display_name} — heyi.am",
              og_description: og_description,
              og_url: HeyiAmPublicWeb.Endpoint.url() <> "/#{user.username}",
              og_type: "profile"
            )
        end
    end
  end

  def project(conn, %{"username" => username, "project" => slug}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmPublicWeb.ErrorHTML)
        |> render(:"404")

      user ->
        case Projects.get_project_with_published_shares(user.id, slug) do
          nil ->
            conn
            |> put_status(:not_found)
            |> put_view(HeyiAmPublicWeb.ErrorHTML)
            |> render(:"404")

          %{shares: []} ->
            conn
            |> put_status(:not_found)
            |> put_view(HeyiAmPublicWeb.ErrorHTML)
            |> render(:"404")

          project ->
            display_name = user.display_name || user.username
            og_title = "#{project.title} — #{display_name}"

            og_description =
              if project.narrative && project.narrative != "",
                do: String.slice(project.narrative, 0, 200),
                else: "AI-assisted development project on heyi.am"

            case project.rendered_html do
              html when is_binary(html) and html != "" ->
                render(conn, :rendered,
                  rendered_html: html,
                  template_name: extract_template(html),
                  page_title: "#{project.title} — #{display_name}",
                  og_title: og_title,
                  og_description: og_description,
                  og_url:
                    HeyiAmPublicWeb.Endpoint.url() <>
                      "/#{user.username}/#{project.slug}"
                )

              _ ->
                conn
                |> put_status(:not_found)
                |> put_view(HeyiAmPublicWeb.ErrorHTML)
                |> render(:"404")
            end
        end
    end
  end

  def unlisted_project(conn, %{"token" => token}) do
    case Projects.get_project_by_unlisted_token(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmPublicWeb.ErrorHTML)
        |> render(:"404")

      %{shares: []} ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmPublicWeb.ErrorHTML)
        |> render(:"404")

      project ->
        user = project.user
        display_name = user.display_name || user.username
        og_title = "#{project.title} — #{display_name}"

        og_description =
          if project.narrative && project.narrative != "",
            do: String.slice(project.narrative, 0, 200),
            else: "AI-assisted development project on heyi.am"

        case project.rendered_html do
          html when is_binary(html) and html != "" ->
            render(conn, :rendered,
              rendered_html: html,
              template_name: extract_template(html),
              page_title: "#{project.title} — #{display_name}",
              og_title: og_title,
              og_description: og_description,
              og_url: HeyiAmPublicWeb.Endpoint.url() <> "/p/#{token}"
            )

          _ ->
            conn
            |> put_status(:not_found)
            |> put_view(HeyiAmPublicWeb.ErrorHTML)
            |> render(:"404")
        end
    end
  end

  @safe_image_types ["image/png", "image/jpeg", "image/webp", "image/gif"]

  def screenshot(conn, %{"username" => username, "project" => slug}) do
    user = Accounts.get_user_by_username(username)

    case user && Projects.get_project_with_accessible_shares(user.id, slug) do
      nil ->
        conn |> put_status(:not_found) |> text("")

      %{screenshot_key: key} when is_binary(key) and key != "" ->
        case HeyiAm.ObjectStorage.presign_get(key) do
          {:ok, url} ->
            case Req.get(url, redirect: false) do
              {:ok, %{status: 200, body: body, headers: headers}} ->
                content_type =
                  case headers do
                    %{"content-type" => [ct | _]} -> ct
                    _ -> "image/png"
                  end

                if Enum.any?(@safe_image_types, &String.starts_with?(content_type, &1)) and
                     byte_size(body) <= 10_000_000 do
                  conn
                  |> put_resp_header("content-type", content_type)
                  |> put_resp_header("cache-control", "public, max-age=86400")
                  |> put_resp_header("x-content-type-options", "nosniff")
                  |> send_resp(200, body)
                else
                  conn |> put_status(:not_found) |> text("")
                end

              _ ->
                conn |> put_status(:not_found) |> text("")
            end

          _ ->
            conn |> put_status(:not_found) |> text("")
        end

      _ ->
        conn |> put_status(:not_found) |> text("")
    end
  end

  def time(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmPublicWeb.ErrorHTML)
        |> render(:"404")

      user ->
        display_name = user.display_name || user.username

        project_stats =
          case user.time_stats do
            %{"projects" => stored} when is_list(stored) and stored != [] ->
              Enum.map(stored, fn p ->
                %{
                  title: p["name"],
                  slug: nil,
                  sessions: p["sessions"] || 0,
                  your_minutes: p["your_minutes"] || 0,
                  agent_minutes: p["agent_minutes"] || 0,
                  orchestrated_sessions: p["orchestrated_sessions"] || 0,
                  max_parallel_agents: p["max_parallel_agents"] || 0,
                  avg_agents_per_session: p["avg_agents_per_session"] || 1,
                  unique_roles: p["unique_roles"] || []
                }
              end)

            _ ->
              projects = Projects.list_user_projects_with_published_shares(user.id)
              build_time_stats(projects)
          end

        totals = %{
          your_minutes: Enum.sum(Enum.map(project_stats, & &1.your_minutes)),
          agent_minutes: Enum.sum(Enum.map(project_stats, & &1.agent_minutes)),
          sessions: Enum.sum(Enum.map(project_stats, & &1.sessions))
        }

        total_orchestrated = Enum.sum(Enum.map(project_stats, & &1.orchestrated_sessions))

        global_max_parallel =
          project_stats |> Enum.map(& &1.max_parallel_agents) |> Enum.max(fn -> 0 end)

        all_roles = project_stats |> Enum.flat_map(& &1.unique_roles) |> Enum.uniq()

        multiplier =
          if totals.your_minutes > 0,
            do: Float.round(totals.agent_minutes / totals.your_minutes, 1),
            else: 1.0

        og_description =
          "#{display_name} spent #{format_duration(totals.your_minutes)} coding with AI. " <>
            "Agents worked #{format_duration(totals.agent_minutes)} (#{multiplier}x multiplier)."

        render(conn, :time,
          portfolio_user: user,
          project_stats: project_stats,
          totals: totals,
          total_orchestrated: total_orchestrated,
          global_max_parallel: global_max_parallel,
          all_roles: all_roles,
          multiplier: multiplier,
          page_title: "#{display_name} — Human / Agents",
          og_title: "#{display_name} — Human / Agents · heyi.am",
          og_description: og_description,
          og_url: HeyiAmPublicWeb.Endpoint.url() <> "/#{user.username}/time"
        )
    end
  end

  # -- Private helpers --

  defp build_time_stats(projects) do
    projects
    |> Enum.map(fn project ->
      shares = project.shares

      your_minutes =
        project.total_duration_minutes ||
          Enum.sum(Enum.map(shares, &(&1.duration_minutes || 0)))

      agent_minutes =
        project.total_agent_duration_minutes || compute_agent_minutes(your_minutes, shares)

      orchestrated_shares =
        Enum.filter(shares, fn s ->
          match?(%{"is_orchestrated" => true}, s.agent_summary)
        end)

      max_parallel =
        orchestrated_shares
        |> Enum.map(fn s ->
          case s.agent_summary do
            %{"agents" => agents} when is_list(agents) -> length(agents)
            _ -> 0
          end
        end)
        |> Enum.max(fn -> 0 end)

      roles =
        orchestrated_shares
        |> Enum.flat_map(fn s ->
          case s.agent_summary do
            %{"agents" => agents} when is_list(agents) ->
              agents |> Enum.map(& &1["role"]) |> Enum.filter(& &1)

            _ ->
              []
          end
        end)
        |> Enum.uniq()

      total_child_count =
        orchestrated_shares
        |> Enum.map(fn s ->
          case s.agent_summary do
            %{"agents" => agents} when is_list(agents) -> length(agents)
            _ -> 0
          end
        end)
        |> Enum.sum()

      session_count = project.total_sessions || length(shares)

      avg_agents =
        if session_count > 0,
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
        unique_roles: roles
      }
    end)
    |> Enum.filter(& &1.your_minutes > 0)
    |> Enum.sort_by(& &1.agent_minutes, :desc)
  end

  defp compute_agent_minutes(your_minutes, shares) do
    child_minutes =
      shares
      |> Enum.map(fn share ->
        case share.agent_summary do
          %{"agents" => agents} when is_list(agents) ->
            Enum.sum(Enum.map(agents, fn a -> a["duration_minutes"] || 0 end))

          _ ->
            0
        end
      end)
      |> Enum.sum()

    total = (your_minutes || 0) + child_minutes
    if total > 0, do: total, else: nil
  end

  defp format_duration(minutes) when minutes >= 60, do: "#{div(minutes, 60)}h"
  defp format_duration(minutes), do: "#{minutes}m"
end
