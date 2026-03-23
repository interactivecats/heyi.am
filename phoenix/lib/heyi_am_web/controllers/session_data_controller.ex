defmodule HeyiAmWeb.SessionDataController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Shares
  alias HeyiAm.Projects

  @doc "Proxy a single session's log.json from S3"
  def show(conn, %{"token" => token}) do
    case Shares.get_published_share_by_token_slim(token) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "not_found"})

      share ->
        case fetch_session_json(share.session_storage_key) do
          {:ok, data} ->
            conn
            |> put_resp_header("cache-control", "private, max-age=300")
            |> json(data)

          :error ->
            conn |> put_status(:not_found) |> json(%{error: "session_data_unavailable"})
        end
    end
  end

  @doc "Return lightweight session data for a project's timeline (no S3 fetch needed)"
  def project_sessions(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- HeyiAm.Accounts.get_user_by_username(username),
         project when not is_nil(project) <- Projects.get_project_with_published_shares(user.id, slug) do

      sessions =
        Enum.map(project.shares, fn share ->
          %{
            id: share.token,
            title: share.title || "Untitled session",
            date: share.recorded_at && DateTime.to_iso8601(share.recorded_at),
            endTime: share.end_time && DateTime.to_iso8601(share.end_time),
            durationMinutes: share.duration_minutes || 0,
            wallClockMinutes: share.wall_clock_minutes,
            turns: share.turns || 0,
            linesOfCode: share.loc_changed || 0,
            status: share.status,
            projectName: share.project_name || project.slug,
            rawLog: [],
            skills: share.skills || [],
            source: share.source_tool
          }
        end)

      conn
      |> put_resp_header("cache-control", "private, max-age=300")
      |> json(%{sessions: sessions})
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "not_found"})
    end
  end

  defp fetch_session_json(nil), do: :error
  defp fetch_session_json(key) do
    case HeyiAm.ObjectStorage.get_object(key) do
      {:ok, body} ->
        case Jason.decode(body) do
          {:ok, data} -> {:ok, data}
          _ -> :error
        end
      _ -> :error
    end
  end
end
