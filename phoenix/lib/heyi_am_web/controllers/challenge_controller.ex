defmodule HeyiAmWeb.ChallengeController do
  use HeyiAmWeb, :controller

  import Phoenix.Component, only: [to_form: 2]

  alias HeyiAm.Challenges
  alias HeyiAm.Challenges.Challenge
  alias HeyiAm.Signature

  def new(conn, _params) do
    changeset = Challenges.change_challenge(%Challenge{})
    render(conn, :new, changeset: changeset, form: to_form(changeset, as: "challenge"), page_title: "Create a Challenge")
  end

  def create(conn, %{"challenge" => challenge_params}) do
    user = conn.assigns.current_scope.user

    case Challenges.create_challenge(user, challenge_params) do
      {:ok, challenge} ->
        conn
        |> put_flash(:info, "Challenge created.")
        |> redirect(to: ~p"/challenges/#{challenge.slug}")

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, :new, changeset: changeset, form: to_form(changeset, as: "challenge"), page_title: "Create a Challenge")
    end
  end

  def show(conn, %{"slug" => slug}) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    render(conn, :show,
      challenge: challenge,
      page_title: challenge.title
    )
  end

  def in_progress(conn, %{"slug" => slug}) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    render(conn, :in_progress,
      challenge: challenge,
      page_title: "In Progress — #{challenge.title}"
    )
  end

  def submitted(conn, %{"slug" => slug}) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    render(conn, :submitted,
      challenge: challenge,
      page_title: "Submitted — #{challenge.title}"
    )
  end

  def compare(conn, %{"slug" => slug}) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    with :ok <- require_owner(conn, challenge) do
      shares = Challenges.list_responses(challenge)
      responses = Enum.map(shares, &response_summary/1)

      render(conn, :compare,
        challenge: challenge,
        responses: responses,
        page_title: "Compare — #{challenge.title}"
      )
    end
  end

  def deep_dive(conn, %{"slug" => slug, "token" => token}) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    with :ok <- require_owner(conn, challenge) do
      shares = Challenges.list_responses(challenge)
      tokens = Enum.map(shares, & &1.token)
      current_index = Enum.find_index(tokens, &(&1 == token))

      share = Enum.find(shares, &(&1.token == token)) || raise Ecto.NoResultsError, queryable: HeyiAm.Shares.Share

      prev_token = if current_index && current_index > 0, do: Enum.at(tokens, current_index - 1)
      next_token = if current_index && current_index < length(tokens) - 1, do: Enum.at(tokens, current_index + 1)

      prev_response = if prev_token, do: %{token: prev_token}
      next_response = if next_token, do: %{token: next_token}

      render(conn, :deep_dive,
        challenge: challenge,
        response: response_summary(share),
        prev_response: prev_response,
        next_response: next_response,
        page_title: "#{share.title} — #{challenge.title}"
      )
    end
  end

  defp response_summary(share) do
    %{
      token: share.token,
      title: share.title,
      dev_take: share.dev_take || "",
      duration_minutes: share.duration_minutes || 0,
      turns: share.turns || 0,
      sealed?: share.sealed || false,
      hash: String.slice(Signature.content_hash(share), 0..15) <> "..."
    }
  end

  defp require_owner(conn, challenge) do
    user = conn.assigns.current_scope.user

    if challenge.creator_id == user.id do
      :ok
    else
      conn
      |> put_flash(:error, "You do not have access to this challenge.")
      |> redirect(to: ~p"/")
      |> halt()
    end
  end
end
