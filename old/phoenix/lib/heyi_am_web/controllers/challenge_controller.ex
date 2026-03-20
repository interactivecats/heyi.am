defmodule HeyiAmWeb.ChallengeController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Challenges
  alias HeyiAm.Challenges.Challenge

  plug :put_layout, html: false

  def new(conn, _params) do
    changeset = Challenge.changeset(%Challenge{}, %{})
    render(conn, :new, changeset: changeset)
  end

  def create(conn, %{"challenge" => challenge_params}) do
    user = conn.assigns.current_scope.user

    case Challenges.create_challenge(user.id, challenge_params) do
      {:ok, challenge} ->
        conn
        |> put_flash(:info, "Challenge created.")
        |> redirect(to: ~p"/challenge/#{challenge.token}")

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, :new, changeset: changeset)
    end
  end

  def show(conn, %{"token" => token} = params) do
    case Challenges.get_by_token(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render("404.html")

      %Challenge{is_private: true} = challenge ->
        # Check if user already unlocked via session
        session_key = "challenge_unlocked_#{challenge.id}"

        cond do
          get_session(conn, session_key) == true ->
            render_challenge_show(conn, challenge)

          Map.has_key?(params, "access_code") ->
            if Challenge.valid_access_code?(challenge, params["access_code"]) do
              conn
              |> put_session(session_key, true)
              |> render_challenge_show(challenge)
            else
              render(conn, :show,
                challenge: challenge,
                access_gate: true,
                error: "Invalid access code"
              )
            end

          true ->
            render(conn, :show, challenge: challenge, access_gate: true, error: nil)
        end

      challenge ->
        render_challenge_show(conn, challenge)
    end
  end

  def responses(conn, %{"token" => token}) do
    user = conn.assigns.current_scope.user

    case Challenges.get_by_token(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render("404.html")

      %Challenge{user_id: user_id} = challenge when user_id == user.id ->
        responses = Challenges.list_challenge_responses(challenge.id)

        render(conn, :responses,
          challenge: challenge,
          responses: responses
        )

      _challenge ->
        conn
        |> put_status(:forbidden)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render("404.html")
    end
  end

  defp render_challenge_show(conn, challenge) do
    render(conn, :show,
      challenge: challenge,
      access_gate: false,
      error: nil
    )
  end
end
