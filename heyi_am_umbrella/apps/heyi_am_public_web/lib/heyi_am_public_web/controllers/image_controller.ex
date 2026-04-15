defmodule HeyiAmPublicWeb.ImageController do
  use HeyiAmPublicWeb, :controller

  @safe_image_types ["image/png", "image/jpeg", "image/webp", "image/gif"]
  @max_size 10_000_000

  @doc """
  Serves images by UUID key. The UUID makes the URL unguessable,
  so no auth check is needed — knowing the URL IS the authorization.

  Accepts two shapes:
    /_img/<uuid>.ext                      (flat — project screenshots)
    /_img/users/<user_id>/<uuid>.ext      (user-scoped — profile photos)
  """
  def show(conn, %{"path" => path}) do
    case parse_image_key(path) do
      {:ok, key} -> serve_from_storage(conn, key)
      :error -> conn |> put_status(:not_found) |> text("")
    end
  end

  defp parse_image_key(path) when is_list(path) do
    joined = Enum.join(path, "/")

    cond do
      Regex.match?(~r/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)\z/, joined) ->
        {:ok, "images/#{joined}"}

      Regex.match?(~r/\Ausers\/[a-z0-9][a-z0-9-]{0,38}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)\z/, joined) ->
        {:ok, "images/#{joined}"}

      true ->
        :error
    end
  end

  defp parse_image_key(_), do: :error

  defp serve_from_storage(conn, key) do
    case HeyiAm.ObjectStorage.presign_get(key) do
      {:ok, url} ->
        case Req.get(url, redirect: false) do
          {:ok, %{status: 200, body: body, headers: headers}} ->
            content_type =
              case headers do
                %{"content-type" => [ct | _]} -> ct
                _ -> "image/png"
              end

            if safe_image?(content_type) and byte_size(body) <= @max_size do
              conn
              |> put_resp_header("content-type", content_type)
              |> put_resp_header("cache-control", "public, max-age=31536000, immutable")
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
  end

  defp safe_image?(ct) when is_binary(ct) do
    Enum.any?(@safe_image_types, &String.starts_with?(ct, &1))
  end

  defp safe_image?(_), do: false
end
