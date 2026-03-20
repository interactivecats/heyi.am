defmodule HeyiAm.Shares do
  import Ecto.Query
  alias HeyiAm.Repo
  alias HeyiAm.Shares.Share

  def get_by_token(token) do
    Repo.get_by(Share, token: token)
  end

  @doc "Count the total number of shares belonging to a user."
  def count_user_shares(user_id) do
    from(s in Share, where: s.user_id == ^user_id, select: count())
    |> Repo.one()
  end

  @doc """
  Create or update a share. If machine_token + session_id match an existing
  share, update it (re-render). Otherwise create a new one.

  Automatically:
  - Resolves user_id from machine_token (if a linked user exists)
  - Links share to project
  - Adds share to portfolio
  """
  def upsert_share(attrs) do
    # Resolve user_id from machine_token before creating
    attrs = maybe_resolve_user(attrs)

    case find_existing(attrs) do
      nil ->
        token = generate_token(12)
        delete_token = generate_token(32)

        result =
          %Share{}
          |> Share.changeset(Map.merge(attrs, %{token: token, delete_token: delete_token}))
          |> Repo.insert()

        case result do
          {:ok, share} ->
            after_upsert(share)
            {:ok, share, :created}

          error ->
            error
        end

      existing ->
        result =
          existing
          |> Share.changeset(attrs)
          |> Repo.update()

        case result do
          {:ok, share} ->
            after_upsert(share)
            {:ok, share, :updated}

          error ->
            error
        end
    end
  end

  # After creating/updating a share: link to project, auto-add to portfolio
  defp after_upsert(share) do
    HeyiAm.Projects.link_share_to_project(share)

    if share.user_id do
      HeyiAm.Portfolios.auto_add_to_portfolio(share.user_id, share.id)
    end
  end

  # Look up user_id from machine_token by finding any existing share
  # that already has a user_id with the same machine_token
  defp maybe_resolve_user(%{machine_token: mt} = attrs)
       when is_binary(mt) and mt != "" do
    case attrs do
      %{user_id: uid} when not is_nil(uid) ->
        attrs

      _ ->
        user_id =
          from(s in Share,
            where: s.machine_token == ^mt and not is_nil(s.user_id),
            select: s.user_id,
            limit: 1
          )
          |> Repo.one()

        if user_id, do: Map.put(attrs, :user_id, user_id), else: attrs
    end
  end

  defp maybe_resolve_user(attrs), do: attrs

  def delete_share_by_token(token, delete_token) do
    case Repo.get_by(Share, token: token) do
      nil ->
        {:error, :not_found}

      share ->
        if secure_compare(share.delete_token, delete_token) do
          Repo.delete(share)
        else
          {:error, :forbidden}
        end
    end
  end

  defp find_existing(%{machine_token: mt, session_id: sid})
       when is_binary(mt) and mt != "" and is_binary(sid) and sid != "" do
    Repo.one(
      from s in Share,
        where: s.machine_token == ^mt and s.session_id == ^sid
    )
  end

  defp find_existing(_), do: nil

  defp generate_token(bytes) do
    :crypto.strong_rand_bytes(bytes) |> Base.url_encode64(padding: false)
  end

  def update_owned_share(user_id, share_id, attrs) do
    case Repo.get(Share, share_id) do
      %Share{user_id: ^user_id} = share ->
        share |> Share.changeset(attrs) |> Repo.update()

      _ ->
        {:error, :not_found}
    end
  end

  def delete_owned_share(user_id, share_id) do
    case Repo.get(Share, share_id) do
      %Share{user_id: ^user_id} = share ->
        case Repo.delete(share) do
          {:ok, share} = result ->
            HeyiAm.Storage.delete("s/#{share.token}.html")
            result

          error ->
            error
        end

      _ ->
        {:error, :not_found}
    end
  end

  @doc """
  Seal a share — sets sealed_at timestamp and generates an Ed25519 signature.
  Once sealed, the share cannot be modified.
  """
  def seal_share(%Share{sealed_at: sealed_at}) when not is_nil(sealed_at) do
    {:error, :already_sealed}
  end

  def seal_share(%Share{} = share) do
    now = DateTime.utc_now(:second)
    signature = HeyiAm.Signature.sign(share.token <> DateTime.to_iso8601(now))

    share
    |> Share.seal_changeset(%{sealed_at: now, seal_signature: signature})
    |> Repo.update()
  end

  defp secure_compare(a, b) when is_binary(a) and is_binary(b) do
    byte_size(a) == byte_size(b) and :crypto.hash_equals(a, b)
  end

  defp secure_compare(_, _), do: false
end
