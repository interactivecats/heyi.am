defmodule HeyiAm.ProjectsTest do
  use HeyiAm.DataCase

  alias HeyiAm.Projects
  alias HeyiAm.Projects.Project

  defp create_user do
    HeyiAm.AccountsFixtures.user_fixture()
  end

  describe "Project changeset" do
    test "valid changeset with required fields" do
      changeset = Project.changeset(%Project{user_id: 1}, %{project_key: "my-project"})
      assert changeset.valid?
    end

    test "requires project_key" do
      changeset = Project.changeset(%Project{user_id: 1}, %{})
      refute changeset.valid?
      assert {"can't be blank", _} = changeset.errors[:project_key]
    end

    test "display_name enforces 80 char limit" do
      changeset =
        Project.changeset(%Project{user_id: 1}, %{
          project_key: "test",
          display_name: String.duplicate("a", 81)
        })

      refute changeset.valid?
      assert {"should be at most %{count} character(s)", _} = changeset.errors[:display_name]
    end

    test "display_name allows exactly 80 chars" do
      changeset =
        Project.changeset(%Project{user_id: 1}, %{
          project_key: "test",
          display_name: String.duplicate("a", 80)
        })

      assert changeset.valid?
    end

    test "description enforces 300 char limit" do
      changeset =
        Project.changeset(%Project{user_id: 1}, %{
          project_key: "test",
          description: String.duplicate("a", 301)
        })

      refute changeset.valid?
      assert {"should be at most %{count} character(s)", _} = changeset.errors[:description]
    end

    test "featured_quote enforces 300 char limit" do
      changeset =
        Project.changeset(%Project{user_id: 1}, %{
          project_key: "test",
          featured_quote: String.duplicate("a", 301)
        })

      refute changeset.valid?
      assert {"should be at most %{count} character(s)", _} = changeset.errors[:featured_quote]
    end

    test "position must be non-negative" do
      changeset =
        Project.changeset(%Project{user_id: 1}, %{
          project_key: "test",
          position: -1
        })

      refute changeset.valid?
      assert {"must be greater than or equal to %{number}", _} = changeset.errors[:position]
    end
  end

  describe "find_or_create_project/3" do
    test "creates a new project" do
      user = create_user()
      assert {:ok, project} = Projects.find_or_create_project(user.id, "my-app")
      assert project.project_key == "my-app"
      assert project.user_id == user.id
    end

    test "returns existing project on duplicate key" do
      user = create_user()
      {:ok, project1} = Projects.find_or_create_project(user.id, "my-app")
      {:ok, project2} = Projects.find_or_create_project(user.id, "my-app")
      assert project1.id == project2.id
    end

    test "creates with optional attrs" do
      user = create_user()

      {:ok, project} =
        Projects.find_or_create_project(user.id, "my-app", %{
          display_name: "My App",
          description: "A cool app"
        })

      assert project.display_name == "My App"
      assert project.description == "A cool app"
    end
  end

  describe "get_user_projects/1" do
    test "returns projects ordered by position" do
      user = create_user()
      {:ok, _p1} = Projects.find_or_create_project(user.id, "beta", %{position: 2})
      {:ok, _p2} = Projects.find_or_create_project(user.id, "alpha", %{position: 1})

      projects = Projects.get_user_projects(user.id)
      assert length(projects) == 2
      assert hd(projects).project_key == "alpha"
    end

    test "returns empty list for user with no projects" do
      user = create_user()
      assert Projects.get_user_projects(user.id) == []
    end
  end

  describe "get_project/2" do
    test "returns project by user_id and project_key" do
      user = create_user()
      {:ok, project} = Projects.find_or_create_project(user.id, "my-app")
      found = Projects.get_project(user.id, "my-app")
      assert found.id == project.id
    end

    test "returns nil for non-existent project" do
      user = create_user()
      assert Projects.get_project(user.id, "nope") == nil
    end
  end

  describe "update_project/2" do
    test "updates project fields" do
      user = create_user()
      {:ok, project} = Projects.find_or_create_project(user.id, "my-app")

      {:ok, updated} =
        Projects.update_project(project, %{
          display_name: "Updated Name",
          description: "New description"
        })

      assert updated.display_name == "Updated Name"
      assert updated.description == "New description"
      # project_key should not change
      assert updated.project_key == "my-app"
    end

    test "rejects invalid updates" do
      user = create_user()
      {:ok, project} = Projects.find_or_create_project(user.id, "my-app")

      {:error, changeset} =
        Projects.update_project(project, %{display_name: String.duplicate("x", 81)})

      refute changeset.valid?
    end
  end

  describe "sync_project_settings/3" do
    test "creates and updates in one call" do
      user = create_user()

      {:ok, project} =
        Projects.sync_project_settings(user.id, "cli-tool", %{
          display_name: "CLI Tool",
          featured_quote: "It just works"
        })

      assert project.project_key == "cli-tool"
      assert project.display_name == "CLI Tool"
      assert project.featured_quote == "It just works"
    end

    test "is idempotent" do
      user = create_user()

      {:ok, p1} =
        Projects.sync_project_settings(user.id, "cli-tool", %{display_name: "V1"})

      {:ok, p2} =
        Projects.sync_project_settings(user.id, "cli-tool", %{display_name: "V2"})

      assert p1.id == p2.id
      assert p2.display_name == "V2"
    end
  end
end
