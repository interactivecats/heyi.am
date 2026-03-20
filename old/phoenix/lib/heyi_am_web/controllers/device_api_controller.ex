defmodule HeyiAmWeb.DeviceApiController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Accounts

  plug HeyiAmWeb.Plugs.RateLimit, [max_requests: 10, window_ms: 600_000] when action in [:create]
  plug HeyiAmWeb.Plugs.RateLimit, [max_requests: 120, window_ms: 600_000] when action in [:token]

  @doc """
  POST /api/device/authorize

  Creates a pending device authorization. Returns device_code, user_code,
  and the verification URI for the user to visit in the browser.
  """
  def create(conn, _params) do
    case Accounts.create_device_authorization() do
      {:ok, device_auth} ->
        verification_uri = "#{HeyiAmWeb.Endpoint.url()}/device"

        conn
        |> put_status(:ok)
        |> json(%{
          device_code: device_auth.device_code,
          user_code: device_auth.user_code,
          verification_uri: verification_uri,
          verification_uri_complete: "#{verification_uri}?code=#{device_auth.user_code}",
          expires_in: 600,
          interval: 5
        })

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "device_auth_failed", message: format_errors(changeset)})
    end
  end

  @doc """
  POST /api/device/token

  Polling endpoint. The CLI calls this every 5 seconds with a device_code.
  Returns the current status and, on success, the API token and user info.
  The token is returned exactly once -- subsequent polls return authorized
  status without the token.
  """
  def token(conn, %{"device_code" => device_code}) do
    case Accounts.check_device_token(device_code) do
      {:ok, :pending} ->
        conn
        |> put_status(:ok)
        |> json(%{status: "pending"})

      {:ok, :authorized, token, user} when is_binary(token) ->
        conn
        |> put_status(:ok)
        |> json(%{
          status: "authorized",
          token: token,
          user: %{
            username: user.username,
            display_name: user.display_name
          }
        })

      {:ok, :authorized, nil, user} ->
        # Token already retrieved on a previous poll
        conn
        |> put_status(:ok)
        |> json(%{
          status: "authorized",
          token: nil,
          user: %{
            username: user.username,
            display_name: user.display_name
          }
        })

      {:error, :expired} ->
        conn
        |> put_status(:gone)
        |> json(%{error: "expired_token", message: "The device code has expired. Please restart the login flow."})

      {:error, :not_found} ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "not_found", message: "Invalid device code."})
    end
  end

  def token(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "missing_parameter", message: "device_code is required."})
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
    |> Enum.map(fn {k, v} -> "#{k}: #{Enum.join(v, ", ")}" end)
    |> Enum.join("; ")
  end
end
