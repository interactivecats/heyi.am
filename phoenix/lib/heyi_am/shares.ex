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

  def get_published_share_by_token(token) do
    case Repo.get_by(Share, token: token) do
      nil -> nil
      %{status: "draft"} -> nil
      share -> Repo.preload(share, :user)
    end
  end

  def get_published_share_by_project_slug(user_id, project_slug, session_slug) do
    Share
    |> join(:inner, [s], p in assoc(s, :project))
    |> where([s, p], s.user_id == ^user_id and s.slug == ^session_slug and p.slug == ^project_slug and s.status != "draft")
    |> preload(:user)
    |> Repo.one()
  end

  def create_share(attrs) do
    result =
      %Share{}
      |> Share.changeset(attrs)
      |> Repo.insert()

    result
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
