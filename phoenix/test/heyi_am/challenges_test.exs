defmodule HeyiAm.ChallengesTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Challenges
  alias HeyiAm.Challenges.Challenge

  import HeyiAm.AccountsFixtures
  import HeyiAm.ChallengesFixtures

  setup do
    %{user: user_fixture()}
  end

  describe "create_challenge/2" do
    test "creates a challenge with valid attributes", %{user: user} do
      attrs = %{
        title: "Build a Rate Limiter",
        problem_statement: "Implement a distributed token bucket.",
        time_limit_minutes: 45
      }

      assert {:ok, %Challenge{} = challenge} = Challenges.create_challenge(user, attrs)
      assert challenge.title == "Build a Rate Limiter"
      assert challenge.problem_statement == "Implement a distributed token bucket."
      assert challenge.time_limit_minutes == 45
      assert challenge.status == "draft"
      assert challenge.slug != nil
      assert challenge.creator_id == user.id
    end

    test "fails without required fields", %{user: user} do
      assert {:error, changeset} = Challenges.create_challenge(user, %{})
      assert %{title: ["can't be blank"], problem_statement: ["can't be blank"]} = errors_on(changeset)
    end

    test "generates a unique slug", %{user: user} do
      attrs = valid_challenge_attributes()
      {:ok, c1} = Challenges.create_challenge(user, attrs)
      {:ok, c2} = Challenges.create_challenge(user, attrs)
      assert c1.slug != c2.slug
    end

    test "hashes access code when provided", %{user: user} do
      attrs = valid_challenge_attributes(%{access_code: "secret123"})
      {:ok, challenge} = Challenges.create_challenge(user, attrs)
      assert challenge.access_code_hash != nil
      assert challenge.access_code_hash != "secret123"
    end

    test "validates title length", %{user: user} do
      attrs = valid_challenge_attributes(%{title: "ab"})
      assert {:error, changeset} = Challenges.create_challenge(user, attrs)
      assert %{title: ["should be at least 3 character(s)"]} = errors_on(changeset)
    end

    test "validates time_limit_minutes is positive", %{user: user} do
      attrs = valid_challenge_attributes(%{time_limit_minutes: -5})
      assert {:error, changeset} = Challenges.create_challenge(user, attrs)
      assert %{time_limit_minutes: _} = errors_on(changeset)
    end
  end

  describe "get_challenge_by_slug!/1" do
    test "returns the challenge with the given slug", %{user: user} do
      challenge = challenge_fixture(user)
      found = Challenges.get_challenge_by_slug!(challenge.slug)
      assert found.id == challenge.id
    end

    test "raises for nonexistent slug" do
      assert_raise Ecto.NoResultsError, fn ->
        Challenges.get_challenge_by_slug!("nonexistent")
      end
    end
  end

  describe "list_challenges_for_user/1" do
    test "returns challenges for the user", %{user: user} do
      challenge = challenge_fixture(user)
      challenges = Challenges.list_challenges_for_user(user)
      assert length(challenges) == 1
      assert hd(challenges).id == challenge.id
    end

    test "does not return other users' challenges", %{user: user} do
      other_user = user_fixture()
      _other_challenge = challenge_fixture(other_user)
      assert Challenges.list_challenges_for_user(user) == []
    end
  end

  describe "update_challenge/2" do
    test "updates the challenge with valid attributes", %{user: user} do
      challenge = challenge_fixture(user)
      assert {:ok, updated} = Challenges.update_challenge(challenge, %{title: "New Title Here"})
      assert updated.title == "New Title Here"
    end
  end

  describe "activate_challenge/1" do
    test "activates a draft challenge", %{user: user} do
      challenge = challenge_fixture(user, %{status: "draft"})
      assert {:ok, activated} = Challenges.activate_challenge(challenge)
      assert activated.status == "active"
    end

    test "fails for non-draft challenge", %{user: user} do
      challenge = challenge_fixture(user, %{status: "active"})
      assert {:error, :invalid_status_transition} = Challenges.activate_challenge(challenge)
    end
  end

  describe "close_challenge/1" do
    test "closes an active challenge", %{user: user} do
      challenge = challenge_fixture(user)
      assert {:ok, closed} = Challenges.close_challenge(challenge)
      assert closed.status == "closed"
    end

    test "fails for non-active challenge", %{user: user} do
      challenge = challenge_fixture(user, %{status: "draft"})
      assert {:error, :invalid_status_transition} = Challenges.close_challenge(challenge)
    end
  end

  describe "verify_access_code/2" do
    test "returns true for correct code", %{user: user} do
      challenge = challenge_fixture(user, %{access_code: "secret123"})
      assert Challenges.verify_access_code(challenge, "secret123")
    end

    test "returns false for incorrect code", %{user: user} do
      challenge = challenge_fixture(user, %{access_code: "secret123"})
      refute Challenges.verify_access_code(challenge, "wrong")
    end

    test "returns false when no access code is set", %{user: user} do
      challenge = challenge_fixture(user)
      refute Challenges.verify_access_code(challenge, "anything")
    end
  end

  describe "list_responses/1" do
    test "returns shares linked to the challenge", %{user: user} do
      challenge = challenge_fixture(user)
      share = HeyiAm.SharesFixtures.share_fixture(%{challenge_id: challenge.id})
      responses = Challenges.list_responses(challenge)
      assert length(responses) == 1
      assert hd(responses).id == share.id
    end

    test "returns empty list when no responses", %{user: user} do
      challenge = challenge_fixture(user)
      assert Challenges.list_responses(challenge) == []
    end
  end

  describe "accepting_responses?/1" do
    test "returns true for active challenge with no max", %{user: user} do
      challenge = challenge_fixture(user)
      assert Challenges.accepting_responses?(challenge)
    end

    test "returns false for draft challenge", %{user: user} do
      challenge = challenge_fixture(user, %{status: "draft"})
      refute Challenges.accepting_responses?(challenge)
    end

    test "returns false when max responses reached", %{user: user} do
      challenge = challenge_fixture(user, %{max_responses: 1})
      HeyiAm.SharesFixtures.share_fixture(%{challenge_id: challenge.id})
      refute Challenges.accepting_responses?(challenge)
    end

    test "returns true when under max responses", %{user: user} do
      challenge = challenge_fixture(user, %{max_responses: 2})
      HeyiAm.SharesFixtures.share_fixture(%{challenge_id: challenge.id})
      assert Challenges.accepting_responses?(challenge)
    end
  end

  describe "Challenge schema" do
    test "has_access_code?/1 returns true when hash exists", %{user: user} do
      challenge = challenge_fixture(user, %{access_code: "code"})
      assert Challenge.has_access_code?(challenge)
    end

    test "has_access_code?/1 returns false when no hash", %{user: user} do
      challenge = challenge_fixture(user)
      refute Challenge.has_access_code?(challenge)
    end

    test "generate_slug/0 returns a URL-safe string" do
      slug = Challenge.generate_slug()
      assert is_binary(slug)
      assert String.length(slug) > 0
      assert slug =~ ~r/^[A-Za-z0-9_-]+$/
    end
  end
end
