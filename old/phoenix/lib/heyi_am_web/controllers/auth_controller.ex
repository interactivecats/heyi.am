defmodule HeyiAmWeb.AuthController do
  use HeyiAmWeb, :controller

  require Logger

  alias HeyiAm.Accounts
  alias HeyiAmWeb.UserAuth

  plug :capture_machine_token
  plug Ueberauth

  defp capture_machine_token(conn, _opts) do
    mt = conn.params["machine_token"]

    if is_binary(mt) and byte_size(mt) in 1..128 and Regex.match?(~r/^[a-zA-Z0-9_\-]+$/, mt) do
      put_session(conn, :pending_machine_token, mt)
    else
      conn
    end
  end

  def callback(%{assigns: %{ueberauth_auth: auth}} = conn, _params) do
    user_info = %{
      id: auth.uid,
      login: auth.info.nickname,
      name: auth.info.name,
      email: auth.info.email,
      avatar_url: auth.info.image
    }

    case Accounts.find_or_create_from_github(user_info) do
      {:ok, user} ->
        if mt = get_session(conn, :pending_machine_token) do
          Accounts.link_machine_token(user, mt)
        end

        conn
        |> UserAuth.log_in_user(user)

      {:error, changeset} ->
        Logger.error("GitHub OAuth account creation failed: #{inspect(changeset.errors)}")

        conn
        |> put_flash(:error, "Failed to sign in. Please try again.")
        |> redirect(to: ~p"/")
    end
  end

  def callback(%{assigns: %{ueberauth_failure: failure}} = conn, _params) do
    reasons = Enum.map(failure.errors, fn e -> "#{e.message_key}: #{e.message}" end)
    Logger.warning("GitHub OAuth failure: #{Enum.join(reasons, ", ")}")

    conn
    |> put_flash(:error, "Authentication failed. Please try again.")
    |> redirect(to: ~p"/")
  end
end
