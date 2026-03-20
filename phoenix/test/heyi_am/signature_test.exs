defmodule HeyiAm.SignatureTest do
  use ExUnit.Case, async: true

  alias HeyiAm.Signature

  @test_share %{
    token: "test-token",
    title: "Test Session",
    dev_take: "Some take",
    duration_minutes: 30,
    turns: 10,
    files_changed: 5,
    loc_changed: 100,
    signature: nil,
    public_key: nil
  }

  describe "content_hash/1" do
    test "returns sha256-prefixed hash" do
      hash = Signature.content_hash(@test_share)
      assert String.starts_with?(hash, "sha256:")
      assert String.length(hash) > 10
    end

    test "is deterministic" do
      assert Signature.content_hash(@test_share) == Signature.content_hash(@test_share)
    end

    test "changes when content changes" do
      modified = %{@test_share | title: "Different Title"}
      refute Signature.content_hash(@test_share) == Signature.content_hash(modified)
    end
  end

  describe "signed?/1" do
    test "returns false when no signature" do
      refute Signature.signed?(@test_share)
    end

    test "returns false when signature but no public key" do
      refute Signature.signed?(%{@test_share | signature: "abc"})
    end

    test "returns true when both signature and public key present" do
      assert Signature.signed?(%{@test_share | signature: "abc", public_key: "def"})
    end
  end

  describe "verify/1" do
    test "returns error for missing signature" do
      assert {:error, :missing_signature} = Signature.verify(@test_share)
    end

    test "returns error for invalid base64 encoding" do
      share = %{@test_share | signature: "not-valid-base64!!!", public_key: "also-bad!!!"}
      assert {:error, :invalid_encoding} = Signature.verify(share)
    end

    test "verifies a valid Ed25519 signature" do
      # Generate a key pair
      {pub, priv} = :crypto.generate_key(:eddsa, :ed25519)

      # Build the message (same as content_hash_payload)
      message =
        [
          @test_share.token,
          @test_share.title,
          @test_share.dev_take || "",
          to_string(@test_share.duration_minutes),
          to_string(@test_share.turns),
          to_string(@test_share.files_changed),
          to_string(@test_share.loc_changed)
        ]
        |> Enum.join("|")

      # Sign it
      signature = :crypto.sign(:eddsa, :none, message, [priv, :ed25519])

      share = %{
        @test_share
        | signature: Base.encode64(signature),
          public_key: Base.encode64(pub)
      }

      assert :ok = Signature.verify(share)
    end

    test "rejects an invalid signature" do
      {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)

      share = %{
        @test_share
        | signature: Base.encode64("bad-signature-bytes-that-are-long-enough-64"),
          public_key: Base.encode64(pub)
      }

      assert {:error, :invalid_signature} = Signature.verify(share)
    end
  end
end
