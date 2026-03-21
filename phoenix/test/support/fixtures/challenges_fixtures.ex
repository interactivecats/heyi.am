defmodule HeyiAm.ChallengesFixtures do
  @moduledoc """
  Test helpers for creating challenge entities.
  """

  alias HeyiAm.Challenges

  def valid_challenge_attributes(attrs \\ %{}) do
    Enum.into(attrs, %{
      title: "Build a Rate Limiter #{System.unique_integer()}",
      problem_statement: "Implement a distributed token bucket rate limiter.",
      time_limit_minutes: 45
    })
  end

  def challenge_fixture(user, attrs \\ %{}) do
    desired_status = Map.get(attrs, :status, "active")
    create_attrs = Map.delete(attrs, :status)

    {:ok, challenge} =
      create_attrs
      |> valid_challenge_attributes()
      |> then(&Challenges.create_challenge(user, &1))

    # Activate unless the test explicitly wants a draft challenge
    if desired_status != "draft" do
      {:ok, challenge} = Challenges.activate_challenge(challenge)

      if desired_status == "closed" do
        {:ok, challenge} = Challenges.close_challenge(challenge)
        challenge
      else
        challenge
      end
    else
      challenge
    end
  end
end
