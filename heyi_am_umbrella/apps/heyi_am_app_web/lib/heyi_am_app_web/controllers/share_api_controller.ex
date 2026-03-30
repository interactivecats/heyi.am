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
