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
             {:ok, user} <- Accounts.update_user_rendered_portfolio_html(user, html) do
          json(conn, %{ok: true, username: user.username})
        else
          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: %{code: "VALIDATION_FAILED", details: format_errors(changeset)}})
        end
    end
  end

  def upload(conn, _params) do
    if is_nil(conn.assigns[:current_user_id]) do
      unauthorized(conn)
    else
      conn
      |> put_status(:bad_request)
      |> json(%{error: %{code: "MISSING_HTML", message: "Missing 'html' parameter"}})
    end
  end

  @photo_key_pattern ~r/\Aimages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)\z/

  def profile_photo_upload_url(conn, %{"key" => key}) when is_binary(key) do
    case conn.assigns[:current_user_id] do
      nil -> unauthorized(conn)
      _user_id ->
        if Regex.match?(@photo_key_pattern, key) do
          case HeyiAm.ObjectStorage.presign_put(key) do
            {:ok, url} -> json(conn, %{upload_url: url, key: key})
            {:error, _} ->
              conn
              |> put_status(:internal_server_error)
              |> json(%{error: %{code: "PRESIGN_FAILED"}})
          end
        else
          conn
          |> put_status(:bad_request)
          |> json(%{error: %{code: "INVALID_KEY", message: "Invalid image key format"}})
        end
    end
  end

  def profile_photo_upload_url(conn, _), do: bad_request(conn, "Missing 'key' parameter")

  def update_profile_photo_key(conn, %{"key" => key}) when is_binary(key) do
    case conn.assigns[:current_user_id] do
      nil -> unauthorized(conn)
      user_id ->
        user = Accounts.get_user!(user_id)

        case Accounts.update_user_profile_photo_key(user, key) do
          {:ok, _user} -> json(conn, %{ok: true})
          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: %{code: "VALIDATION_FAILED", details: format_errors(changeset)}})
        end
    end
  end

  def update_profile_photo_key(conn, _), do: bad_request(conn, "Missing 'key' parameter")

  def delete_profile_photo(conn, _params) do
    case conn.assigns[:current_user_id] do
      nil -> unauthorized(conn)
      user_id ->
        user = Accounts.get_user!(user_id)

        case Accounts.update_user_profile_photo_key(user, nil) do
          {:ok, _user} -> json(conn, %{ok: true})
          {:error, _changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: %{code: "DELETE_FAILED"}})
        end
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
