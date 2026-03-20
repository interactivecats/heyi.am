defmodule HeyiAm.Portfolios do
  import Ecto.Query

  alias HeyiAm.Repo
  alias HeyiAm.Portfolios.PortfolioSession

  def add_to_portfolio(user, share) do
    max_pos =
      PortfolioSession
      |> where(user_id: ^user.id)
      |> select([p], max(p.position))
      |> Repo.one() || 0

    %PortfolioSession{}
    |> PortfolioSession.changeset(%{
      user_id: user.id,
      share_id: share.id,
      project_name: share.project_name,
      position: max_pos + 1
    })
    |> Repo.insert()
  end

  def list_portfolio_sessions(user_id) do
    PortfolioSession
    |> where(user_id: ^user_id)
    |> order_by(:position)
    |> preload(:share)
    |> Repo.all()
  end

  def toggle_visibility(%PortfolioSession{} = ps, visible) do
    ps
    |> PortfolioSession.changeset(%{visible: visible})
    |> Repo.update()
  end

  def reorder(user_id, ordered_ids) do
    Repo.transaction(fn ->
      ordered_ids
      |> Enum.with_index(1)
      |> Enum.each(fn {id, position} ->
        PortfolioSession
        |> where(id: ^id, user_id: ^user_id)
        |> Repo.update_all(set: [position: position])
      end)
    end)
  end

  def remove_from_portfolio(%PortfolioSession{} = ps) do
    Repo.delete(ps)
  end
end
