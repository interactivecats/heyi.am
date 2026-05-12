defmodule HeyiAmAppWeb.ShareApiController do
  use HeyiAmAppWeb, :controller

  require Logger

  alias HeyiAm.Shares
  alias HeyiAm.Shares.Share
  alias HeyiAm.Projects

  def create(conn, %{"session" => session_params}) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Authentication required. Run: heyiam login"})
    else
      token = Shares.generate_token()
      raw_key = "sessions/#{token}/raw.jsonl"
      log_key = "sessions/#{token}/log.json"
      session_key = "sessions/#{token}/session.json"

      status = if session_params["status"] in ~w(listed unlisted), do: session_params["status"], else: "unlisted"

      verified_project_id =
        case session_params["project_id"] do
          nil -> nil
          pid -> Projects.get_user_project(user_id, pid) |> case do
            nil -> nil
            project -> project.id
          end
        end

      attrs =
        session_params
        |> Map.delete("user_id")
        |> Map.delete("project_id")
        |> Map.put("token", token)
        |> Map.put("status", status)
        |> Map.put("raw_storage_key", raw_key)
        |> Map.put("log_storage_key", log_key)
        |> Map.put("session_storage_key", session_key)
        |> Map.put_new("recorded_at", DateTime.utc_now())
        |> Map.put("user_id", user_id)
        |> then(fn a -> if verified_project_id, do: Map.put(a, "project_id", verified_project_id), else: a end)

      existing =
        if verified_project_id && attrs["slug"] do
          Shares.get_share_by_project_slug(verified_project_id, attrs["slug"])
        end

      result =
        case existing do
          %Share{} = share ->
            existing_raw_key = "sessions/#{share.token}/raw.jsonl"
            existing_log_key = "sessions/#{share.token}/log.json"
            existing_session_key = "sessions/#{share.token}/session.json"

            # Preserve existing visibility — don't reset a published session to unlisted
            Shares.update_share(
              share,
              attrs
              |> Map.delete("token")
              |> Map.delete("status")
              |> Map.put("raw_storage_key", existing_raw_key)
              |> Map.put("log_storage_key", existing_log_key)
              |> Map.put("session_storage_key", existing_session_key)
            )

          nil ->
            Shares.create_share(attrs)
        end

      case result do
        {:ok, share} ->
          # Save rendered_html via separate changeset (XSS defense: changeset separation)
          if is_binary(attrs["rendered_html"]) and attrs["rendered_html"] != "" do
            case Shares.update_share_rendered_html(share, %{"rendered_html" => attrs["rendered_html"]}) do
              {:ok, _} -> :ok
              {:error, reason} ->
                Logger.warning("Failed to save rendered_html for share #{share.token}: #{inspect(reason)}")
            end
          end

          actual_token = share.token
          actual_raw_key = share.raw_storage_key || "sessions/#{actual_token}/raw.jsonl"
          actual_log_key = share.log_storage_key || "sessions/#{actual_token}/log.json"
          actual_session_key = share.session_storage_key || "sessions/#{actual_token}/session.json"
          upload_urls = build_upload_urls(actual_raw_key, actual_log_key, actual_session_key)

          response = %{
            token: actual_token,
            url: "/s/#{actual_token}"
          }

          response = if upload_urls, do: Map.put(response, :upload_urls, upload_urls), else: response

          conn
          |> put_status(:created)
          |> json(response)

        {:error, changeset} ->
          errors =
            Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
              Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
                opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
              end)
            end)

          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: %{code: "VALIDATION_FAILED", details: errors}})
      end
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: %{code: "MISSING_SESSION", message: "Missing 'session' parameter"}})
  end

  @doc """
  DELETE /api/sessions/:id — hard-delete a share owned by the authenticated user.

  Two identifier shapes are accepted:

    1. Integer share ID in the path (`/api/sessions/42`) — the original
       contract. Used by anything that already has the DB row id.

    2. Non-integer `:id` (e.g. a client-side UUID) combined with the
       query params `project_id=<int>` and `slug=<string>` — used by the
       CLI, which doesn't get a numeric share id back from POST and
       therefore looks up sessions by (project_id, slug). The path
       segment is ignored in this case but kept for routing.

  Returns opaque 404 if the share does not exist OR is not owned by the
  caller (BOLA protection — do not leak existence). On success, deletes
  S3 artifacts referenced by the share's storage keys on a best-effort
  basis (logged but not fatal) and returns 204 No Content.
  """
  def delete(conn, %{"id" => id} = params) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Authentication required. Run: heyiam login"})
    else
      case resolve_share_for_delete(user_id, id, params) do
        %Share{} = share ->
          delete_s3_artifacts(share)

          case Shares.delete_share(share) do
            {:ok, _} ->
              send_resp(conn, 204, "")

            {:error, reason} ->
              Logger.error("Failed to delete share #{share.id}: #{inspect(reason)}")

              conn
              |> put_status(:internal_server_error)
              |> json(%{error: %{code: "DELETE_FAILED"}})
          end

        nil ->
          conn
          |> put_status(:not_found)
          |> json(%{error: %{code: "NOT_FOUND"}})
      end
    end
  end

  # Resolves a share by either integer ID (legacy) or by (project_id, slug)
  # fallback (used by the CLI, which doesn't get a numeric id back from
  # POST /api/sessions). Returns nil for any lookup that fails — BOLA
  # protection is preserved because Projects.get_user_project verifies
  # ownership before we ever ask Shares.get_share_by_project_slug.
  defp resolve_share_for_delete(user_id, id, params) do
    case Integer.parse(to_string(id)) do
      {parsed_id, ""} ->
        Shares.get_user_share(user_id, parsed_id)

      _ ->
        resolve_share_by_project_slug(user_id, params)
    end
  end

  defp resolve_share_by_project_slug(user_id, %{"project_id" => pid_param, "slug" => slug})
       when is_binary(slug) and slug != "" do
    with {project_id, ""} <- Integer.parse(to_string(pid_param)),
         project when not is_nil(project) <- Projects.get_user_project(user_id, project_id),
         %Share{user_id: share_user_id} = share <-
           Shares.get_share_by_project_slug(project.id, slug),
         true <- share_user_id == user_id do
      share
    else
      _ -> nil
    end
  end

  defp resolve_share_by_project_slug(_user_id, _params), do: nil

  @doc """
  PATCH /api/sessions/bulk-status — update status of all shares for a given project.
  Accepts `{"project_id": <int>, "status": "listed"|"unlisted"}`.
  Only affects shares owned by the authenticated user.
  """
  def bulk_update_status(conn, %{"project_id" => project_id, "status" => status})
      when status in ~w(listed unlisted) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn |> put_status(:unauthorized) |> json(%{error: "Authentication required"})
    else
      case Projects.get_user_project(user_id, project_id) do
        nil ->
          conn |> put_status(:not_found) |> json(%{error: %{code: "PROJECT_NOT_FOUND"}})

        _project ->
          {:ok, count} = Shares.update_project_shares_status(project_id, status)
          json(conn, %{updated: count})
      end
    end
  end

  def bulk_update_status(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: %{code: "INVALID_PARAMS", message: "Requires project_id and status (listed|unlisted)"}})
  end

  defp delete_s3_artifacts(%Share{} = share) do
    for key <- [share.raw_storage_key, share.log_storage_key, share.session_storage_key],
        is_binary(key) and key != "" do
      try do
        case HeyiAm.ObjectStorage.delete_object(key) do
          :ok -> :ok
          {:error, reason} ->
            Logger.warning("Best-effort S3 delete failed for key #{key}: #{inspect(reason)}")
        end
      rescue
        e ->
          Logger.warning("Best-effort S3 delete raised for key #{key}: #{Exception.message(e)}")
      end
    end

    :ok
  end

  defp build_upload_urls(raw_key, log_key, session_key) do
    with {:ok, raw_url} <- HeyiAm.ObjectStorage.presign_put(raw_key),
         {:ok, log_url} <- HeyiAm.ObjectStorage.presign_put(log_key),
         {:ok, session_url} <- HeyiAm.ObjectStorage.presign_put(session_key) do
      %{raw: raw_url, log: log_url, session: session_url}
    else
      _ -> nil
    end
  end
end
