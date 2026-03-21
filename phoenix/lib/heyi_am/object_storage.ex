defmodule HeyiAm.ObjectStorage do
  @moduledoc """
  Public API for object storage operations. Delegates to a configurable adapter
  so the real ExAws S3 implementation can be swapped for a mock in tests.

  ## Configuration

      config :heyi_am, HeyiAm.ObjectStorage,
        bucket: "heyi-am-sessions",
        presign_expires_in: 900,
        adapter: HeyiAm.ObjectStorage.ExAwsAdapter   # default

  In test.exs:

      config :heyi_am, HeyiAm.ObjectStorage,
        adapter: HeyiAm.ObjectStorage.Mock
  """

  @callback presign_put(bucket :: String.t(), key :: String.t(), expires_in :: pos_integer()) ::
              {:ok, String.t()} | {:error, term()}

  @callback presign_get(bucket :: String.t(), key :: String.t(), expires_in :: pos_integer()) ::
              {:ok, String.t()} | {:error, term()}

  @callback delete_object(bucket :: String.t(), key :: String.t()) ::
              :ok | {:error, term()}

  @default_bucket "heyi-am-sessions"
  @default_expires_in 900
  @default_adapter HeyiAm.ObjectStorage.ExAwsAdapter

  defp config, do: Application.get_env(:heyi_am, __MODULE__, [])

  defp bucket, do: Keyword.get(config(), :bucket, @default_bucket)
  defp expires_in, do: Keyword.get(config(), :presign_expires_in, @default_expires_in)
  defp adapter, do: Keyword.get(config(), :adapter, @default_adapter)

  @doc """
  Returns a presigned PUT URL for `key`. The URL expires in the configured
  number of seconds (default 900 / 15 minutes).
  """
  @spec presign_put(String.t(), keyword()) :: {:ok, String.t()} | {:error, term()}
  def presign_put(key, opts \\ []) do
    ttl = Keyword.get(opts, :expires_in, expires_in())
    adapter().presign_put(bucket(), key, ttl)
  end

  @doc """
  Returns a presigned GET URL for `key`. The URL expires in the configured
  number of seconds (default 900 / 15 minutes).
  """
  @spec presign_get(String.t(), keyword()) :: {:ok, String.t()} | {:error, term()}
  def presign_get(key, opts \\ []) do
    ttl = Keyword.get(opts, :expires_in, expires_in())
    adapter().presign_get(bucket(), key, ttl)
  end

  @doc """
  Deletes the object at `key`. Returns `:ok` on success, `{:error, reason}` on
  failure. Idempotent — deleting a nonexistent key returns `:ok`.
  """
  @spec delete_object(String.t()) :: :ok | {:error, term()}
  def delete_object(key) do
    adapter().delete_object(bucket(), key)
  end
end
