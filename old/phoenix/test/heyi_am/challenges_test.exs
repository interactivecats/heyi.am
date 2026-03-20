defmodule HeyiAm.ChallengesTest do
  use HeyiAm.DataCase

  alias HeyiAm.Challenges
  alias HeyiAm.Challenges.Challenge

  setup do
    user = HeyiAm.AccountsFixtures.user_fixture()
    %{user: user}
  end

  describe "create_challenge/2" do
    test "creates a challenge with valid attrs", %{user: user} do
      attrs = %{description: "Build a REST API", posted_by: "Acme Corp"}
      assert {:ok, %Challenge{} = challenge} = Challenges.create_challenge(user.id, attrs)
      assert challenge.description == "Build a REST API"
      assert challenge.posted_by == "Acme Corp"
      assert challenge.token != nil
      assert challenge.user_id == user.id
      assert challenge.status == "open"
      assert challenge.is_private == false
    end

    test "creates a private challenge with access code", %{user: user} do
      attrs = %{description: "Private challenge", access_code: "secret123"}
      assert {:ok, challenge} = Challenges.create_challenge(user.id, attrs)
      assert challenge.is_private == true
      assert challenge.access_code_hash != nil
      assert Challenge.valid_access_code?(challenge, "secret123")
      refute Challenge.valid_access_code?(challenge, "wrong")
    end
  end

  describe "get_by_token/1" do
    test "returns challenge by token", %{user: user} do
      {:ok, challenge} = Challenges.create_challenge(user.id, %{description: "Find me"})
      found = Challenges.get_by_token(challenge.token)
      assert found.id == challenge.id
    end

    test "returns nil for unknown token" do
      assert Challenges.get_by_token("nonexistent") == nil
    end
  end

  describe "list_user_challenges/1" do
    test "returns all challenges for a user", %{user: user} do
      {:ok, _} = Challenges.create_challenge(user.id, %{description: "Challenge 1"})
      {:ok, _} = Challenges.create_challenge(user.id, %{description: "Challenge 2"})
      challenges = Challenges.list_user_challenges(user.id)
      assert length(challenges) == 2
    end
  end

  describe "update_challenge/2" do
    test "updates challenge description", %{user: user} do
      {:ok, challenge} = Challenges.create_challenge(user.id, %{description: "Original"})
      assert {:ok, updated} = Challenges.update_challenge(challenge, %{description: "Updated"})
      assert updated.description == "Updated"
    end

    test "updates status to closed", %{user: user} do
      {:ok, challenge} = Challenges.create_challenge(user.id, %{description: "To close"})
      assert {:ok, updated} = Challenges.update_challenge(challenge, %{status: "closed"})
      assert updated.status == "closed"
    end
  end

  describe "delete_challenge/1" do
    test "deletes a challenge", %{user: user} do
      {:ok, challenge} = Challenges.create_challenge(user.id, %{description: "To delete"})
      assert {:ok, _} = Challenges.delete_challenge(challenge)
      assert Challenges.get_by_token(challenge.token) == nil
    end
  end
end
