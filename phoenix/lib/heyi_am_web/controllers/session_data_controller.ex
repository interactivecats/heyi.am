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

  @doc "Return all session data for a project's published sessions"
  def project_sessions(conn, %{"username" => username, "slug" => slug}) do
    with user when not is_nil(user) <- HeyiAm.Accounts.get_user_by_username(username),
         project when not is_nil(project) <- Projects.get_project_with_published_shares(user.id, slug) do

      sessions =
        project.shares
        |> Enum.filter(& &1.session_storage_key)
        |> Task.async_stream(fn share ->
          case fetch_session_json(share.session_storage_key) do
            {:ok, data} -> data
            :error -> nil
          end
        end, max_concurrency: 5, timeout: 10_000)
        |> Enum.flat_map(fn
          {:ok, data} when not is_nil(data) -> [data]
          _ -> []
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
