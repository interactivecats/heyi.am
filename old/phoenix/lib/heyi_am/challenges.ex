defmodule HeyiAm.Challenges do
  @moduledoc "Context for managing coding challenges."
  import Ecto.Query
  alias HeyiAm.Repo
  alias HeyiAm.Challenges.Challenge

  def get_challenge(id), do: Repo.get(Challenge, id)

  def get_by_token(token) do
    Repo.get_by(Challenge, token: token)
  end

  def list_user_challenges(user_id) do
    from(c in Challenge, where: c.user_id == ^user_id, order_by: [desc: c.inserted_at])
    |> Repo.all()
  end

  def create_challenge(user_id, attrs) do
    token = :crypto.strong_rand_bytes(12) |> Base.url_encode64(padding: false)

    # Normalize to string keys to avoid mixed-key maps
    string_attrs =
      attrs
      |> Enum.map(fn {k, v} -> {to_string(k), v} end)
      |> Map.new()

    %Challenge{}
    |> Challenge.changeset(Map.merge(string_attrs, %{"token" => token, "user_id" => user_id}))
    |> Repo.insert()
  end

  def update_challenge(%Challenge{} = challenge, attrs) do
    challenge
    |> Challenge.changeset(attrs)
    |> Repo.update()
  end

  def delete_challenge(%Challenge{} = challenge) do
    Repo.delete(challenge)
  end

  def list_challenge_responses(challenge_id) do
    from(s in HeyiAm.Shares.Share,
      where: s.challenge_id == ^challenge_id,
      order_by: [desc: s.inserted_at],
      preload: [:user]
    )
    |> Repo.all()
  end
end
