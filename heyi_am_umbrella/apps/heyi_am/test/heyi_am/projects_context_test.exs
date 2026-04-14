defmodule HeyiAm.ProjectsContextTest do
  use HeyiAm.DataCase

  import HeyiAm.AccountsFixtures
  import HeyiAm.ProjectsFixtures

  alias HeyiAm.Projects
  alias HeyiAm.Shares

  defp make_user do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "ctx-user-#{System.unique_integer([:positive])}"})
    user
  end

  describe "upsert_project/2" do
    test "creates a new project" do
      user = make_user()
      {:ok, project} = Projects.upsert_project(user.id, %{slug: "new-proj", title: "New Project"})
      assert project.slug == "new-proj"
      assert project.user_id == user.id
    end

    test "updates existing project on same slug" do
      user = make_user()
      {:ok, _} = Projects.upsert_project(user.id, %{slug: "same-slug", title: "Original"})
      {:ok, updated} = Projects.upsert_project(user.id, %{slug: "same-slug", title: "Updated"})
      assert updated.slug == "same-slug"
      assert updated.title == "Updated"
    end

    test "two users can each have the same slug" do
      user1 = make_user()
      user2 = make_user()
      {:ok, p1} = Projects.upsert_project(user1.id, %{slug: "shared", title: "User 1"})
      {:ok, p2} = Projects.upsert_project(user2.id, %{slug: "shared", title: "User 2"})
      assert p1.id != p2.id
    end
  end

  describe "get_user_project/2" do
    test "returns project for correct owner" do
      user = make_user()
      project = project_fixture(user.id, %{slug: "my-proj"})
      assert Projects.get_user_project(user.id, project.id) != nil
    end

    test "returns nil for wrong owner" do
      user1 = make_user()
      user2 = make_user()
      project = project_fixture(user1.id, %{slug: "their-proj"})
      assert Projects.get_user_project(user2.id, project.id) == nil
    end
  end

  describe "list_user_projects_with_published_shares/1" do
    test "returns projects with only published shares" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "proj", title: "Project", user_id: user.id})

      {:ok, _listed} = Shares.create_share(%{token: "t-listed", title: "Listed", status: "listed", user_id: user.id, project_id: project.id})
      {:ok, _draft} = Shares.create_share(%{token: "t-draft", title: "Draft", status: "draft", user_id: user.id, project_id: project.id})

      [result] = Projects.list_user_projects_with_published_shares(user.id)
      assert length(result.shares) == 1
      assert hd(result.shares).token == "t-listed"
    end

    test "returns empty list when user has no projects" do
      user = make_user()
      assert Projects.list_user_projects_with_published_shares(user.id) == []
    end

    test "does not include other users' projects" do
      user1 = make_user()
      user2 = make_user()
      project_fixture(user1.id, %{slug: "user1-proj"})

      assert Projects.list_user_projects_with_published_shares(user2.id) == []
    end
  end

  describe "list_user_projects_with_all_shares/1" do
    test "returns projects with all shares including drafts" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "all-shares", title: "All", user_id: user.id})

      {:ok, _listed} = Shares.create_share(%{token: "t-all-listed", title: "Listed", status: "listed", user_id: user.id, project_id: project.id})
      {:ok, _draft} = Shares.create_share(%{token: "t-all-draft", title: "Draft", status: "draft", user_id: user.id, project_id: project.id})
      {:ok, _unlisted} = Shares.create_share(%{token: "t-all-unlisted", title: "Unlisted", status: "unlisted", user_id: user.id, project_id: project.id})

      [result] = Projects.list_user_projects_with_all_shares(user.id)
      assert length(result.shares) == 3
    end

    test "does not include other users' projects" do
      user1 = make_user()
      user2 = make_user()
      project_fixture(user1.id, %{slug: "user1-all"})

      assert Projects.list_user_projects_with_all_shares(user2.id) == []
    end
  end

  describe "get_project_with_published_shares/2" do
    test "returns project with published shares by slug" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "target", title: "Target", user_id: user.id})
      {:ok, _} = Shares.create_share(%{token: "t-pub", title: "Published", status: "listed", user_id: user.id, project_id: project.id})

      result = Projects.get_project_with_published_shares(user.id, "target")
      assert result.slug == "target"
      assert length(result.shares) == 1
    end

    test "returns nil for wrong user" do
      user1 = make_user()
      user2 = make_user()
      project_fixture(user1.id, %{slug: "not-yours"})

      assert Projects.get_project_with_published_shares(user2.id, "not-yours") == nil
    end

    test "returns nil for non-existent slug" do
      user = make_user()
      assert Projects.get_project_with_published_shares(user.id, "ghost") == nil
    end

    test "excludes draft shares" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "proj-d", title: "Proj", user_id: user.id})
      {:ok, _} = Shares.create_share(%{token: "t-d", title: "Draft", status: "draft", user_id: user.id, project_id: project.id})

      result = Projects.get_project_with_published_shares(user.id, "proj-d")
      assert result.shares == []
    end

    test "excludes unlisted shares" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "proj-u", title: "Proj", user_id: user.id})
      {:ok, _} = Shares.create_share(%{token: "t-u", title: "Unlisted", status: "unlisted", user_id: user.id, project_id: project.id})

      result = Projects.get_project_with_published_shares(user.id, "proj-u")
      assert result.shares == []
    end
  end

  describe "get_project_with_accessible_shares/2" do
    test "returns listed and unlisted shares" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "acc-proj", title: "Accessible", user_id: user.id})
      {:ok, _} = Shares.create_share(%{token: "t-acc-listed", title: "Listed", status: "listed", user_id: user.id, project_id: project.id})
      {:ok, _} = Shares.create_share(%{token: "t-acc-unlisted", title: "Unlisted", status: "unlisted", user_id: user.id, project_id: project.id})

      result = Projects.get_project_with_accessible_shares(user.id, "acc-proj")
      assert length(result.shares) == 2
    end

    test "excludes draft shares" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "acc-draft", title: "Draft", user_id: user.id})
      {:ok, _} = Shares.create_share(%{token: "t-acc-d", title: "Draft", status: "draft", user_id: user.id, project_id: project.id})

      result = Projects.get_project_with_accessible_shares(user.id, "acc-draft")
      assert result.shares == []
    end

    test "returns nil for wrong user" do
      user1 = make_user()
      user2 = make_user()
      project_fixture(user1.id, %{slug: "acc-nope"})

      assert Projects.get_project_with_accessible_shares(user2.id, "acc-nope") == nil
    end

    test "returns nil for non-existent slug" do
      user = make_user()
      assert Projects.get_project_with_accessible_shares(user.id, "ghost") == nil
    end
  end

  describe "unlisted_token" do
    test "auto-generates token on project creation" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "token-proj", title: "Token", user_id: user.id})
      assert is_binary(project.unlisted_token)
      assert byte_size(project.unlisted_token) > 20
    end

    test "preserves token on update" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "stable-token", title: "Stable", user_id: user.id})
      original_token = project.unlisted_token

      {:ok, updated} = Projects.update_project(project, %{title: "Updated Title"})
      assert updated.unlisted_token == original_token
    end

    test "each project gets a unique token" do
      user = make_user()
      {:ok, p1} = Projects.create_project(%{slug: "uniq-1", title: "One", user_id: user.id})
      {:ok, p2} = Projects.create_project(%{slug: "uniq-2", title: "Two", user_id: user.id})
      assert p1.unlisted_token != p2.unlisted_token
    end
  end

  describe "delete_project/2" do
    test "deletes project owned by user" do
      user = make_user()
      {:ok, _project} = Projects.create_project(%{slug: "del-mine", title: "Delete Me", user_id: user.id})
      assert {:ok, _deleted} = Projects.delete_project(user.id, "del-mine")
      assert Projects.get_user_project_by_slug(user.id, "del-mine") == nil
    end

    test "returns not_found for wrong user (BOLA protection)" do
      user1 = make_user()
      user2 = make_user()
      {:ok, _project} = Projects.create_project(%{slug: "not-yours", title: "Theirs", user_id: user1.id})

      assert {:error, :not_found} = Projects.delete_project(user2.id, "not-yours")
      # Verify project still exists
      assert Projects.get_user_project_by_slug(user1.id, "not-yours") != nil
    end

    test "returns not_found for non-existent slug" do
      user = make_user()
      assert {:error, :not_found} = Projects.delete_project(user.id, "ghost-project")
    end

    test "cascades delete to all shares attached to the project" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "cascade-me", title: "Cascade", user_id: user.id})

      {:ok, s1} =
        Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "cascade-tok-1",
          title: "One"
        })

      {:ok, s2} =
        Shares.create_share(%{
          user_id: user.id,
          project_id: project.id,
          token: "cascade-tok-2",
          title: "Two"
        })

      assert {:ok, _} = Projects.delete_project(user.id, "cascade-me")

      assert Shares.get_share_by_token(s1.token) == nil
      assert Shares.get_share_by_token(s2.token) == nil
    end

    test "does not delete shares belonging to other projects" do
      user = make_user()
      {:ok, target} = Projects.create_project(%{slug: "target", title: "Target", user_id: user.id})
      {:ok, bystander} = Projects.create_project(%{slug: "bystander", title: "Bystander", user_id: user.id})

      {:ok, _} =
        Shares.create_share(%{
          user_id: user.id,
          project_id: target.id,
          token: "target-share",
          title: "Target Session"
        })

      {:ok, untouched} =
        Shares.create_share(%{
          user_id: user.id,
          project_id: bystander.id,
          token: "bystander-share",
          title: "Bystander Session"
        })

      assert {:ok, _} = Projects.delete_project(user.id, "target")
      assert Shares.get_share_by_token(untouched.token) != nil
      assert Projects.get_user_project_by_slug(user.id, "bystander") != nil
    end
  end

  describe "get_project_by_unlisted_token/1" do
    test "returns project with user and visible shares" do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "by-token", title: "By Token", user_id: user.id})
      {:ok, _} = Shares.create_share(%{token: "t-bt-listed", title: "Listed", status: "listed", user_id: user.id, project_id: project.id})
      {:ok, _} = Shares.create_share(%{token: "t-bt-draft", title: "Draft", status: "draft", user_id: user.id, project_id: project.id})

      result = Projects.get_project_by_unlisted_token(project.unlisted_token)
      assert result.id == project.id
      assert result.user.id == user.id
      assert length(result.shares) == 1
    end

    test "returns nil for unknown token" do
      assert Projects.get_project_by_unlisted_token("nonexistent-token") == nil
    end
  end
end
