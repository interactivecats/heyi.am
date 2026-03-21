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

    challenge_params = parse_criteria_text(challenge_params)

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

    unlocked =
      !Challenge.has_access_code?(challenge) ||
        get_session(conn, "challenge_unlocked_#{challenge.id}") == true

    render(conn, :show,
      challenge: challenge,
      unlocked: unlocked,
      access_code_error: false,
      page_title: challenge.title
    )
  end

  def verify_access_code(conn, %{"slug" => slug, "access_code" => code}) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    if Challenges.verify_access_code(challenge, code) do
      conn
      |> put_session("challenge_unlocked_#{challenge.id}", true)
      |> redirect(to: ~p"/challenges/#{challenge.slug}")
    else
      render(conn, :show,
        challenge: challenge,
        unlocked: false,
        access_code_error: true,
        page_title: challenge.title
      )
    end
  end

  def in_progress(conn, %{"slug" => slug}) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    render(conn, :in_progress,
      challenge: challenge,
      page_title: "In Progress — #{challenge.title}"
    )
  end

  def submitted(conn, %{"slug" => slug} = params) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    # If ?token= query param provided, verify it belongs to this challenge and set session
    conn = maybe_set_response_session(conn, challenge, params["token"])

    is_owner = is_challenge_owner?(conn, challenge)
    response_token = get_session(conn, "challenge_response_#{challenge.id}")

    if is_owner or response_token do
      seal_hash =
        if is_owner do
          responses = Challenges.list_responses(challenge)
          latest = List.last(responses)
          if latest, do: Signature.content_hash(latest)
        else
          case response_token do
            token when is_binary(token) ->
              case HeyiAm.Shares.get_share_by_token(token) do
                %{} = share -> Signature.content_hash(share)
                _ -> nil
              end

            _ ->
              nil
          end
        end

      render(conn, :submitted,
        challenge: challenge,
        seal_hash: seal_hash,
        page_title: "Submitted — #{challenge.title}"
      )
    else
      conn
      |> redirect(to: ~p"/challenges/#{challenge.slug}")
      |> halt()
    end
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
        response: response_detail(share),
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

  defp response_detail(share) do
    %{
      token: share.token,
      title: share.title,
      dev_take: share.dev_take || "",
      duration_minutes: share.duration_minutes || 0,
      turns: share.turns || 0,
      files_changed: share.files_changed || 0,
      loc_changed: share.loc_changed || 0,
      sealed?: share.sealed || false,
      hash: Signature.content_hash(share),
      skills: share.skills || [],
      qa_pairs: share.qa_pairs || [],
      beats: share.beats || [],
      highlights: share.highlights || %{},
      tool_breakdown: share.tool_breakdown || [],
      narrative: share.narrative || "",
      top_files: share.top_files || []
    }
  end

  defp parse_criteria_text(params) do
    case params["criteria_text"] do
      text when is_binary(text) and text != "" ->
        criteria =
          text
          |> String.split("\n")
          |> Enum.map(&String.trim/1)
          |> Enum.reject(&(&1 == ""))
          |> Enum.map(&%{"name" => &1})

        Map.put(params, "evaluation_criteria", criteria)

      _ ->
        params
    end
  end

  defp maybe_set_response_session(conn, _challenge, nil), do: conn
  defp maybe_set_response_session(conn, _challenge, ""), do: conn

  defp maybe_set_response_session(conn, challenge, token) when is_binary(token) do
    case HeyiAm.Shares.get_share_by_token(token) do
      %{challenge_id: cid} when cid == challenge.id ->
        put_session(conn, "challenge_response_#{challenge.id}", token)

      _ ->
        conn
    end
  end

  defp is_challenge_owner?(conn, challenge) do
    case conn.assigns[:current_scope] do
      %{user: %{id: id}} -> challenge.creator_id == id
      _ -> false
    end
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
