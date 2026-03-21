defmodule HeyiAmWeb.DeviceApiController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Accounts

  @verification_uri_path "/device"

  def create_code(conn, _params) do
    {raw_device_code, device_code} = Accounts.create_device_code()

    json(conn, %{
      device_code: Base.encode64(raw_device_code),
      user_code: device_code.user_code,
      verification_uri: verification_uri(device_code.user_code),
      expires_in: DateTime.diff(device_code.expires_at, DateTime.utc_now()),
      interval: 5
    })
  end

  def poll_token(conn, %{"device_code" => encoded_device_code}) do
    case Base.decode64(encoded_device_code) do
      {:ok, raw_device_code} ->
        case Accounts.poll_device_code(raw_device_code) do
          {:ok, {token, user}} ->
            json(conn, %{
              access_token: Base.encode64(token),
              username: user.username || user.email
            })

          {:error, reason} ->
            conn
            |> put_status(status_for_error(reason))
            |> json(%{error: to_string(reason)})
        end

      :error ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "invalid_device_code"})
    end
  end

  def poll_token(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "missing_device_code"})
  end

  def auth_status(conn, _params) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> encoded_token] ->
        case Base.decode64(encoded_token) do
          {:ok, raw_token} ->
            case Accounts.get_user_by_session_token(raw_token) do
              {user, _inserted_at} ->
                json(conn, %{authenticated: true, username: user.username || user.email})

              nil ->
                json(conn, %{authenticated: false})
            end

          :error ->
            json(conn, %{authenticated: false})
        end

      _ ->
        json(conn, %{authenticated: false})
    end
  end

  defp verification_uri(user_code) do
    HeyiAmWeb.Endpoint.url() <> @verification_uri_path <> "?code=#{user_code}"
  end

  defp status_for_error(:authorization_pending), do: :forbidden
  defp status_for_error(:expired_token), do: :gone
  defp status_for_error(:access_denied), do: :forbidden
  defp status_for_error(_), do: :bad_request
end
