defmodule HeyiAmWeb.UserRegistrationController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Accounts
  alias HeyiAm.Accounts.User
  alias HeyiAmWeb.UserAuth

  def new(conn, _params) do
    changeset = Accounts.change_user_email(%User{})
    render(conn, :new, changeset: changeset)
  end

  def create(conn, %{"user" => user_params}) do
    case Accounts.register_user(user_params) do
      {:ok, user} ->
        Accounts.UserNotifier.deliver_welcome(user)

        conn
        |> put_flash(:info, "Account created successfully.")
        |> UserAuth.log_in_user(user, user_params)

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, :new, changeset: changeset)
    end
  end
end
