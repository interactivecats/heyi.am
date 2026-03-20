defmodule HeyiAm.Challenges do
  @moduledoc """
  The Challenges context — managing interview challenges and their responses.
  """

  import Ecto.Query, warn: false
  alias HeyiAm.Repo
  alias HeyiAm.Challenges.Challenge

  def create_challenge(user, attrs) do
    %Challenge{}
    |> Challenge.changeset(attrs)
    |> Ecto.Changeset.put_assoc(:creator, user)
    |> Repo.insert()
  end

  def update_challenge(%Challenge{} = challenge, attrs) do
    challenge
    |> Challenge.changeset(attrs)
    |> Repo.update()
  end

  def get_challenge_by_slug!(slug) do
    Repo.get_by!(Challenge, slug: slug)
  end

  def list_challenges_for_user(user) do
    Challenge
    |> where(creator_id: ^user.id)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
  end

  def activate_challenge(%Challenge{status: "draft"} = challenge) do
    challenge
    |> Challenge.status_changeset("active")
    |> Repo.update()
  end

  def activate_challenge(%Challenge{}), do: {:error, :invalid_status_transition}

  def close_challenge(%Challenge{status: "active"} = challenge) do
    challenge
    |> Challenge.status_changeset("closed")
    |> Repo.update()
  end

  def close_challenge(%Challenge{}), do: {:error, :invalid_status_transition}

  def verify_access_code(%Challenge{} = challenge, code) do
    Challenge.valid_access_code?(challenge, code)
  end

  def active?(%Challenge{status: "active"}), do: true
  def active?(_), do: false

  def responses_count(%Challenge{} = challenge) do
    HeyiAm.Shares.Share
    |> where(challenge_id: ^challenge.id)
    |> select([s], count(s.id))
    |> Repo.one()
  end

  def accepting_responses?(%Challenge{status: "active"} = challenge) do
    case challenge.max_responses do
      nil -> true
      max -> responses_count(challenge) < max
    end
  end

  def accepting_responses?(_challenge), do: false

  def change_challenge(%Challenge{} = challenge, attrs \\ %{}) do
    Challenge.changeset(challenge, attrs)
  end

  def list_responses(%Challenge{} = challenge) do
    HeyiAm.Shares.Share
    |> where(challenge_id: ^challenge.id)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
  end

  def generate_slug do
    Challenge.generate_slug()
  end
end
