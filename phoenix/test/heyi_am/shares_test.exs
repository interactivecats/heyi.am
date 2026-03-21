defmodule HeyiAm.SharesTest do
  use HeyiAm.DataCase

  alias HeyiAm.Shares
  alias HeyiAm.Shares.Share

  import HeyiAm.SharesFixtures
  import HeyiAm.AccountsFixtures

  describe "Share.changeset/2" do
    test "valid with required fields" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "Test"})
      assert changeset.valid?
    end

    test "requires token" do
      changeset = Share.changeset(%Share{}, %{title: "Test"})
      refute changeset.valid?
      assert %{token: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires title" do
      changeset = Share.changeset(%Share{}, %{token: "abc"})
      refute changeset.valid?
      assert %{title: ["can't be blank"]} = errors_on(changeset)
    end

    test "validates template inclusion" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "Test", template: "invalid"})
      refute changeset.valid?
      assert %{template: ["is invalid"]} = errors_on(changeset)
    end

    test "accepts all valid templates" do
      for template <- Share.valid_templates() do
        changeset = Share.changeset(%Share{}, %{token: "t-#{template}", title: "Test", template: template})
        assert changeset.valid?, "expected #{template} to be valid"
      end
    end

    test "enforces unique token" do
      share_fixture(%{token: "unique-token"})
      {:error, changeset} = Shares.create_share(%{token: "unique-token", title: "Dup"})
      assert {"has already been taken", _} = changeset.errors[:token]
    end
  end

  describe "create_share/1" do
    test "creates a share with valid attrs" do
      attrs = valid_share_attributes(%{dev_take: "Some take", language: "Elixir"})
      {:ok, share} = Shares.create_share(attrs)
      assert share.token == attrs.token
      assert share.title == attrs.title
      assert share.dev_take == "Some take"
      assert share.language == "Elixir"
    end

    test "returns error with invalid attrs" do
      {:error, changeset} = Shares.create_share(%{})
      refute changeset.valid?
    end
  end

  describe "get_share_by_token!/1" do
    test "returns the share" do
      share = share_fixture()
      found = Shares.get_share_by_token!(share.token)
      assert found.id == share.id
    end

    test "raises for missing token" do
      assert_raise Ecto.NoResultsError, fn ->
        Shares.get_share_by_token!("nonexistent")
      end
    end
  end

  describe "get_share_by_token/1" do
    test "returns the share" do
      share = share_fixture()
      assert %Share{} = Shares.get_share_by_token(share.token)
    end

    test "returns nil for missing token" do
      refute Shares.get_share_by_token("nonexistent")
    end
  end

  describe "update_share/2" do
    test "updates with valid attrs" do
      share = share_fixture()
      {:ok, updated} = Shares.update_share(share, %{title: "Updated"})
      assert updated.title == "Updated"
    end

    test "returns error with invalid template" do
      share = share_fixture()
      {:error, changeset} = Shares.update_share(share, %{template: "bad"})
      refute changeset.valid?
    end
  end

  describe "delete_share/1" do
    test "deletes the share" do
      share = share_fixture()
      {:ok, _} = Shares.delete_share(share)
      refute Shares.get_share_by_token(share.token)
    end
  end

  describe "list_shares_for_user/1" do
    test "returns shares for user" do
      user = user_fixture()
      share = share_fixture(%{user_id: user.id})
      shares = Shares.list_shares_for_user(user.id)
      assert length(shares) == 1
      assert hd(shares).id == share.id
    end

    test "does not return other users' shares" do
      user1 = user_fixture()
      user2 = user_fixture()
      share_fixture(%{user_id: user1.id})
      assert Shares.list_shares_for_user(user2.id) == []
    end
  end

  describe "sealed immutability" do
    test "sealed shares cannot be modified" do
      share = share_fixture(%{sealed: true})
      {:error, changeset} = Shares.update_share(share, %{title: "Hacked"})
      assert %{sealed: ["sealed sessions cannot be modified"]} = errors_on(changeset)
    end

    test "non-sealed shares can be modified" do
      share = share_fixture(%{sealed: false})
      {:ok, updated} = Shares.update_share(share, %{title: "Updated"})
      assert updated.title == "Updated"
    end
  end

  describe "generate_token/0" do
    test "returns a URL-safe string" do
      token = Shares.generate_token()
      assert is_binary(token)
      assert String.length(token) > 20
      assert token =~ ~r/^[A-Za-z0-9_-]+$/
    end

    test "generates unique tokens" do
      tokens = for _ <- 1..10, do: Shares.generate_token()
      assert length(Enum.uniq(tokens)) == 10
    end
  end
end
