defmodule HeyiAmWeb.OAuthControllerTest do
  use HeyiAmWeb.ConnCase

  alias HeyiAm.Accounts
  alias HeyiAmWeb.OAuthController

  describe "GET /auth/github" do
    test "redirects to GitHub OAuth", %{conn: conn} do
      conn = get(conn, ~p"/auth/github")
      location = redirected_to(conn, 302)
      assert location =~ "github.com"
    end
  end

  describe "callback/2 with ueberauth_auth" do
    test "creates a new user and logs in on first GitHub auth", %{conn: conn} do
      auth = github_auth(12345, "dev@example.com", "Dev User")

      conn =
        conn
        |> bypass_through(HeyiAmWeb.Router, [:browser])
        |> get("/")
        |> assign(:ueberauth_auth, auth)
        |> OAuthController.callback(%{})

      assert redirected_to(conn) == ~p"/"
      assert get_session(conn, :user_token)

      user = HeyiAm.Repo.get_by!(Accounts.User, github_id: 12345)
      assert user.email == "dev@example.com"
      assert user.display_name == "Dev User"
      assert user.confirmed_at
    end

    test "logs in existing user matched by github_id", %{conn: conn} do
      {:ok, _existing} =
        Accounts.find_or_create_from_github(%{
          github_id: 99999,
          email: "existing@example.com",
          display_name: "Existing"
        })

      auth = github_auth(99999, "existing@example.com", "Existing")

      conn =
        conn
        |> bypass_through(HeyiAmWeb.Router, [:browser])
        |> get("/")
        |> assign(:ueberauth_auth, auth)
        |> OAuthController.callback(%{})

      assert redirected_to(conn) == ~p"/"
      assert get_session(conn, :user_token)
      assert length(HeyiAm.Repo.all(Accounts.User)) == 1
    end

    test "does not auto-link by email — returns error for email collision", %{conn: conn} do
      {:ok, _email_user} = Accounts.register_user(%{email: "shared@example.com", password: "validpassword1"})

      auth = github_auth(77777, "shared@example.com", "GitHub User")

      conn =
        conn
        |> bypass_through(HeyiAmWeb.Router, [:browser])
        |> get("/")
        |> assign(:ueberauth_auth, auth)
        |> OAuthController.callback(%{})

      assert redirected_to(conn) == ~p"/users/log-in"
      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "Could not sign in"
    end
  end

  describe "callback/2 with ueberauth_failure" do
    test "handles auth failure gracefully", %{conn: conn} do
      failure = %Ueberauth.Failure{
        provider: :github,
        errors: [%Ueberauth.Failure.Error{message: "denied"}]
      }

      conn =
        conn
        |> bypass_through(HeyiAmWeb.Router, [:browser])
        |> get("/")
        |> assign(:ueberauth_failure, failure)
        |> OAuthController.callback(%{})

      assert redirected_to(conn) == ~p"/users/log-in"
      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "Authentication failed"
    end
  end

  defp github_auth(uid, email, name) do
    %Ueberauth.Auth{
      uid: uid,
      provider: :github,
      info: %Ueberauth.Auth.Info{
        email: email,
        name: name,
        image: "https://avatars.githubusercontent.com/u/#{uid}",
        urls: %{html_url: "https://github.com/testuser"}
      },
      credentials: %Ueberauth.Auth.Credentials{
        token: "gho_test_token",
        expires: false
      }
    }
  end
end
