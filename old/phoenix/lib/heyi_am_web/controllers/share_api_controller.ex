defmodule HeyiAmWeb.ShareApiController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Shares
  alias HeyiAm.Storage
  alias HeyiAm.Signature

  require Logger

  plug HeyiAmWeb.Plugs.RateLimit,
       [max_requests: 30, window_ms: 3_600_000] when action in [:create]

  plug HeyiAmWeb.Plugs.RateLimit,
       [max_requests: 20, window_ms: 3_600_000] when action in [:upload_image]

  def create(conn, params) do
    bearer_user = conn.assigns[:current_user]
    machine_token = get_req_header(conn, "x-machine-token") |> List.first()
    signature = get_req_header(conn, "x-signature") |> List.first()

    cond do
      # Bearer token auth takes priority — skip signature check
      bearer_user ->
        do_create(conn, params, machine_token)

      machine_token && signature ->
        raw_body = conn.assigns[:raw_body] || ""

        case Signature.verify(machine_token, signature, raw_body) do
          :ok ->
            do_create(conn, params, machine_token)

          {:error, reason} ->
            conn
            |> put_status(:unauthorized)
            |> json(%{error: "Invalid signature", reason: to_string(reason)})
        end

      machine_token && is_nil(signature) ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Signature required when machine_token is present"})

      true ->
        do_create(conn, params, nil)
    end
  end

  defp do_create(conn, params, machine_token) do
    # Use Bearer-authenticated user if available, otherwise resolve from machine_token
    bearer_user_id = case conn.assigns[:current_user] do
      %{id: id} -> id
      _ -> nil
    end

    attrs = %{
      title: params["title"] || "Shared Session",
      one_line_summary: params["one_line_summary"],
      narrative: params["narrative"],
      summary: params["summary"],
      skills: params["skills"] || [],
      context: params["context"],
      developer_take: params["developer_take"] || params["annotation"],
      source_tool: params["source_tool"] || "claude-code",
      project_name: params["project_name"],
      duration_minutes: params["duration_minutes"],
      turn_count: params["turn_count"],
      step_count: params["step_count"],
      session_month: params["session_month"],
      hero_image_url: params["hero_image_url"],
      result_url: params["result_url"],
      machine_token: machine_token,
      session_id: params["session_id"],
      user_id: bearer_user_id
    }

    case Shares.upsert_share(attrs) do
      {:ok, share, status} ->
        canonical_url = "#{HeyiAmWeb.Endpoint.url()}/s/#{share.token}"
        linked = not is_nil(share.user_id)

        response = %{
          url: canonical_url,
          delete_token: share.delete_token,
          token: share.token,
          status: status,
          shared_at: share.updated_at,
          linked: linked
        }

        response =
          if not linked and is_binary(machine_token) do
            link_url = "#{HeyiAmWeb.Endpoint.url()}/auth/github?machine_token=#{machine_token}"
            Map.put(response, :link_url, link_url)
          else
            response
          end

        conn
        |> put_status(if(status == :created, do: :created, else: :ok))
        |> json(response)

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create share", details: inspect(changeset.errors)})
    end
  end

  def verify(conn, %{"token" => token}) do
    case Shares.get_by_token(token) do
      nil ->
        conn |> put_status(:not_found) |> json(%{exists: false})

      share ->
        json(conn, %{
          exists: true,
          token: share.token,
          title: share.title,
          url: "#{HeyiAmWeb.Endpoint.url()}/s/#{share.token}",
          created_at: share.inserted_at,
          updated_at: share.updated_at
        })
    end
  end

  def delete(conn, %{"token" => token}) do
    delete_token = get_req_header(conn, "x-delete-token") |> List.first()

    if is_nil(delete_token) do
      conn |> put_status(:unauthorized) |> json(%{error: "Delete token required"})
    else
      case Shares.delete_share_by_token(token, delete_token) do
        {:ok, _share} ->
          json(conn, %{deleted: true})

        {:error, :not_found} ->
          conn |> put_status(:not_found) |> json(%{error: "Not found"})

        {:error, :forbidden} ->
          conn |> put_status(:forbidden) |> json(%{error: "Invalid delete token"})
      end
    end
  end

  def seal(conn, %{"token" => token}) do
    case conn.assigns[:current_user] do
      nil ->
        conn |> put_status(:unauthorized) |> json(%{error: "Authentication required"})

      user ->
        case Shares.get_by_token(token) do
          nil ->
            conn |> put_status(:not_found) |> json(%{error: "Not found"})

          %{user_id: uid} when uid != user.id ->
            conn |> put_status(:forbidden) |> json(%{error: "Not authorized"})

          share ->
            case Shares.seal_share(share) do
              {:ok, sealed} ->
                json(conn, %{
                  sealed_at: sealed.sealed_at,
                  seal_signature: sealed.seal_signature
                })

              {:error, :already_sealed} ->
                conn |> put_status(:conflict) |> json(%{error: "Already sealed"})

              {:error, changeset} ->
                conn
                |> put_status(:unprocessable_entity)
                |> json(%{error: "Failed to seal", details: inspect(changeset.errors)})
            end
        end
    end
  end

  @allowed_image_types ~w(.jpg .jpeg .png .gif .webp)
  @max_image_size 5_000_000

  def upload_image(conn, %{"image" => %Plug.Upload{} = upload}) do
    if is_nil(conn.assigns[:current_user]) do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Authentication required"})
      |> halt()
    else
      ext = Path.extname(upload.filename) |> String.downcase()

      with true <- ext in @allowed_image_types,
           {:ok, binary} <- File.read(upload.path),
           true <- byte_size(binary) <= @max_image_size do
        content_type = ext_to_content_type(ext)
        name = :crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)
        path = "images/#{name}#{ext}"

        case Storage.upload_image(path, binary, content_type) do
          {:ok, url} ->
            json(conn, %{url: url})

          {:error, reason} ->
            conn |> put_status(500) |> json(%{error: "Upload failed", reason: inspect(reason)})
        end
      else
        false ->
          conn
          |> put_status(400)
          |> json(%{error: "File too large or unsupported type", max_size_mb: 5})

        {:error, _} ->
          conn |> put_status(400) |> json(%{error: "Could not read uploaded file"})
      end
    end
  end

  def upload_image(conn, _params) do
    conn |> put_status(400) |> json(%{error: "Missing 'image' file in request"})
  end

  defp ext_to_content_type(".jpg"), do: "image/jpeg"
  defp ext_to_content_type(".jpeg"), do: "image/jpeg"
  defp ext_to_content_type(".png"), do: "image/png"
  defp ext_to_content_type(".gif"), do: "image/gif"
  defp ext_to_content_type(".webp"), do: "image/webp"
  defp ext_to_content_type(_), do: "application/octet-stream"

end
