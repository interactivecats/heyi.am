defmodule HeyiAm.Signature do
  @moduledoc """
  Verifies Ed25519 signatures from machine tokens.
  Token format: hai_<base64url(32-byte-raw-pubkey)>
  """

  @doc """
  Verify that the signature matches the body, signed by the key in the token.
  Returns :ok or {:error, reason}.
  """
  def verify(machine_token, signature_b64, body) when is_binary(machine_token) do
    with {:ok, raw_pubkey} <- extract_pubkey(machine_token),
         {:ok, signature} <- Base.url_decode64(signature_b64, padding: false) do
      do_verify(raw_pubkey, signature, body)
    end
  end

  def verify(_, _, _), do: {:error, :missing_token}

  @doc """
  Server-side signing for sealed sessions.
  Uses a server Ed25519 key derived from the app secret.
  Returns a base64url-encoded signature string.
  """
  def sign(message) when is_binary(message) do
    secret = Application.get_env(:heyi_am, HeyiAmWeb.Endpoint)[:secret_key_base]
    # Derive a deterministic 32-byte seed from the app secret
    seed = :crypto.hash(:sha256, "heyi_seal:" <> secret)
    {_pub, priv} = :crypto.generate_key(:eddsa, :ed25519, seed)
    signature = :public_key.sign(message, :none, {:ed_pri, :ed25519, seed, priv})
    Base.url_encode64(signature, padding: false)
  end

  defp extract_pubkey("hai_" <> encoded) do
    case Base.url_decode64(encoded, padding: false) do
      {:ok, <<raw::binary-size(32)>>} -> {:ok, raw}
      _ -> {:error, :invalid_token}
    end
  end

  defp extract_pubkey(_), do: {:error, :invalid_token_format}

  defp do_verify(raw_pubkey, signature, body) do
    try do
      case :public_key.verify(body, :none, signature, {:ed_pub, :ed25519, raw_pubkey}) do
        true -> :ok
        false -> {:error, :invalid_signature}
      end
    rescue
      _ -> {:error, :verification_failed}
    end
  end
end
