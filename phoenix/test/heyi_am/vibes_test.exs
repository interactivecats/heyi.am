defmodule HeyiAm.VibesTest do
  use HeyiAm.DataCase

  alias HeyiAm.Vibes
  alias HeyiAm.Vibes.Vibe

  import HeyiAm.VibesFixtures

  describe "Vibe.changeset/2" do
    test "valid with all required fields" do
      changeset = Vibe.changeset(%Vibe{}, valid_vibe_attributes(%{"short_id" => "abc1234"}))
      assert changeset.valid?
    end

    test "requires archetype_id" do
      attrs = valid_vibe_attributes(%{"short_id" => "abc1234"}) |> Map.delete("archetype_id")
      changeset = Vibe.changeset(%Vibe{}, attrs)
      refute changeset.valid?
      assert %{archetype_id: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires narrative" do
      attrs = valid_vibe_attributes(%{"short_id" => "abc1234"}) |> Map.delete("narrative")
      changeset = Vibe.changeset(%Vibe{}, attrs)
      refute changeset.valid?
      assert %{narrative: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires stats" do
      attrs = valid_vibe_attributes(%{"short_id" => "abc1234"}) |> Map.delete("stats")
      changeset = Vibe.changeset(%Vibe{}, attrs)
      refute changeset.valid?
      assert %{stats: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires session_count > 0" do
      attrs = valid_vibe_attributes(%{"short_id" => "abc1234", "session_count" => 0})
      changeset = Vibe.changeset(%Vibe{}, attrs)
      refute changeset.valid?
      assert %{session_count: [_]} = errors_on(changeset)
    end
  end

  describe "create_vibe/1" do
    test "creates a vibe with valid attrs and generates short_id" do
      {:ok, vibe} = Vibes.create_vibe(valid_vibe_attributes())
      assert is_binary(vibe.short_id)
      assert String.length(vibe.short_id) == 7
      assert vibe.archetype_id == "night-owl"
      assert vibe.narrative =~ "midnight"
      assert vibe.session_count == 23
    end

    test "returns error with invalid attrs" do
      {:error, changeset} = Vibes.create_vibe(%{})
      refute changeset.valid?
    end
  end

  describe "get_vibe_by_short_id/1" do
    test "returns the vibe" do
      vibe = vibe_fixture()
      found = Vibes.get_vibe_by_short_id(vibe.short_id)
      assert found.id == vibe.id
    end

    test "returns nil for nonexistent short_id" do
      assert is_nil(Vibes.get_vibe_by_short_id("zzzzzzz"))
    end
  end

  describe "list_recent_vibes/1" do
    test "returns recent vibes ordered by newest first" do
      v1 = vibe_fixture()
      v2 = vibe_fixture()
      recent = Vibes.list_recent_vibes(limit: 10)
      ids = Enum.map(recent, & &1.id)
      assert hd(ids) == v2.id
      assert List.last(ids) == v1.id
    end

    test "respects limit" do
      for _ <- 1..5, do: vibe_fixture()
      assert length(Vibes.list_recent_vibes(limit: 3)) == 3
    end
  end

  describe "count_vibes/0" do
    test "returns 0 when empty" do
      assert Vibes.count_vibes() == 0
    end

    test "returns correct count" do
      vibe_fixture()
      vibe_fixture()
      assert Vibes.count_vibes() == 2
    end
  end

  describe "archetype_distribution/0" do
    test "returns grouped counts" do
      vibe_fixture(%{"archetype_id" => "night-owl"})
      vibe_fixture(%{"archetype_id" => "night-owl"})
      vibe_fixture(%{"archetype_id" => "diplomat"})

      dist = Vibes.archetype_distribution()
      assert {"night-owl", 2} in dist
      assert {"diplomat", 1} in dist
    end
  end
end
