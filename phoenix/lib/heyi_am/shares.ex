defmodule HeyiAm.Shares do
  import Ecto.Query

  alias HeyiAm.Repo
  alias HeyiAm.Shares.Share

  def get_share_by_token!(token) do
    Repo.get_by!(Share, token: token)
  end

  def get_share_by_token(token) do
    Repo.get_by(Share, token: token)
  end

  def create_share(attrs) do
    result =
      %Share{}
      |> Share.changeset(attrs)
      |> Repo.insert()

    case result do
      {:ok, share} ->
        # Auto-add to portfolio. Failure is intentionally swallowed — a failed
        # portfolio insert (e.g. duplicate on re-publish) should not fail the publish.
        if share.user_id do
          HeyiAm.Portfolios.add_to_portfolio(%HeyiAm.Accounts.User{id: share.user_id}, share)
        end

        {:ok, share}

      error ->
        error
    end
  end

  def update_share(%Share{} = share, attrs) do
    share
    |> Share.changeset(attrs)
    |> Repo.update()
  end

  def delete_share(%Share{} = share) do
    Repo.delete(share)
  end

  def list_shares_for_user(user_id) do
    Share
    |> where(user_id: ^user_id)
    |> order_by([s], desc: s.inserted_at)
    |> Repo.all()
  end

  def pin_turn(%Share{} = share, turn_id), do: add_to_list(share, :pinned_turns, turn_id)
  def unpin_turn(%Share{} = share, turn_id), do: remove_from_list(share, :pinned_turns, turn_id)
  def highlight_step(%Share{} = share, step_index), do: add_to_list(share, :highlighted_steps, step_index)
  def unhighlight_step(%Share{} = share, step_index), do: remove_from_list(share, :highlighted_steps, step_index)

  defp add_to_list(share, field, item) do
    updated = Enum.uniq(Map.get(share, field) ++ [item])
    update_share(share, %{field => updated})
  end

  defp remove_from_list(share, field, item) do
    updated = Enum.reject(Map.get(share, field), &(&1 == item))
    update_share(share, %{field => updated})
  end

  def generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end
end
