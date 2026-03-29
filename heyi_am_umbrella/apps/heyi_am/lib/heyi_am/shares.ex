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
      %{status: status} = share when status in ["listed", "unlisted"] ->
        Repo.preload(share, [:user, :project])
      _ ->
        nil
    end
  end

  def get_share_by_project_slug(project_id, slug) do
    Repo.one(from s in Share, where: s.project_id == ^project_id and s.slug == ^slug)
  end

  def get_published_share_by_project_slug(user_id, project_slug, session_slug) do
    Share
    |> join(:inner, [s], p in assoc(s, :project))
    |> where([s, p], s.user_id == ^user_id and s.slug == ^session_slug and p.slug == ^project_slug and s.status in ["listed", "unlisted"])
    |> preload([:user, :project])
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

  @doc """
  Updates rendered HTML for a share from the CLI upload pipeline.
  Separate from update_share to prevent stored HTML injection via the session create API.
  """
  def update_share_rendered_html(%Share{} = share, attrs) do
    share
    |> Share.rendered_html_changeset(attrs)
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

  def list_shares_for_project(project_id) do
    Share
    |> where(project_id: ^project_id)
    |> where([s], s.status in ["listed", "unlisted"])
    |> order_by([s], desc: s.recorded_at)
    |> Repo.all()
  end

  def get_published_share_by_token_slim(token) do
    Share
    |> where([s], s.token == ^token and s.status in ["listed", "unlisted"])
    |> select([s], %{token: s.token, status: s.status, session_storage_key: s.session_storage_key})
    |> Repo.one()
  end

  def list_unassigned_shares_for_user(user_id) do
    Share
    |> where([s], s.user_id == ^user_id and is_nil(s.project_id))
    |> order_by([s], desc: s.inserted_at)
    |> Repo.all()
  end

  def get_user_share(user_id, share_id) do
    Repo.get_by(Share, id: share_id, user_id: user_id)
  end

  def archive_project_sessions(project_id) do
    Share
    |> where([s], s.project_id == ^project_id and s.status in ["listed", "unlisted"])
    |> Repo.update_all(set: [status: "archived"])
  end

  def generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end
end
