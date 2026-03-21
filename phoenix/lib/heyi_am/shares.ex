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

  def list_shares_for_user_project(user_id, project_name) do
    Share
    |> where(user_id: ^user_id, project_name: ^project_name)
    |> order_by([s], desc: s.inserted_at)
    |> Repo.all()
  end

  def generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end
end
