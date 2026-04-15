defmodule HeyiAmAppWeb.PortfolioApiController do
  @moduledoc """
  Accepts the rendered portfolio HTML fragment from the CLI publish flow.

  Body shape:
      {
        "html": "<body data-template=\"editorial\" ...>...</body>",
        "profile": { ...optional profile snapshot... }
      }

  The HTML is sanitized by `HeyiAm.HtmlSanitizer` via the user's
  `rendered_html_changeset` before it is persisted. The optional profile
  snapshot, when present, is applied via `Accounts.update_user_profile/2`
  so the public portfolio page's surrounding chrome (name, bio, links)
  stays in sync with the rendered fragment.
  """

  use HeyiAmAppWeb, :controller

  alias HeyiAm.Accounts

  # Keep an upper bound on the HTML payload to stop a runaway client from
  # DoS'ing the DB column.
  @max_html_bytes 20 * 1024 * 1024

  def upload(conn, %{"html" => html} = params) when is_binary(html) do
    user_id = conn.assigns[:current_user_id]

    cond do
      is_nil(user_id) ->
        unauthorized(conn)

      byte_size(html) > @max_html_bytes ->
        conn
        |> put_status(:request_entity_too_large)
        |> json(%{
          error: %{
            code: "HTML_TOO_LARGE",
            message: "Portfolio HTML exceeds #{@max_html_bytes} bytes"
          }
        })

      true ->
        user = Accounts.get_user!(user_id)

        with {:ok, user} <- maybe_update_profile(user, params["profile"]),
             {:ok, user} <- Accounts.update_user_rendered_portfolio_html(user, html),
             {:ok, user} <- maybe_clear_profile_photo(user, params["has_photo"]) do
          json(conn, %{ok: true, username: user.username})
        else
          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: %{code: "VALIDATION_FAILED", details: format_errors(changeset)}})
        end
    end
  end

  # When the client indicates the profile has no photo but the user still
  # has photo keys on file, clear them (and delete the S3 objects) so
  # unpublished/removed photos don't linger. `has_photo: true` and the
  # field being absent are both no-ops — a separate endpoint handles the
  # actual photo upload.
  defp maybe_clear_profile_photo(user, false) do
    if is_nil(user.profile_photo_key) and is_nil(user.profile_photo_small_key) do
      {:ok, user}
    else
      Accounts.update_user_profile_photo_keys(user, nil, nil)
    end
  end
  defp maybe_clear_profile_photo(user, _), do: {:ok, user}

  def upload(conn, _params) do
    if is_nil(conn.assigns[:current_user_id]) do
      unauthorized(conn)
    else
      conn
      |> put_status(:bad_request)
      |> json(%{error: %{code: "MISSING_HTML", message: "Missing 'html' parameter"}})
    end
  end

  @max_upload_bytes 10 * 1024 * 1024
  @full_max_dim 1200
  @small_max_dim 600
  @full_quality 90
  @small_quality 85

  @doc """
  Accepts a base64-encoded profile photo, resizes it into a full-size
  variant (fit within 1200×1200) and a small OG variant (fit within 600×600),
  uploads both to R2 under `images/users/:user_id/…`, and updates the user
  record to reference both keys. The previous S3 objects are deleted
  best-effort after the DB write.
  """
  def upload_profile_photo(conn, %{"photo" => data_url}) when is_binary(data_url) do
    case conn.assigns[:current_user_id] do
      nil -> unauthorized(conn)
      user_id ->
        user = Accounts.get_user!(user_id)

        with {:ok, bytes} <- decode_data_url(data_url),
             :ok <- check_size(bytes),
             {:ok, full_bytes, small_bytes} <- resize_variants(bytes),
             full_key = build_key(user.username, "jpg"),
             small_key = build_key(user.username, "jpg"),
             :ok <- upload_bytes(full_key, full_bytes, "image/jpeg"),
             :ok <- upload_bytes(small_key, small_bytes, "image/jpeg"),
             {:ok, _user} <- Accounts.update_user_profile_photo_keys(user, full_key, small_key) do
          json(conn, %{
            full_key: full_key,
            small_key: small_key,
            full_url: image_url(full_key),
            small_url: image_url(small_key)
          })
        else
          {:error, :invalid_data_url} ->
            bad_request(conn, "Invalid photo payload")

          {:error, :too_large} ->
            conn
            |> put_status(:request_entity_too_large)
            |> json(%{error: %{code: "PHOTO_TOO_LARGE", message: "Photo exceeds #{@max_upload_bytes} bytes"}})

          {:error, :resize_failed} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: %{code: "RESIZE_FAILED"}})

          {:error, :upload_failed} ->
            conn
            |> put_status(:bad_gateway)
            |> json(%{error: %{code: "UPLOAD_FAILED"}})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: %{code: "VALIDATION_FAILED", details: format_errors(changeset)}})
        end
    end
  end

  def upload_profile_photo(conn, _), do: bad_request(conn, "Missing 'photo' parameter")

  # ── Helpers ─────────────────────────────────────────────────────

  defp decode_data_url(url) do
    case Regex.run(~r/^data:image\/(png|jpe?g|webp);base64,(.+)$/i, url) do
      [_, _ext, payload] ->
        case Base.decode64(payload, padding: false) |> fallback_decode(payload) do
          {:ok, bytes} -> {:ok, bytes}
          :error -> {:error, :invalid_data_url}
        end

      _ ->
        {:error, :invalid_data_url}
    end
  end

  defp fallback_decode(:error, payload), do: Base.decode64(payload)
  defp fallback_decode(ok, _payload), do: ok

  defp check_size(bytes) when byte_size(bytes) > @max_upload_bytes, do: {:error, :too_large}
  defp check_size(_), do: :ok

  defp resize_variants(bytes) do
    with {:ok, image} <- Image.from_binary(bytes),
         {:ok, full} <- fit_and_encode(image, @full_max_dim, @full_quality),
         {:ok, small} <- fit_and_encode(image, @small_max_dim, @small_quality) do
      {:ok, full, small}
    else
      _ -> {:error, :resize_failed}
    end
  end

  # Fit image within a bounding box preserving aspect ratio (no upscale),
  # then re-encode as JPEG at the given quality.
  defp fit_and_encode(image, max_dim, quality) do
    width = Image.width(image)
    height = Image.height(image)
    longest = max(width, height)
    scale = min(max_dim / longest, 1.0)

    with {:ok, resized} <- maybe_resize(image, scale),
         {:ok, jpeg} <- Image.write(resized, :memory, suffix: ".jpg", quality: quality) do
      {:ok, jpeg}
    end
  end

  defp maybe_resize(image, scale) when scale >= 1.0, do: {:ok, image}
  defp maybe_resize(image, scale), do: Image.resize(image, scale)

  defp build_key(username, ext) when is_binary(username) do
    "images/users/#{username}/#{Ecto.UUID.generate()}.#{ext}"
  end

  defp upload_bytes(key, bytes, content_type) do
    with {:ok, url} <- HeyiAm.ObjectStorage.presign_put(key),
         {:ok, %{status: status}} when status in 200..299 <-
           Req.put(url, body: bytes, headers: [{"content-type", content_type}]) do
      :ok
    else
      _ -> {:error, :upload_failed}
    end
  end

  defp image_url(key) do
    public_url() <> "/_img/" <> String.replace_prefix(key, "images/", "")
  end

  defp public_url do
    Application.get_env(:heyi_am_public_web, HeyiAmPublicWeb.Endpoint, [])
    |> Keyword.get(:url, [])
    |> case do
      opts when is_list(opts) ->
        scheme = Keyword.get(opts, :scheme, "https")
        host = Keyword.get(opts, :host, "heyi.am")
        "#{scheme}://#{host}"

      _ ->
        "https://heyi.am"
    end
  end

  defp bad_request(conn, msg) do
    case conn.assigns[:current_user_id] do
      nil -> unauthorized(conn)
      _ ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: %{code: "BAD_REQUEST", message: msg}})
    end
  end

  defp maybe_update_profile(user, nil), do: {:ok, user}
  defp maybe_update_profile(user, profile) when is_map(profile) do
    Accounts.update_user_profile(user, profile)
  end
  defp maybe_update_profile(user, _other), do: {:ok, user}

  defp unauthorized(conn) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: %{code: "UNAUTHORIZED", message: "Authentication required. Run: heyiam login"}})
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
