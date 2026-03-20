defmodule HeyiAmWeb.Plugs.BearerAuth do
  @moduledoc """
  Extracts a Bearer token from the Authorization header and looks up the user.

  Assigns `conn.assigns.current_user` if a valid token is found.
  Does not halt the connection if no token is present -- downstream
  plugs or controllers should enforce authentication as needed.
  """

  import Plug.Conn

  alias HeyiAm.Accounts

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         %Accounts.User{} = user <- Accounts.get_user_by_api_token(token) do
      assign(conn, :current_user, user)
    else
      _ -> conn
    end
  end
end
