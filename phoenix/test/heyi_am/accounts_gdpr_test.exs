defmodule HeyiAm.AccountsGDPRTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Accounts
  alias HeyiAm.Repo
  import HeyiAm.AccountsFixtures
  import HeyiAm.SharesFixtures
  import HeyiAm.ChallengesFixtures

  setup do
    user = user_fixture()
    {:ok, user} = Accounts.update_user_username(user, %{username: "testuser"})
    %{user: user}
  end

  describe "export_user_data/1" do
    test "returns profile data without sensitive fields", %{user: user} do
      {:ok, data} = Accounts.export_user_data(user)

      assert data.profile.email == user.email
      assert data.profile.username == "testuser"
      refute Map.has_key?(data.profile, :hashed_password)
      refute Map.has_key?(data.profile, :password)
    end

    test "includes user's shares", %{user: user} do
      share = share_fixture(%{user_id: user.id})
      {:ok, data} = Accounts.export_user_data(user)

      assert length(data.shares) == 1
      assert hd(data.shares).token == share.token
    end

    test "excludes other users' shares", %{user: user} do
      other_user = user_fixture()
      share_fixture(%{user_id: other_user.id})

      {:ok, data} = Accounts.export_user_data(user)
      assert data.shares == []
    end

    test "includes user's challenges", %{user: user} do
      challenge = challenge_fixture(user)
      {:ok, data} = Accounts.export_user_data(user)

      assert length(data.challenges) == 1
      assert hd(data.challenges).slug == challenge.slug
      refute Map.has_key?(hd(data.challenges), :access_code_hash)
    end

    test "returns empty lists when user has no data", %{user: user} do
      {:ok, data} = Accounts.export_user_data(user)

      assert data.shares == []
      assert data.portfolio_sessions == []
      assert data.challenges == []
    end

    test "includes exported_at timestamp", %{user: user} do
      {:ok, data} = Accounts.export_user_data(user)
      assert %DateTime{} = data.exported_at
    end
  end

  describe "delete_user_account/1" do
    test "anonymizes the user record", %{user: user} do
      {:ok, _} = Accounts.delete_user_account(user)

      anon = Repo.get(Accounts.User, user.id)
      assert anon
      assert anon.email =~ "deleted-"
      assert anon.email =~ "@deleted.heyi.am"
      assert anon.username == nil
      assert anon.display_name == nil
      assert anon.bio == nil
      assert anon.avatar_url == nil
      assert anon.github_id == nil
      assert anon.github_url == nil
      assert anon.location == nil
      assert anon.status == "deleted"
    end

    test "frees username for re-registration", %{user: user} do
      {:ok, _} = Accounts.delete_user_account(user)

      anon = Repo.get(Accounts.User, user.id)
      assert anon.username == nil

      # Another user can now claim the same username
      new_user = user_fixture()
      {:ok, new_user} = Accounts.update_user_username(new_user, %{username: "testuser"})
      assert new_user.username == "testuser"
    end

    test "frees email for re-registration", %{user: user} do
      original_email = user.email
      {:ok, _} = Accounts.delete_user_account(user)

      # Can register with the same email
      {:ok, new_user} = Accounts.register_user(%{email: original_email, password: "new valid password1"})
      assert new_user.email == original_email
    end

    test "anonymizes user's shares", %{user: user} do
      share = share_fixture(%{user_id: user.id, dev_take: "my take", narrative: "my narrative"})
      {:ok, _} = Accounts.delete_user_account(user)

      anon = Repo.get(HeyiAm.Shares.Share, share.id)
      assert anon
      assert anon.user_id == nil
      assert anon.title == "deleted"
      assert anon.dev_take == nil
      assert anon.narrative == nil
      assert anon.top_files == []
      assert anon.beats == []
      assert anon.token =~ "deleted-"
      # Stats preserved for aggregate counting
      assert anon.duration_minutes == share.duration_minutes
      assert anon.turns == share.turns
      assert anon.files_changed == share.files_changed
      assert anon.tools == share.tools
      assert anon.skills == share.skills
    end

    test "anonymizes user's challenges", %{user: user} do
      challenge = challenge_fixture(user)
      {:ok, _} = Accounts.delete_user_account(user)

      anon = Repo.get(HeyiAm.Challenges.Challenge, challenge.id)
      assert anon
      assert anon.title == "deleted"
      assert anon.problem_statement == ""
      assert anon.evaluation_criteria == []
      assert anon.access_code_hash == nil
      assert anon.status == "closed"
      # Slug and time_limit preserved for counting
      assert anon.slug == challenge.slug
      assert anon.time_limit_minutes == challenge.time_limit_minutes
    end

    test "deletes user's tokens", %{user: user} do
      token = Accounts.generate_user_session_token(user)
      {:ok, _} = Accounts.delete_user_account(user)

      refute Accounts.get_user_by_session_token(token)
    end

    test "does not affect other users' shares", %{user: user} do
      other_user = user_fixture()
      other_share = share_fixture(%{user_id: other_user.id, title: "Keep this"})

      {:ok, _} = Accounts.delete_user_account(user)

      intact = Repo.get(HeyiAm.Shares.Share, other_share.id)
      assert intact.title == "Keep this"
      assert intact.user_id == other_user.id
    end

    test "preserves portfolio_sessions for aggregate stats", %{user: user} do
      # share_fixture auto-creates a portfolio_session via create_share
      share = share_fixture(%{user_id: user.id})

      [ps] = Repo.all(from(ps in HeyiAm.Portfolios.PortfolioSession, where: ps.user_id == ^user.id))

      {:ok, _} = Accounts.delete_user_account(user)

      kept = Repo.get(HeyiAm.Portfolios.PortfolioSession, ps.id)
      assert kept
      assert kept.user_id == user.id
      assert kept.share_id == share.id
      assert kept.visible == ps.visible
      assert kept.position == ps.position
      assert kept.project_name == nil
    end

    test "anonymizes multiple shares with unique tokens", %{user: user} do
      s1 = share_fixture(%{user_id: user.id, title: "First"})
      s2 = share_fixture(%{user_id: user.id, title: "Second"})

      {:ok, _} = Accounts.delete_user_account(user)

      anon1 = Repo.get(HeyiAm.Shares.Share, s1.id)
      anon2 = Repo.get(HeyiAm.Shares.Share, s2.id)
      assert anon1.title == "deleted"
      assert anon2.title == "deleted"
      assert anon1.user_id == nil
      assert anon2.user_id == nil
      assert anon1.token != anon2.token
    end

    test "preserves other users' challenge responses when challenge is anonymized", %{user: user} do
      challenge = challenge_fixture(user)
      other_user = user_fixture()
      response = share_fixture(%{user_id: other_user.id, challenge_id: challenge.id})

      {:ok, _} = Accounts.delete_user_account(user)

      # Challenge is anonymized, response share keeps its data and challenge_id link
      updated_response = Repo.get(HeyiAm.Shares.Share, response.id)
      assert updated_response
      assert updated_response.user_id == other_user.id
      assert updated_response.challenge_id == challenge.id
    end

    test "no orphaned records remain after account deletion", %{user: user} do
      # share_fixture auto-creates a portfolio_session via create_share
      share = share_fixture(%{user_id: user.id})
      challenge_fixture(user)
      Accounts.generate_user_session_token(user)

      {:ok, _} = Accounts.delete_user_account(user)

      # User anonymized but still exists
      anon_user = Repo.get(Accounts.User, user.id)
      assert anon_user
      assert anon_user.status == "deleted"
      assert anon_user.username == nil
      # Portfolio sessions preserved (FKs still valid)
      ps_list = Repo.all(from(ps in HeyiAm.Portfolios.PortfolioSession, where: ps.user_id == ^user.id))
      assert length(ps_list) == 1
      # Tokens deleted
      assert Repo.all(from(t in Accounts.UserToken, where: t.user_id == ^user.id)) == []
      # Challenges anonymized (still exist)
      challenges = Repo.all(from(c in HeyiAm.Challenges.Challenge, where: c.creator_id == ^user.id))
      assert length(challenges) == 1
      assert hd(challenges).title == "deleted"
      # Share anonymized (still exists)
      anon_share = Repo.get(HeyiAm.Shares.Share, share.id)
      assert anon_share
      assert anon_share.user_id == nil
      assert anon_share.title == "deleted"
    end
  end
end
