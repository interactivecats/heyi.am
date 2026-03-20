defmodule HeyiAmWeb.ProjectApiController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Projects
  alias HeyiAm.Signature

  require Logger

  plug HeyiAmWeb.Plugs.RateLimit,
       [max_requests: 30, window_ms: 3_600_000] when action in [:sync]

  @doc """
  POST /api/projects/sync

  Accepts Bearer token (preferred) or machine_token + signature.
  """
  def sync(conn, params) do
    bearer_user = conn.assigns[:current_user]
    machine_token = get_req_header(conn, "x-machine-token") |> List.first()
    signature = get_req_header(conn, "x-signature") |> List.first()

    cond do
      bearer_user ->
        do_sync(conn, params, bearer_user.id)

      machine_token && signature ->
        raw_body = conn.assigns[:raw_body] || ""

        case Signature.verify(machine_token, signature, raw_body) do
          :ok ->
            case find_user_by_machine_token(machine_token) do
              nil ->
                conn |> put_status(:unauthorized) |> json(%{error: "No user linked to this machine"})

              user_id ->
                do_sync(conn, params, user_id)
            end

          {:error, _} ->
            conn |> put_status(:unauthorized) |> json(%{error: "Invalid signature"})
        end

      true ->
        conn |> put_status(:unauthorized) |> json(%{error: "Authentication required"})
    end
  end

  defp do_sync(conn, params, user_id) do
    project_key = params["project_key"]

    if is_nil(project_key) or project_key == "" do
      conn |> put_status(:unprocessable_entity) |> json(%{error: "project_key is required"})
    else
      settings = %{
        display_name: params["display_name"],
        description: params["description"],
        visible: params["visible"],
        featured_quote: params["featured_quote"],
        featured_sessions: params["featured_sessions"] || []
      }

      case Projects.sync_project_settings(user_id, project_key, settings) do
        {:ok, project} ->
          json(conn, %{
            project_key: project.project_key,
            display_name: project.display_name,
            visible: project.visible,
            stats: project.stats_cache
          })

        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Failed to sync", details: format_errors(changeset)})
      end
    end
  end

  defp find_user_by_machine_token(machine_token) do
    import Ecto.Query

    HeyiAm.Repo.one(
      from(s in HeyiAm.Shares.Share,
        where: s.machine_token == ^machine_token and not is_nil(s.user_id),
        select: s.user_id,
        limit: 1
      )
    )
  end

  defp format_errors(%Ecto.Changeset{} = changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end

  defp format_errors(_), do: %{}
end
