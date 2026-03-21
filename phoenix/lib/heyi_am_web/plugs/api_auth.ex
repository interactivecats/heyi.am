defmodule HeyiAmWeb.Plugs.ApiAuth do
  @moduledoc """
  Plug that extracts a Bearer token from the Authorization header and
  assigns `current_user_id` to the connection if the token is valid.

  Does NOT halt on missing/invalid tokens — downstream controllers decide
  whether auth is required.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_user_id_from_token(conn) do
      nil -> conn
      user_id -> assign(conn, :current_user_id, user_id)
    end
  end

  defp get_user_id_from_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] ->
        case HeyiAm.Accounts.get_user_by_session_token(Base.decode64!(token)) do
          {%{id: id}, _inserted_at} -> id
          _ -> nil
        end

      _ ->
        nil
    end
  rescue
    ArgumentError -> nil
  end
end
