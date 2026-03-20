defmodule HeyiAmWeb.DeviceController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Accounts

  plug :put_layout, html: false

  @doc """
  GET /device

  Shows the device authorization page. If a `code` query param is present,
  pre-fills the user code field. The page behavior depends on whether the
  user is logged in:
  - Logged in: shows the code and an "Authorize" button
  - Not logged in: shows a login prompt (redirects to login, then back here)
  """
  def show(conn, params) do
    user_code = params["code"]
    current_scope = conn.assigns[:current_scope]

    if current_scope && current_scope.user do
      # User is logged in -- show the authorize form
      device_auth =
        if user_code do
          Accounts.get_device_authorization_by_user_code(user_code)
        end

      render(conn, :show,
        user_code: user_code,
        device_auth: device_auth,
        current_scope: current_scope
      )
    else
      # Not logged in -- save the code and redirect to login
      conn
      |> put_session(:user_return_to, ~p"/device?code=#{user_code || ""}")
      |> redirect(to: ~p"/users/log-in")
    end
  end

  @doc """
  POST /device/authorize

  Browser form submission to approve the device authorization.
  Requires the user to be logged in.
  """
  def authorize(conn, %{"user_code" => user_code}) do
    current_scope = conn.assigns[:current_scope]

    if is_nil(current_scope) or is_nil(current_scope.user) do
      conn
      |> put_flash(:error, "You must be logged in to authorize a device.")
      |> redirect(to: ~p"/users/log-in")
    else
      do_authorize(conn, user_code, current_scope.user)
    end
  end

  defp do_authorize(conn, user_code, user) do
    case Accounts.get_device_authorization_by_user_code(user_code) do
      nil ->
        conn
        |> put_flash(:error, "Invalid or expired code. Please try again.")
        |> redirect(to: ~p"/device")

      device_auth ->
        case Accounts.authorize_device(device_auth, user) do
          {:ok, _device_auth} ->
            conn
            |> put_flash(:info, "Device authorized! You can close this tab and return to your terminal.")
            |> render(:success, current_scope: conn.assigns[:current_scope])

          {:error, :expired} ->
            conn
            |> put_flash(:error, "This code has expired. Please restart the login flow in your terminal.")
            |> redirect(to: ~p"/device")

          {:error, :already_processed} ->
            conn
            |> put_flash(:error, "This code has already been used.")
            |> redirect(to: ~p"/device")

          {:error, _changeset} ->
            conn
            |> put_flash(:error, "Something went wrong. Please try again.")
            |> redirect(to: ~p"/device")
        end
    end
  end
end
