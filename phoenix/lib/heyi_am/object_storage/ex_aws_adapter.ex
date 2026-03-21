defmodule HeyiAm.ObjectStorage.ExAwsAdapter do
  @moduledoc """
  Production adapter for object storage backed by ExAws S3.

  Configured for path-style access (`virtual_hosted_style_bucket: false`) so
  it works with Garage and other S3-compatible stores that do not support
  virtual-hosted-style bucket URLs.

  Runtime credentials and endpoint are read from the `:ex_aws` application
  config set in `config/runtime.exs`.

  ## External endpoint

  When the S3 backend is only reachable by an internal hostname (e.g. a Docker
  service name like `seaweedfs`), presigned URLs would be unreachable by
  external clients (the CLI). Set `:external_endpoint` in the ObjectStorage
  config to override the host used in presigned URLs:

      config :heyi_am, HeyiAm.ObjectStorage,
        external_endpoint: [
          scheme: "http://",
          host: "localhost",
          port: 8333
        ]

  When unset, presigned URLs use the standard `:ex_aws` S3 endpoint.
  """

  @behaviour HeyiAm.ObjectStorage

  @impl HeyiAm.ObjectStorage
  def presign_put(bucket, key, expires_in) do
    case ExAws.S3.presigned_url(presign_config(), :put, bucket, key,
           expires_in: expires_in,
           virtual_hosted_style_bucket: false
         ) do
      {:ok, url} -> {:ok, url}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl HeyiAm.ObjectStorage
  def presign_get(bucket, key, expires_in) do
    case ExAws.S3.presigned_url(presign_config(), :get, bucket, key,
           expires_in: expires_in,
           virtual_hosted_style_bucket: false
         ) do
      {:ok, url} -> {:ok, url}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl HeyiAm.ObjectStorage
  def delete_object(bucket, key) do
    bucket
    |> ExAws.S3.delete_object(key)
    |> ExAws.request()
    |> case do
      {:ok, _response} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  # Returns an ExAws config for presigned URL generation.
  # Uses :external_endpoint overrides when configured, so presigned URLs
  # are reachable by external clients even when S3 is on an internal network.
  defp presign_config do
    base = ExAws.Config.new(:s3)

    case Application.get_env(:heyi_am, HeyiAm.ObjectStorage, [])
         |> Keyword.get(:external_endpoint) do
      nil ->
        base

      ext ->
        %{base |
          scheme: Keyword.get(ext, :scheme, base.scheme),
          host: Keyword.get(ext, :host, base.host),
          port: Keyword.get(ext, :port, base.port)
        }
    end
  end
end
