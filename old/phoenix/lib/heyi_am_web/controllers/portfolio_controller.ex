defmodule HeyiAmWeb.PortfolioController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Accounts
  alias HeyiAm.Portfolios
  alias HeyiAm.Projects

  plug :put_layout, html: false

  def show(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render("404.html")

      user ->
        entries = Portfolios.list_entries(user.id)
        projects = Projects.get_user_projects(user.id)

        current_user = conn.assigns[:current_scope] && conn.assigns.current_scope.user
        is_owner = current_user != nil and current_user.id == user.id

        top_skills =
          entries
          |> Enum.flat_map(fn e -> e.share.skills || [] end)
          |> Enum.frequencies()
          |> Enum.sort_by(fn {_, count} -> -count end)
          |> Enum.take(8)
          |> Enum.map(fn {skill, _} -> skill end)

        accent = user.portfolio_accent || "violet"

        # Build project data with stats for the card grid
        projects_with_stats =
          HeyiAmWeb.PortfolioComponents.build_portfolio_projects(projects,
            filter_visible: true
          )

        conn
        |> put_resp_header("cache-control", "public, max-age=60")
        |> render(:show,
          user: user,
          entries: entries,
          projects: projects_with_stats,
          is_owner: is_owner,
          top_skills: top_skills,
          accent: accent
        )
    end
  end

  def project(conn, %{"username" => username, "project_key" => project_key}) do
    with user when not is_nil(user) <- Accounts.get_user_by_username(username),
         project when not is_nil(project) <- Projects.get_project(user.id, project_key),
         true <- project.visible do
      # Only show shares that are in the portfolio (toggled ON in editor)
      all_shares = Projects.get_project_shares(project.id, user.id)
      portfolio_share_ids =
        Portfolios.list_entries(user.id)
        |> Enum.map(& &1.share_id)
        |> MapSet.new()
      shares = Enum.filter(all_shares, &MapSet.member?(portfolio_share_ids, &1.id))
      cache = project.stats_cache || %{}

      # Compute aggregate stats from shares
      total_turns =
        shares
        |> Enum.map(& &1.turn_count)
        |> Enum.reject(&is_nil/1)
        |> Enum.sum()

      total_tool_calls =
        shares
        |> Enum.map(fn s ->
          get_in(s.summary || %{}, ["toolCallCount"]) || 0
        end)
        |> Enum.sum()

      total_hours =
        case cache["total_duration_minutes"] do
          nil -> 0
          0 -> 0
          mins -> Float.round(mins / 60, 1)
        end

      skills = cache["skills"] || []

      conn
      |> put_resp_header("cache-control", "public, max-age=60")
      |> render(:project,
        user: user,
        project: project,
        shares: shares,
        total_turns: total_turns,
        total_tool_calls: total_tool_calls,
        total_hours: total_hours,
        skills: skills
      )
    else
      _ ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render("404.html")
    end
  end

end
