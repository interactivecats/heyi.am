defmodule HeyiAmWeb.HelpersTest do
  use ExUnit.Case, async: true

  alias HeyiAmWeb.Helpers

  describe "format_loc/1" do
    test "returns \"0\" for nil" do
      assert Helpers.format_loc(nil) == "0"
    end

    test "formats thousands with k suffix" do
      assert Helpers.format_loc(2400) == "2.4k"
      assert Helpers.format_loc(1000) == "1.0k"
      assert Helpers.format_loc(15_320) == "15.3k"
    end

    test "returns integer as string for values under 1000" do
      assert Helpers.format_loc(500) == "500"
      assert Helpers.format_loc(0) == "0"
      assert Helpers.format_loc(999) == "999"
    end

    test "passes through binary strings unchanged" do
      assert Helpers.format_loc("2.4k") == "2.4k"
      assert Helpers.format_loc("custom") == "custom"
    end
  end

  describe "slugify/1" do
    test "returns empty string for nil" do
      assert Helpers.slugify(nil) == ""
    end

    test "lowercases and replaces spaces with hyphens" do
      assert Helpers.slugify("My Project") == "my-project"
    end

    test "removes special characters" do
      assert Helpers.slugify("Project (v2.0)!") == "project-v20"
    end

    test "collapses consecutive spaces and hyphens" do
      assert Helpers.slugify("my  --  project") == "my-project"
    end

    test "trims leading and trailing hyphens" do
      assert Helpers.slugify("-project-") == "project"
    end

    test "handles simple names" do
      assert Helpers.slugify("heyi-am") == "heyi-am"
    end
  end
end
