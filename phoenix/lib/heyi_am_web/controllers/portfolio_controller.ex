defmodule HeyiAmWeb.PortfolioController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Accounts

  def show(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      user ->
        render(conn, :show,
          portfolio_user: user,
          portfolio_layout: user.portfolio_layout || "editorial"
        )
    end
  end
end
