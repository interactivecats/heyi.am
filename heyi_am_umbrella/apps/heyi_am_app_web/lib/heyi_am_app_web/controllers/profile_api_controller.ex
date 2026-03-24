defmodule HeyiAmAppWeb.ProfileApiController do
  use HeyiAmAppWeb, :controller

  alias HeyiAm.Accounts

  def update(conn, %{"profile" => profile_params}) do
    user_id = conn.assigns[:current_user_id]

    if is_nil(user_id) do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Authentication required. Run: heyiam login"})
    else
      user = Accounts.get_user!(user_id)

      case Accounts.update_user_profile(user, profile_params) do
        {:ok, updated_user} ->
          json(conn, %{
            ok: true,
            username: updated_user.username,
            display_name: updated_user.display_name
          })

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

  def update(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: %{code: "MISSING_PROFILE", message: "Missing 'profile' parameter"}})
  end
end
