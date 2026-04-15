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

    test "accepts context within 500 chars" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "Test", context: String.duplicate("x", 500)})
      assert changeset.valid?
    end

    test "rejects context over 500 chars" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "Test", context: String.duplicate("x", 501)})
      refute changeset.valid?
      assert %{context: ["should be at most 500 character(s)"]} = errors_on(changeset)
    end

    test "allows nil context" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "Test"})
      assert changeset.valid?
      assert get_change(changeset, :context) == nil
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

    test "persists context field" do
      attrs = valid_share_attributes(%{context: "Needed a fast search over 1M rows without a full table scan."})
      {:ok, share} = Shares.create_share(attrs)
      assert share.context == "Needed a fast search over 1M rows without a full table scan."
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

  describe "agent_summary field" do
    test "creates share with agent_summary map" do
      attrs = valid_share_attributes(%{
        agent_summary: %{"is_orchestrated" => true, "agents" => [%{"name" => "sub1"}]}
      })
      {:ok, share} = Shares.create_share(attrs)
      assert share.agent_summary == %{"is_orchestrated" => true, "agents" => [%{"name" => "sub1"}]}
    end

    test "agent_summary defaults to nil" do
      {:ok, share} = Shares.create_share(valid_share_attributes())
      assert share.agent_summary == nil
    end
  end

  describe "unique (project_id, slug) constraint" do
    test "rejects duplicate project_id + slug" do
      user = user_fixture()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "dup-test", title: "Dup", user_id: user.id})

      attrs1 = valid_share_attributes(%{slug: "same-slug", project_id: project.id, user_id: user.id})
      {:ok, _} = Shares.create_share(attrs1)

      attrs2 = valid_share_attributes(%{slug: "same-slug", project_id: project.id, user_id: user.id})
      {:error, changeset} = Shares.create_share(attrs2)
      assert {"has already been taken", _} = changeset.errors[:slug]
    end

    test "allows same slug with different project_id" do
      user = user_fixture()
      {:ok, proj1} = HeyiAm.Projects.create_project(%{slug: "proj-a", title: "A", user_id: user.id})
      {:ok, proj2} = HeyiAm.Projects.create_project(%{slug: "proj-b", title: "B", user_id: user.id})

      attrs1 = valid_share_attributes(%{slug: "same-slug", project_id: proj1.id, user_id: user.id})
      {:ok, _} = Shares.create_share(attrs1)

      attrs2 = valid_share_attributes(%{slug: "same-slug", project_id: proj2.id, user_id: user.id})
      {:ok, _} = Shares.create_share(attrs2)
    end

    test "allows same slug when project_id is nil" do
      attrs1 = valid_share_attributes(%{slug: "orphan-slug"})
      {:ok, _} = Shares.create_share(attrs1)

      attrs2 = valid_share_attributes(%{slug: "orphan-slug"})
      {:ok, _} = Shares.create_share(attrs2)
    end
  end

  describe "list_shares_for_project/1" do
    test "returns listed and unlisted shares, excludes drafts" do
      user = user_fixture()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "list-test", title: "List", user_id: user.id})

      share_fixture(%{project_id: project.id, user_id: user.id, status: "listed"})
      share_fixture(%{project_id: project.id, user_id: user.id, status: "unlisted"})
      share_fixture(%{project_id: project.id, user_id: user.id, status: "draft"})

      shares = Shares.list_shares_for_project(project.id)
      assert length(shares) == 2
      assert Enum.all?(shares, &(&1.status != "draft"))
    end

    test "does not return shares from other projects" do
      user = user_fixture()
      {:ok, proj1} = HeyiAm.Projects.create_project(%{slug: "proj-1", title: "P1", user_id: user.id})
      {:ok, proj2} = HeyiAm.Projects.create_project(%{slug: "proj-2", title: "P2", user_id: user.id})

      share_fixture(%{project_id: proj1.id, user_id: user.id, status: "listed"})
      share_fixture(%{project_id: proj2.id, user_id: user.id, status: "listed"})

      shares = Shares.list_shares_for_project(proj1.id)
      assert length(shares) == 1
    end
  end

  describe "list_unassigned_shares_for_user/1" do
    test "returns shares without a project" do
      user = user_fixture()
      share_fixture(%{user_id: user.id, status: "draft"})

      shares = Shares.list_unassigned_shares_for_user(user.id)
      assert length(shares) == 1
    end

    test "excludes shares with a project" do
      user = user_fixture()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "assigned", title: "Assigned", user_id: user.id})
      share_fixture(%{user_id: user.id, project_id: project.id})

      assert Shares.list_unassigned_shares_for_user(user.id) == []
    end

    test "does not return other users' shares" do
      user1 = user_fixture()
      user2 = user_fixture()
      share_fixture(%{user_id: user1.id})

      assert Shares.list_unassigned_shares_for_user(user2.id) == []
    end
  end

  describe "get_user_share/2" do
    test "returns share for correct owner" do
      user = user_fixture()
      share = share_fixture(%{user_id: user.id})

      assert Shares.get_user_share(user.id, share.id) != nil
    end

    test "returns nil for wrong owner" do
      user1 = user_fixture()
      user2 = user_fixture()
      share = share_fixture(%{user_id: user1.id})

      assert Shares.get_user_share(user2.id, share.id) == nil
    end
  end

  describe "update_project_shares_status/2" do
    test "updates unlisted shares to listed for a project" do
      user = user_fixture()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "status-proj", title: "Status", user_id: user.id})

      share_fixture(%{project_id: project.id, user_id: user.id, status: "unlisted"})
      share_fixture(%{project_id: project.id, user_id: user.id, status: "unlisted"})

      {:ok, count} = Shares.update_project_shares_status(project.id, "listed")
      assert count == 2

      shares = Shares.list_shares_for_project(project.id)
      assert Enum.all?(shares, &(&1.status == "listed"))
    end

    test "skips archived shares" do
      user = user_fixture()
      {:ok, project} = HeyiAm.Projects.create_project(%{slug: "skip-arch", title: "Skip", user_id: user.id})

      s1 = share_fixture(%{project_id: project.id, user_id: user.id, status: "unlisted"})
      {:ok, _} = Shares.update_share(s1, %{status: "archived"})
      share_fixture(%{project_id: project.id, user_id: user.id, status: "listed"})

      {:ok, count} = Shares.update_project_shares_status(project.id, "unlisted")
      assert count == 1
    end

    test "returns 0 when no matching shares exist" do
      {:ok, count} = Shares.update_project_shares_status(-1, "listed")
      assert count == 0
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
