defmodule HeyiAm.Signature do
  @moduledoc """
  Ed25519 signature verification for sealed sessions.

  The CLI signs session content with the machine's Ed25519 private key.
  This module verifies signatures against the public key stored on the share.
  """

  @doc """
  Verify an Ed25519 signature against the share's content and public key.

  Returns `:ok` if the signature is valid, `{:error, reason}` otherwise.
  """
  def verify(%{signature: sig, public_key: pk} = share)
      when is_binary(sig) and is_binary(pk) do
    with {:ok, signature_bytes} <- Base.decode64(sig),
         {:ok, public_key_bytes} <- Base.decode64(pk) do
      message = content_hash_payload(share)

      if :crypto.verify(:eddsa, :none, message, signature_bytes, [public_key_bytes, :ed25519]) do
        :ok
      else
        {:error, :invalid_signature}
      end
    else
      :error -> {:error, :invalid_encoding}
    end
  end

  def verify(_share), do: {:error, :missing_signature}

  @doc """
  Check whether a share has a signature attached.
  """
  def signed?(%{signature: sig, public_key: pk})
      when is_binary(sig) and is_binary(pk),
      do: true

  def signed?(_), do: false

  @doc """
  Compute the content hash for a share (SHA-256 of canonical payload).
  Returns a hex-encoded string prefixed with "sha256:".
  """
  def content_hash(share) do
    hash = :crypto.hash(:sha256, content_hash_payload(share))
    "sha256:" <> Base.encode16(hash, case: :lower)
  end

  defp content_hash_payload(share) do
    # Canonical payload: token + title + dev_take + duration + turns + files + loc
    [
      share.token || "",
      share.title || "",
      share.dev_take || "",
      to_string(share.duration_minutes || 0),
      to_string(share.turns || 0),
      to_string(share.files_changed || 0),
      to_string(share.loc_changed || 0)
    ]
    |> Enum.join("|")
  end
end
