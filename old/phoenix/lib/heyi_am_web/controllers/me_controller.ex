defmodule HeyiAmWeb.MeController do
  use HeyiAmWeb, :controller

  def show(conn, _params) do
    case conn.assigns[:current_user] do
      nil ->
        conn |> put_status(:unauthorized) |> json(%{error: "Not authenticated"})

      user ->
        json(conn, %{
          username: user.username,
          email: user.email,
          display_name: user.display_name
        })
    end
  end
end
