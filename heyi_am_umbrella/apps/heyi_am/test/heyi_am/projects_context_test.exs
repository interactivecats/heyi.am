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
  end
end
