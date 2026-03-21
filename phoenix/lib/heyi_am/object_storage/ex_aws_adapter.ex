defmodule HeyiAm.ObjectStorage.ExAwsAdapter do
  @moduledoc """
  Production adapter for object storage backed by ExAws S3.

  Configured for path-style access (`virtual_hosted_style_bucket: false`) so
  it works with Garage and other S3-compatible stores that do not support
  virtual-hosted-style bucket URLs.

  Runtime credentials and endpoint are read from the `:ex_aws` application
  config set in `config/runtime.exs`.
  """

  @behaviour HeyiAm.ObjectStorage

  @impl HeyiAm.ObjectStorage
  def presign_put(bucket, key, expires_in) do
    case ExAws.S3.presigned_url(ExAws.Config.new(:s3), :put, bucket, key,
           expires_in: expires_in,
           virtual_hosted_style_bucket: false
         ) do
      {:ok, url} -> {:ok, url}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl HeyiAm.ObjectStorage
  def presign_get(bucket, key, expires_in) do
    case ExAws.S3.presigned_url(ExAws.Config.new(:s3), :get, bucket, key,
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
end
