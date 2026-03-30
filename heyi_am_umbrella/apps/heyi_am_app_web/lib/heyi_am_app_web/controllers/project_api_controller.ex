defmodule HeyiAmAppWeb.ProjectApiController do
  use HeyiAmAppWeb, :controller

  require Logger

  alias HeyiAm.Projects

  def create(conn, %{"project" => project_params}) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Authentication required. Run: heyiam login"})
    else
      case Projects.upsert_project(user_id, project_params) do
        {:ok, project} ->
          conn
          |> put_status(:created)
          |> json(%{project_id: project.id, slug: project.slug})

        {:error, :slug_conflict} ->
          conn
          |> put_status(:conflict)
          |> json(%{error: %{code: "SLUG_CONFLICT", slug: project_params["slug"]}})

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: %{code: "VALIDATION_FAILED", details: format_errors(changeset)}})
      end
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: %{code: "MISSING_PROJECT", message: "Missing 'project' parameter"}})
  end

  def screenshot_url(conn, %{"slug" => slug, "key" => key}) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn |> put_status(:unauthorized) |> json(%{error: "Authentication required"})
    else
      case Projects.get_user_project_by_slug(user_id, slug) do
        nil ->
          conn |> put_status(:not_found) |> json(%{error: "Project not found"})

        _project ->
          if valid_screenshot_key?(key) do
            case HeyiAm.ObjectStorage.presign_put(key) do
              {:ok, url} ->
                json(conn, %{upload_url: url, key: key})

              {:error, reason} ->
                Logger.error("Presign failed for project #{slug}: #{inspect(reason)}")
                conn |> put_status(:internal_server_error) |> json(%{error: "Failed to generate upload URL"})
            end
          else
            conn |> put_status(:bad_request) |> json(%{error: "Invalid image key format"})
          end
      end
    end
  end

  def update_screenshot_key(conn, %{"slug" => slug, "key" => key}) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn |> put_status(:unauthorized) |> json(%{error: "Authentication required"})
    else
      if valid_screenshot_key?(key) do
        case Projects.update_screenshot_key(user_id, slug, key) do
          {:ok, _project} ->
            json(conn, %{ok: true})

          {:error, _reason} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to update screenshot key"})
        end
      else
        conn |> put_status(:bad_request) |> json(%{error: "Invalid screenshot key"})
      end
    end
  end

  defp valid_screenshot_key?(key) do
    Regex.match?(~r/\Aimages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)\z/, key)
  end

  def screenshot(conn, %{"username" => username, "slug" => slug}) do
    user = HeyiAm.Accounts.get_user_by_username(username)

    case user && Projects.get_user_project_by_slug(user.id, slug) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Not found"})

      %{screenshot_key: nil} ->
        conn |> put_status(:not_found) |> json(%{error: "No screenshot"})

      %{screenshot_key: ""} ->
        conn |> put_status(:not_found) |> json(%{error: "No screenshot"})

      %{screenshot_key: key} ->
        case HeyiAm.ObjectStorage.presign_get(key) do
          {:ok, url} ->
            case Req.get(url, redirect: false) do
              {:ok, %{status: 200, body: body, headers: headers}} ->
                content_type =
                  case headers do
                    %{"content-type" => [ct | _]} -> ct
                    _ -> "image/png"
                  end

                cond do
                  not image_content_type?(content_type) ->
                    conn |> put_status(:bad_gateway) |> json(%{error: "Invalid content type"})

                  byte_size(body) > 10_000_000 ->
                    conn |> put_status(:bad_gateway) |> json(%{error: "Response too large"})

                  true ->
                    conn
                    |> put_resp_header("content-type", content_type)
                    |> put_resp_header("cache-control", "public, max-age=86400")
                    |> send_resp(200, body)
                end

              _ ->
                conn |> put_status(:bad_gateway) |> json(%{error: "Storage fetch failed"})
            end

          _ ->
            conn |> put_status(:internal_server_error) |> json(%{error: "Presign failed"})
        end
    end
  end

  # Allowlist safe raster image types — reject SVG (can contain executable JS)
  @safe_image_types ["image/png", "image/jpeg", "image/webp", "image/gif"]

  defp image_content_type?(ct) when is_binary(ct) do
    Enum.any?(@safe_image_types, &String.starts_with?(ct, &1))
  end

  defp image_content_type?(_), do: false


  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
