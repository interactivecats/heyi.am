defmodule HeyiAm.AccountsGDPRTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Accounts
  alias HeyiAm.Repo
  import HeyiAm.AccountsFixtures
  import HeyiAm.SharesFixtures

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

    test "returns empty lists when user has no data", %{user: user} do
      {:ok, data} = Accounts.export_user_data(user)

      assert data.shares == []
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

      new_user = user_fixture()
      {:ok, new_user} = Accounts.update_user_username(new_user, %{username: "testuser"})
      assert new_user.username == "testuser"
    end

    test "frees email for re-registration", %{user: user} do
      original_email = user.email
      {:ok, _} = Accounts.delete_user_account(user)

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
      assert anon.token =~ "deleted-"
      assert anon.duration_minutes == share.duration_minutes
      assert anon.turns == share.turns
      assert anon.files_changed == share.files_changed
      assert anon.tools == share.tools
      assert anon.skills == share.skills
    end

    test "deletes user's tokens", %{user: user} do
      token = Accounts.generate_user_session_token(user)
      {:ok, _} = Accounts.delete_user_account(user)

      assert is_nil(Accounts.get_user_by_session_token(token))
    end

    test "does not affect other users' shares", %{user: user} do
      other_user = user_fixture()
      other_share = share_fixture(%{user_id: other_user.id, title: "Keep this"})

      {:ok, _} = Accounts.delete_user_account(user)

      intact = Repo.get(HeyiAm.Shares.Share, other_share.id)
      assert intact.title == "Keep this"
      assert intact.user_id == other_user.id
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

    test "no orphaned records remain after account deletion", %{user: user} do
      share = share_fixture(%{user_id: user.id})
      Accounts.generate_user_session_token(user)

      {:ok, _} = Accounts.delete_user_account(user)

      anon_user = Repo.get(Accounts.User, user.id)
      assert anon_user
      assert anon_user.status == "deleted"
      assert anon_user.username == nil
      assert Repo.all(from(t in Accounts.UserToken, where: t.user_id == ^user.id)) == []
      anon_share = Repo.get(HeyiAm.Shares.Share, share.id)
      assert anon_share
      assert anon_share.user_id == nil
      assert anon_share.title == "deleted"
    end
  end
end
