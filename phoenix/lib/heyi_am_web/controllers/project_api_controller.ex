defmodule HeyiAmWeb.ProjectApiController do
  use HeyiAmWeb, :controller

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

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
