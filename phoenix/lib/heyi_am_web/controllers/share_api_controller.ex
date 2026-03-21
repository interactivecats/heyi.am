defmodule HeyiAmWeb.ShareApiController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Shares
  alias HeyiAm.Challenges
  alias HeyiAm.Signature

  @doc """
  Publish a session from the CLI.

  Accepts JSON with session data, optional challenge slug, signature, and public key.
  """
  def create(conn, %{"session" => session_params} = params) do
    user_id = conn.assigns[:current_user_id]
    has_challenge = is_binary(params["challenge_slug"]) and params["challenge_slug"] != ""

    # Require auth for non-challenge publishes
    if is_nil(user_id) and not has_challenge do
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Authentication required. Run: heyiam login"})
    else
      attrs =
        session_params
        |> Map.delete("user_id")
        |> Map.put("token", Shares.generate_token())
        |> Map.put("status", "listed")
        |> Map.put_new("recorded_at", DateTime.utc_now())
        |> maybe_put("user_id", user_id)

      with {:ok, attrs} <- maybe_link_challenge(attrs, params) do
      case Shares.create_share(attrs) do
        {:ok, share} ->
          conn
          |> put_status(:created)
          |> json(%{
            token: share.token,
            url: "/s/#{share.token}",
            sealed: share.sealed || false,
            content_hash: Signature.content_hash(share)
          })

        {:error, changeset} ->
          errors =
            Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
              Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
                opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
              end)
            end)

          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: %{code: "VALIDATION_FAILED", details: errors}})
      end
    else
      {:error, reason} -> send_challenge_error(conn, reason)
    end
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: %{code: "MISSING_SESSION", message: "Missing 'session' parameter"}})
  end

  @doc """
  Verify a share's Ed25519 signature.
  """
  def verify(conn, %{"token" => token}) do
    case Shares.get_share_by_token(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> json(%{error: %{code: "NOT_FOUND", message: "Session not found"}})

      share ->
        verification_result = Signature.verify(share)

        json(conn, %{
          token: share.token,
          content_hash: Signature.content_hash(share),
          signed: Signature.signed?(share),
          verified: verification_result == :ok,
          sealed: share.sealed || false,
          recorded_at: share.recorded_at,
          verified_at: share.verified_at
        })
    end
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp maybe_link_challenge(attrs, params) do
    case params["challenge_slug"] do
      slug when is_binary(slug) and slug != "" ->
        case resolve_challenge(slug, params["access_code"]) do
          {:ok, challenge} -> {:ok, Map.put(attrs, "challenge_id", challenge.id)}
          {:error, reason} -> {:error, reason}
        end

      _ ->
        {:ok, attrs}
    end
  end

  defp resolve_challenge(slug, access_code) do
    challenge = Challenges.get_challenge_by_slug!(slug)

    cond do
      not Challenges.active?(challenge) ->
        {:error, :challenge_not_active}

      HeyiAm.Challenges.Challenge.has_access_code?(challenge) and
          not Challenges.verify_access_code(challenge, access_code || "") ->
        {:error, :invalid_access_code}

      not Challenges.accepting_responses?(challenge) ->
        {:error, :max_responses_reached}

      true ->
        {:ok, challenge}
    end
  rescue
    Ecto.NoResultsError -> {:error, :challenge_not_found}
  end

  defp send_challenge_error(conn, :challenge_not_found) do
    conn |> put_status(:not_found) |> json(%{error: %{code: "CHALLENGE_NOT_FOUND", message: "Challenge not found"}})
  end

  defp send_challenge_error(conn, :challenge_not_active) do
    conn |> put_status(:conflict) |> json(%{error: %{code: "CHALLENGE_NOT_ACTIVE", message: "Challenge is not active"}})
  end

  defp send_challenge_error(conn, :invalid_access_code) do
    conn |> put_status(:forbidden) |> json(%{error: %{code: "INVALID_ACCESS_CODE", message: "Invalid access code"}})
  end

  defp send_challenge_error(conn, :max_responses_reached) do
    conn |> put_status(:conflict) |> json(%{error: %{code: "MAX_RESPONSES_REACHED", message: "Challenge has reached maximum responses"}})
  end
end
