defmodule HeyiAm.ProjectsFixtures do
  alias HeyiAm.Projects

  def project_fixture(user_id, attrs \\ %{}) do
    attrs =
      Enum.into(attrs, %{
        slug: "test-project-#{System.unique_integer([:positive])}",
        title: "Test Project"
      })

    {:ok, project} = Projects.upsert_project(user_id, attrs)
    project
  end
end
