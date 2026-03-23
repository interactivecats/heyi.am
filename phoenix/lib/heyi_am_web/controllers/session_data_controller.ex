defmodule HeyiAmWeb.SessionDataController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Shares
  alias HeyiAm.Projects

  import HeyiAmWeb.ShareController, only: [clean_ai_tags: 1]

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
            |> json(clean_session_data(data))

          :error ->
            conn |> put_status(:not_found) |> json(%{error: "session_data_unavailable"})
        end
    end
  end

  @doc "Return session data for a project's visualizations (fetches S3 detail in parallel)"
  def project_sessions(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- HeyiAm.Accounts.get_user_by_username(username),
         project when not is_nil(project) <- Projects.get_project_with_published_shares(user.id, slug) do

      # Fetch S3 session detail in parallel for all shares
      details =
        project.shares
        |> Enum.map(fn share ->
          Task.async(fn -> {share.token, fetch_session_detail(share.session_storage_key)} end)
        end)
        |> Task.await_many(15_000)
        |> Map.new()

      sessions =
        Enum.map(project.shares, fn share ->
          detail = Map.get(details, share.token, %{})

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
            source: share.source_tool,
            cwd: share.cwd,
            filesChanged: detail["filesChanged"] || detail["files_changed"] || [],
            children: detail["children"] || []
          }
        end)

      conn
      |> put_resp_header("cache-control", "private, max-age=300")
      |> json(%{sessions: sessions})
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "not_found"})
    end
  end

  defp fetch_session_detail(nil), do: %{}
  defp fetch_session_detail(key) do
    case HeyiAm.ObjectStorage.get_object(key) do
      {:ok, body} ->
        case Jason.decode(body) do
          {:ok, data} when is_map(data) -> data
          _ -> %{}
        end
      _ -> %{}
    end
  end

  # Clean AI-internal tags from text fields that reach the frontend.
  # Targets turnTimeline content and rawLog entries specifically.
  defp clean_session_data(data) when is_map(data) do
    data
    # Handle both camelCase and snake_case keys from different upload versions
    |> update_if("turnTimeline", &clean_turns/1)
    |> update_if("turn_timeline", &clean_turns/1)
    |> update_if("rawLog", &clean_log_lines/1)
    |> update_if("raw_log", &clean_log_lines/1)
    |> update_if("transcriptExcerpt", &clean_transcript/1)
    |> update_if("transcript_excerpt", &clean_transcript/1)
  end
  defp clean_session_data(data), do: data

  defp clean_turns(turns) do
    turns
    |> Enum.map(fn turn ->
      turn |> update_if("content", &clean_ai_tags/1)
    end)
    |> Enum.reject(fn turn -> (turn["content"] || "") == "" end)
  end

  defp clean_log_lines(lines) do
    lines |> Enum.map(&clean_ai_tags/1) |> Enum.reject(&(&1 == ""))
  end

  defp clean_transcript(entries) do
    entries
    |> Enum.map(fn entry -> update_if(entry, "text", &clean_ai_tags/1) end)
    |> Enum.reject(fn entry -> (entry["text"] || "") == "" end)
  end

  defp update_if(map, key, fun) when is_map(map) do
    case Map.fetch(map, key) do
      {:ok, val} when is_list(val) -> Map.put(map, key, fun.(val))
      _ -> map
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
