defmodule HeyiAm.Shares.ShareTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Shares.Share

  describe "changeset/2 length validations" do
    test "rejects title longer than 200 characters" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: String.duplicate("a", 201)})
      assert %{title: ["should be at most 200 character(s)"]} = errors_on(changeset)
    end

    test "rejects dev_take longer than 2000 characters" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "ok", dev_take: String.duplicate("a", 2001)})
      assert %{dev_take: ["should be at most 2000 character(s)"]} = errors_on(changeset)
    end

    test "rejects narrative longer than 10000 characters" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "ok", narrative: String.duplicate("a", 10001)})
      assert %{narrative: ["should be at most 10000 character(s)"]} = errors_on(changeset)
    end

    test "rejects project_name longer than 200 characters" do
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "ok", project_name: String.duplicate("a", 201)})
      assert %{project_name: ["should be at most 200 character(s)"]} = errors_on(changeset)
    end

    test "rejects more than 50 skills" do
      skills = for i <- 1..51, do: "skill_#{i}"
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "ok", skills: skills})
      assert %{skills: ["cannot have more than 50 items"]} = errors_on(changeset)
    end

    test "accepts 50 skills" do
      skills = for i <- 1..50, do: "skill_#{i}"
      changeset = Share.changeset(%Share{}, %{token: "abc", title: "ok", skills: skills})
      refute Map.has_key?(errors_on(changeset), :skills)
    end
  end

  describe "changeset/2 sealed protection" do
    test "sealed sessions cannot be modified" do
      changeset = Share.changeset(%Share{sealed: true}, %{title: "new title"})
      assert %{sealed: ["sealed sessions cannot be modified"]} = errors_on(changeset)
    end
  end
end
