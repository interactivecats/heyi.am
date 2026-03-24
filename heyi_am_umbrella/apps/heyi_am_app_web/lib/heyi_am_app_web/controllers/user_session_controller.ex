defmodule HeyiAmAppWeb.UserSessionController do
  use HeyiAmAppWeb, :controller

  alias HeyiAm.Accounts
  alias HeyiAmAppWeb.UserAuth

  def redirect_root(conn, _params) do
    if conn.assigns.current_scope && conn.assigns.current_scope.user do
      redirect(conn, to: ~p"/users/settings")
    else
      redirect(conn, to: ~p"/users/log-in")
    end
  end

  def create(conn, %{"_action" => "confirmed"} = params) do
    create(conn, params, "User confirmed successfully.")
  end

  def create(conn, params) do
    create(conn, params, "Welcome back!")
  end

  # magic link login
  defp create(conn, %{"user" => %{"token" => token} = user_params}, info) do
    case Accounts.login_user_by_magic_link(token) do
      {:ok, {user, tokens_to_disconnect}} ->
        UserAuth.disconnect_sessions(tokens_to_disconnect)

        conn
        |> put_flash(:info, info)
        |> UserAuth.log_in_user(user, user_params)

      _ ->
        conn
        |> put_flash(:error, "The link is invalid or it has expired.")
        |> redirect(to: ~p"/users/log-in")
    end
  end

  # email + password login
  defp create(conn, %{"user" => user_params}, info) do
    %{"email" => email, "password" => password} = user_params

    if user = Accounts.get_user_by_email_and_password(email, password) do
      conn
      |> put_flash(:info, info)
      |> UserAuth.log_in_user(user, user_params)
    else
      conn
      |> put_flash(:error, "Invalid email or password")
      |> put_flash(:email, String.slice(email, 0, 160))
      |> redirect(to: ~p"/users/log-in")
    end
  end

  def update_password(conn, %{"user" => user_params} = params) do
    user = conn.assigns.current_scope.user
    true = Accounts.sudo_mode?(user)
    {:ok, {_user, expired_tokens}} = Accounts.update_user_password(user, user_params)

    UserAuth.disconnect_sessions(expired_tokens)

    conn
    |> put_session(:user_return_to, ~p"/users/settings")
    |> create(params, "Password updated successfully!")
  end

  def export(conn, _params) do
    user = conn.assigns.current_scope.user
    {:ok, data} = Accounts.export_user_data(user)
    json_data = Jason.encode!(data, pretty: true)
    filename = "heyi-am-export-#{user.username || user.id}-#{Date.utc_today()}.json"

    conn
    |> put_resp_content_type("application/json")
    |> put_resp_header("content-disposition", ~s(attachment; filename="#{filename}"))
    |> send_resp(200, json_data)
  end

  def delete_account(conn, %{"username" => confirmation}) do
    user = conn.assigns.current_scope.user
    expected = user.username || user.email

    if confirmation == expected do
      {:ok, _} = Accounts.delete_user_account(user)

      conn
      |> configure_session(drop: true)
      |> redirect(to: ~p"/users/log-in")
    else
      conn
      |> put_flash(:error, "Username did not match. Account was not deleted.")
      |> redirect(to: ~p"/users/settings")
    end
  end

  def delete(conn, _params) do
    conn
    |> put_flash(:info, "Logged out successfully.")
    |> UserAuth.log_out_user()
  end
end
