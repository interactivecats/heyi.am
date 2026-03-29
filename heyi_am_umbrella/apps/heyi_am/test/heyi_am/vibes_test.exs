defmodule HeyiAm.VibesTest do
  use HeyiAm.DataCase

  alias HeyiAm.Vibes
  alias HeyiAm.Vibes.Vibe

  import HeyiAm.VibesFixtures

  describe "Vibe.changeset/2" do
    test "valid with all required fields" do
      changeset = Vibe.changeset(%Vibe{}, valid_vibe_attributes(%{"short_id" => "abc1234", "delete_code" => "testcode123"}))
      assert changeset.valid?
    end

    test "requires archetype_id" do
      attrs = valid_vibe_attributes(%{"short_id" => "abc1234", "delete_code" => "testcode123"}) |> Map.delete("archetype_id")
      changeset = Vibe.changeset(%Vibe{}, attrs)
      refute changeset.valid?
      assert %{archetype_id: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires narrative" do
      attrs = valid_vibe_attributes(%{"short_id" => "abc1234", "delete_code" => "testcode123"}) |> Map.delete("narrative")
      changeset = Vibe.changeset(%Vibe{}, attrs)
      refute changeset.valid?
      assert %{narrative: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires stats" do
      attrs = valid_vibe_attributes(%{"short_id" => "abc1234", "delete_code" => "testcode123"}) |> Map.delete("stats")
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

  describe "input sanitization" do
    test "strips HTML tags from headline" do
      attrs = valid_vibe_attributes(%{
        "short_id" => "san1234", "delete_code" => "testcode123",
        "headline" => "The <script>alert(1)</script>Coder"
      })
      changeset = Vibe.changeset(%Vibe{}, attrs)
      assert Ecto.Changeset.get_change(changeset, :headline) == "The alert(1)Coder"
    end

    test "strips HTML tags from narrative" do
      attrs = valid_vibe_attributes(%{
        "short_id" => "san1235", "delete_code" => "testcode123",
        "narrative" => "You code <img src=x onerror=alert(1)> all night."
      })
      changeset = Vibe.changeset(%Vibe{}, attrs)
      assert Ecto.Changeset.get_change(changeset, :narrative) == "You code  all night."
    end

    test "strips control characters" do
      attrs = valid_vibe_attributes(%{
        "short_id" => "san1236", "delete_code" => "testcode123",
        "headline" => "The\x00Null\x07Bell"
      })
      changeset = Vibe.changeset(%Vibe{}, attrs)
      assert Ecto.Changeset.get_change(changeset, :headline) == "TheNullBell"
    end

    test "rejects stat keys with special characters" do
      attrs = valid_vibe_attributes(%{
        "short_id" => "san1237", "delete_code" => "testcode123",
        "stats" => %{"<script>" => 1}
      })
      changeset = Vibe.changeset(%Vibe{}, attrs)
      refute changeset.valid?
      assert %{stats: _} = errors_on(changeset)
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

  describe "delete_vibe/2 (anonymize)" do
    test "anonymizes vibe with correct code" do
      vibe = vibe_fixture()
      {:ok, anon} = Vibes.delete_vibe(vibe.short_id, vibe.delete_code)
      assert anon.anonymized_at
      assert anon.headline == nil
      assert anon.stats == %{}
      assert anon.delete_code == "USED"
      # archetype preserved for aggregates
      assert anon.archetype_id == vibe.archetype_id
      assert anon.session_count == vibe.session_count
    end

    test "rejects wrong code" do
      vibe = vibe_fixture()
      assert {:error, :invalid_code} = Vibes.delete_vibe(vibe.short_id, "WRONG-CODE-1234")
    end

    test "returns not_found for missing vibe" do
      assert {:error, :not_found} = Vibes.delete_vibe("zzzzzzz", "any")
    end

    test "returns already_anonymized for re-delete" do
      vibe = vibe_fixture()
      {:ok, _} = Vibes.delete_vibe(vibe.short_id, vibe.delete_code)
      assert {:error, :already_anonymized} = Vibes.delete_vibe(vibe.short_id, "USED")
    end
  end

  describe "list_recent_vibes/1 with anonymized vibes" do
    test "excludes anonymized vibes" do
      v1 = vibe_fixture()
      v2 = vibe_fixture()
      {:ok, _} = Vibes.delete_vibe(v1.short_id, v1.delete_code)

      recent = Vibes.list_recent_vibes(limit: 10)
      ids = Enum.map(recent, & &1.id)
      assert v2.id in ids
      refute v1.id in ids
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

    test "includes anonymized vibes in count" do
      v1 = vibe_fixture()
      vibe_fixture()
      {:ok, _} = Vibes.delete_vibe(v1.short_id, v1.delete_code)
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

    test "includes anonymized vibes in distribution" do
      v1 = vibe_fixture(%{"archetype_id" => "night-owl"})
      vibe_fixture(%{"archetype_id" => "night-owl"})
      {:ok, _} = Vibes.delete_vibe(v1.short_id, v1.delete_code)

      dist = Vibes.archetype_distribution()
      assert {"night-owl", 2} in dist
    end
  end

  describe "generate_delete_code format" do
    test "creates human-friendly WORD-WORD-DIGITS codes" do
      {:ok, vibe} = Vibes.create_vibe(valid_vibe_attributes())
      assert vibe.delete_code =~ ~r/^[A-Z]+-[A-Z]+-\d{4}$/
    end
  end
end
