defmodule HeyiAm.Portfolios do
  import Ecto.Query
  alias HeyiAm.Repo
  alias HeyiAm.Portfolios.PortfolioEntry
  alias HeyiAm.Shares.Share

  def list_entries(user_id) do
    from(e in PortfolioEntry,
      where: e.user_id == ^user_id and e.visible == true,
      order_by: [desc: e.pinned, asc: e.position],
      preload: [:share]
    )
    |> Repo.all()
  end

  def list_all_entries(user_id) do
    from(e in PortfolioEntry,
      where: e.user_id == ^user_id,
      order_by: [desc: e.pinned, asc: e.position],
      preload: [:share]
    )
    |> Repo.all()
  end

  @doc "Auto-add a share to portfolio. Idempotent — skips if already added."
  def auto_add_to_portfolio(user_id, share_id) when not is_nil(user_id) do
    max_pos =
      from(e in PortfolioEntry, where: e.user_id == ^user_id, select: max(e.position))
      |> Repo.one() || 0

    %PortfolioEntry{}
    |> PortfolioEntry.changeset(%{
      user_id: user_id,
      share_id: share_id,
      position: max_pos + 1
    })
    |> Repo.insert(on_conflict: :nothing)
  end

  def auto_add_to_portfolio(_, _), do: {:ok, nil}

  def add_to_portfolio(user_id, share_id) do
    case Repo.one(from(s in Share, where: s.id == ^share_id and s.user_id == ^user_id)) do
      nil ->
        {:error, :not_found}

      _share ->
        max_pos =
          from(e in PortfolioEntry, where: e.user_id == ^user_id, select: max(e.position))
          |> Repo.one() || 0

        %PortfolioEntry{}
        |> PortfolioEntry.changeset(%{
          user_id: user_id,
          share_id: share_id,
          position: max_pos + 1
        })
        |> Repo.insert(on_conflict: :nothing)
    end
  end

  def remove_from_portfolio(user_id, share_id) do
    from(e in PortfolioEntry, where: e.user_id == ^user_id and e.share_id == ^share_id)
    |> Repo.delete_all()

    :ok
  end

  def toggle_pin(user_id, entry_id) do
    case Repo.get_by(PortfolioEntry, id: entry_id, user_id: user_id) do
      nil ->
        {:error, :not_found}

      entry ->
        entry
        |> PortfolioEntry.changeset(%{pinned: !entry.pinned})
        |> Repo.update()
    end
  end

  def toggle_visibility(user_id, entry_id) do
    case Repo.get_by(PortfolioEntry, id: entry_id, user_id: user_id) do
      nil ->
        {:error, :not_found}

      entry ->
        entry
        |> PortfolioEntry.changeset(%{visible: !entry.visible})
        |> Repo.update()
    end
  end

  def reorder(user_id, entry_ids) when is_list(entry_ids) do
    case Repo.transaction(fn ->
      Enum.with_index(entry_ids)
      |> Enum.each(fn {entry_id, idx} ->
        from(e in PortfolioEntry, where: e.id == ^entry_id and e.user_id == ^user_id)
        |> Repo.update_all(set: [position: idx])
      end)
    end) do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  def available_shares(user_id) do
    existing_share_ids =
      from(e in PortfolioEntry, where: e.user_id == ^user_id, select: e.share_id)

    from(s in Share,
      where: s.user_id == ^user_id and s.id not in subquery(existing_share_ids),
      order_by: [desc: s.inserted_at]
    )
    |> Repo.all()
  end
end
