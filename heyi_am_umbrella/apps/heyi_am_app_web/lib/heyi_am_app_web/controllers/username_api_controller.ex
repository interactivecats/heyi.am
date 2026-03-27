defmodule HeyiAmAppWeb.UsernameApiController do
  use HeyiAmAppWeb, :controller

  alias HeyiAm.Accounts
  alias HeyiAm.Accounts.User

  def check(conn, %{"username" => username}) do
    changeset = Accounts.change_user_username(%User{}, %{username: username})

    if changeset.valid? do
      json(conn, %{available: true})
    else
      reason =
        changeset
        |> Ecto.Changeset.traverse_errors(fn {msg, _opts} -> msg end)
        |> Map.get(:username, ["is not available"])
        |> List.first()

      json(conn, %{available: false, reason: reason})
    end
  end

  def check(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{available: false, reason: "username parameter required"})
  end
end
