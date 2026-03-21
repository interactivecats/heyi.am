defmodule HeyiAm.Portfolios do
  import Ecto.Query

  alias HeyiAm.Repo
  alias HeyiAm.Portfolios.PortfolioSession

  def add_to_portfolio(user, share) do
    Repo.transaction(fn ->
      # Lock existing rows to prevent concurrent position races
      positions =
        PortfolioSession
        |> where(user_id: ^user.id)
        |> select([p], p.position)
        |> lock("FOR UPDATE")
        |> Repo.all()

      max_pos = Enum.max(positions, fn -> 0 end)

      %PortfolioSession{}
      |> PortfolioSession.changeset(%{
        user_id: user.id,
        share_id: share.id,
        project_name: share.project_name,
        position: max_pos + 1
      })
      |> Repo.insert()
      |> case do
        {:ok, ps} -> ps
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
  end

  def list_portfolio_sessions(user_id) do
    PortfolioSession
    |> where(user_id: ^user_id)
    |> order_by(:position)
    |> preload(:share)
    |> Repo.all()
  end

  def list_visible_portfolio_sessions(user_id) do
    PortfolioSession
    |> where(user_id: ^user_id, visible: true)
    |> join(:inner, [ps], s in assoc(ps, :share))
    |> where([_ps, s], s.status == "listed")
    |> order_by([ps], ps.position)
    |> preload(:share)
    |> Repo.all()
  end

  def get_portfolio_session_for_user(id, user_id) do
    PortfolioSession
    |> where(id: ^id, user_id: ^user_id)
    |> Repo.one()
  end

  def toggle_visibility(%PortfolioSession{} = ps, visible) do
    ps
    |> PortfolioSession.changeset(%{visible: visible})
    |> Repo.update()
  end

  def reorder(user_id, ordered_ids) do
    if ordered_ids == [] do
      {:ok, :noop}
    else
      # Single query: UPDATE with unnest for all positions at once
      ids = Enum.with_index(ordered_ids, 1)

      Repo.transaction(fn ->
        Ecto.Adapters.SQL.query!(
          Repo,
          """
          UPDATE portfolio_sessions AS ps
          SET position = v.position
          FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::integer[]) AS position) AS v
          WHERE ps.id = v.id AND ps.user_id = $3
          """,
          [Enum.map(ids, &elem(&1, 0)), Enum.map(ids, &elem(&1, 1)), user_id]
        )
      end)
    end
  end

  def remove_from_portfolio(%PortfolioSession{} = ps) do
    Repo.delete(ps)
  end
end
