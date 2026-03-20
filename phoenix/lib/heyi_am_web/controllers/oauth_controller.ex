defmodule HeyiAmWeb.OAuthController do
  use HeyiAmWeb, :controller

  plug Ueberauth

  alias HeyiAm.Accounts

  def callback(%{assigns: %{ueberauth_failure: _failure}} = conn, _params) do
    conn
    |> put_flash(:error, "Authentication failed.")
    |> redirect(to: ~p"/users/log-in")
  end

  def callback(%{assigns: %{ueberauth_auth: auth}} = conn, _params) do
    attrs = %{
      github_id: auth.uid,
      email: auth.info.email,
      display_name: auth.info.name,
      avatar_url: auth.info.image,
      github_url: profile_url(auth)
    }

    case Accounts.find_or_create_from_github(attrs) do
      {:ok, user} ->
        HeyiAmWeb.UserAuth.log_in_user(conn, user, %{"remember_me" => "true"})

      {:error, _changeset} ->
        conn
        |> put_flash(:error, "Could not sign in with GitHub. The email may already be in use.")
        |> redirect(to: ~p"/users/log-in")
    end
  end

  defp profile_url(auth) do
    case auth.info do
      %{urls: %{html_url: url}} when is_binary(url) -> url
      _ -> nil
    end
  end
end
