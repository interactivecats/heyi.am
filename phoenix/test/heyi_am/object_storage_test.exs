defmodule HeyiAm.ObjectStorageTest do
  use ExUnit.Case, async: true

  # The test environment is configured to use HeyiAm.ObjectStorage.Mock, so
  # these tests exercise the public API and the mock adapter end-to-end without
  # hitting any real S3 endpoint.

  describe "presign_put/1" do
    test "returns {:ok, url} for a given key" do
      assert {:ok, url} = HeyiAm.ObjectStorage.presign_put("sessions/abc123/recording.json")
      assert is_binary(url)
      assert String.contains?(url, "abc123")
      assert String.contains?(url, "presigned=true")
    end

    test "URL starts with mock-storage scheme" do
      assert {:ok, url} = HeyiAm.ObjectStorage.presign_put("some/key")
      assert String.starts_with?(url, "https://mock-storage.test/")
    end
  end

  describe "presign_get/1" do
    test "returns {:ok, url} for a given key" do
      assert {:ok, url} = HeyiAm.ObjectStorage.presign_get("sessions/abc123/recording.json")
      assert is_binary(url)
      assert String.contains?(url, "abc123")
      assert String.contains?(url, "presigned=true")
    end

    test "URL starts with mock-storage scheme" do
      assert {:ok, url} = HeyiAm.ObjectStorage.presign_get("some/key")
      assert String.starts_with?(url, "https://mock-storage.test/")
    end
  end

  describe "delete_object/1" do
    test "returns :ok" do
      assert :ok = HeyiAm.ObjectStorage.delete_object("sessions/abc123/recording.json")
    end

    test "returns :ok for a nonexistent key (idempotent)" do
      assert :ok = HeyiAm.ObjectStorage.delete_object("does/not/exist")
    end
  end
end
