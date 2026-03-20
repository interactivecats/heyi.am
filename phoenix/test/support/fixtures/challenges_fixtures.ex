defmodule HeyiAm.ChallengesFixtures do
  @moduledoc """
  Test helpers for creating challenge entities.
  """

  alias HeyiAm.Challenges

  def valid_challenge_attributes(attrs \\ %{}) do
    Enum.into(attrs, %{
      title: "Build a Rate Limiter #{System.unique_integer()}",
      problem_statement: "Implement a distributed token bucket rate limiter.",
      time_limit_minutes: 45,
      status: "active"
    })
  end

  def challenge_fixture(user, attrs \\ %{}) do
    {:ok, challenge} =
      attrs
      |> valid_challenge_attributes()
      |> then(&Challenges.create_challenge(user, &1))

    challenge
  end
end
