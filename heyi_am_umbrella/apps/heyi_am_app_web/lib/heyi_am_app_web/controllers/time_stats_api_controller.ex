defmodule HeyiAmAppWeb.TimeStatsApiController do
  use HeyiAmAppWeb, :controller

  alias HeyiAm.Accounts

  def upload(conn, %{"time_stats" => stats_params}) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Authentication required"})
    else
      user = Accounts.get_user!(user_id)

      time_stats = %{
        "anonymized" => stats_params["anonymized"] || false,
        "projects" => sanitize_projects(stats_params["projects"] || [], stats_params["anonymized"]),
        "totals" => stats_params["totals"] || %{},
        "uploaded_at" => DateTime.utc_now() |> DateTime.to_iso8601()
      }

      case Accounts.update_user_time_stats(user, time_stats) do
        {:ok, _user} ->
          json(conn, %{ok: true, url: "/#{user.username}/time"})

        {:error, _changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Failed to save time stats"})
      end
    end
  end

  defp sanitize_projects(projects, anonymized) when is_list(projects) do
    projects
    |> Enum.with_index(1)
    |> Enum.map(fn {p, idx} ->
      name = if anonymized, do: "Project #{<<64 + idx>>}", else: p["name"] || "Untitled"

      %{
        "name" => name,
        "your_minutes" => p["your_minutes"] || 0,
        "agent_minutes" => p["agent_minutes"] || 0,
        "sessions" => p["sessions"] || 0,
        "orchestrated_sessions" => p["orchestrated_sessions"] || 0,
        "max_parallel_agents" => p["max_parallel_agents"] || 0,
        "avg_agents_per_session" => p["avg_agents_per_session"] || 1,
        "unique_roles" => p["unique_roles"] || []
      }
    end)
  end

  defp sanitize_projects(_, _), do: []
end
