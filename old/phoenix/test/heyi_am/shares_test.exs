defmodule HeyiAm.SharesTest do
  use HeyiAm.DataCase

  alias HeyiAm.Shares
  alias HeyiAm.Shares.Share

  describe "share changeset" do
    test "valid changeset with all fields" do
      attrs = %{
        token: "test_token",
        delete_token: "test_delete_token",
        title: "Built a CLI tool",
        context: "Needed to share sessions without exposing code",
        developer_take: "The tricky part was extracting signal from messy sessions"
      }

      changeset = Share.changeset(%Share{}, attrs)
      assert changeset.valid?
    end

    test "context enforces 200 char limit" do
      attrs = %{
        token: "test_token",
        delete_token: "test_delete_token",
        title: "Test",
        context: String.duplicate("a", 201)
      }

      changeset = Share.changeset(%Share{}, attrs)
      refute changeset.valid?
      assert {"should be at most %{count} character(s)", _} = changeset.errors[:context]
    end

    test "context allows exactly 200 chars" do
      attrs = %{
        token: "test_token",
        delete_token: "test_delete_token",
        title: "Test",
        context: String.duplicate("a", 200)
      }

      changeset = Share.changeset(%Share{}, attrs)
      assert changeset.valid?
    end

    test "developer_take enforces 300 char limit" do
      attrs = %{
        token: "test_token",
        delete_token: "test_delete_token",
        title: "Test",
        developer_take: String.duplicate("a", 301)
      }

      changeset = Share.changeset(%Share{}, attrs)
      refute changeset.valid?
      assert {"should be at most %{count} character(s)", _} = changeset.errors[:developer_take]
    end

    test "developer_take allows exactly 300 chars" do
      attrs = %{
        token: "test_token",
        delete_token: "test_delete_token",
        title: "Test",
        developer_take: String.duplicate("a", 300)
      }

      changeset = Share.changeset(%Share{}, attrs)
      assert changeset.valid?
    end
  end

  describe "upsert_share/1" do
    test "creates a new share with context and developer_take" do
      attrs = %{
        title: "Test Session",
        context: "Needed a better way to handle auth",
        developer_take: "This was my first time using device auth flow"
      }

      assert {:ok, share, :created} = Shares.upsert_share(attrs)
      assert share.title == "Test Session"
      assert share.context == "Needed a better way to handle auth"
      assert share.developer_take == "This was my first time using device auth flow"
      assert share.token != nil
      assert share.delete_token != nil
    end

    test "updates existing share by machine_token + session_id" do
      attrs = %{
        title: "Original",
        machine_token: "mt_test_123",
        session_id: "sess_001",
        developer_take: "First take"
      }

      {:ok, share1, :created} = Shares.upsert_share(attrs)

      updated_attrs = %{
        title: "Updated",
        machine_token: "mt_test_123",
        session_id: "sess_001",
        developer_take: "Revised take"
      }

      {:ok, share2, :updated} = Shares.upsert_share(updated_attrs)
      assert share2.id == share1.id
      assert share2.title == "Updated"
      assert share2.developer_take == "Revised take"
    end
  end

  describe "get_by_token/1" do
    test "returns share by public token" do
      {:ok, share, :created} = Shares.upsert_share(%{title: "Find me"})
      found = Shares.get_by_token(share.token)
      assert found.id == share.id
    end

    test "returns nil for unknown token" do
      assert Shares.get_by_token("nonexistent") == nil
    end
  end

  describe "seal_share/1" do
    test "seals an unsealed share" do
      {:ok, share, :created} = Shares.upsert_share(%{title: "Seal me"})
      assert {:ok, sealed} = Shares.seal_share(share)
      assert sealed.sealed_at != nil
      assert sealed.seal_signature != nil
    end

    test "rejects sealing an already sealed share" do
      {:ok, share, :created} = Shares.upsert_share(%{title: "Already sealed"})
      {:ok, sealed} = Shares.seal_share(share)
      assert {:error, :already_sealed} = Shares.seal_share(sealed)
    end

    test "sealed share cannot be updated via changeset" do
      {:ok, share, :created} = Shares.upsert_share(%{title: "Immutable"})
      {:ok, sealed} = Shares.seal_share(share)

      changeset = Share.changeset(sealed, %{title: "Changed"})
      refute changeset.valid?
      assert {"cannot update a sealed session", _} = changeset.errors[:sealed_at]
    end
  end

  describe "delete_share_by_token/2" do
    test "deletes with correct delete_token" do
      {:ok, share, :created} = Shares.upsert_share(%{title: "Delete me"})
      assert {:ok, _} = Shares.delete_share_by_token(share.token, share.delete_token)
      assert Shares.get_by_token(share.token) == nil
    end

    test "rejects incorrect delete_token" do
      {:ok, share, :created} = Shares.upsert_share(%{title: "Protected"})
      assert {:error, :forbidden} = Shares.delete_share_by_token(share.token, "wrong_token")
    end

    test "returns not_found for unknown token" do
      assert {:error, :not_found} = Shares.delete_share_by_token("nope", "whatever")
    end
  end
end
