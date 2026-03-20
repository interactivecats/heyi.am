defmodule HeyiAm.Storage do
  @moduledoc """
  Uploads and deletes files from MinIO (S3-compatible storage).
  """

  def upload_html(path, html) when is_binary(path) and is_binary(html) do
    bucket()
    |> ExAws.S3.put_object(path, html, [
      {:content_type, "text/html; charset=utf-8"},
      {:cache_control, "public, max-age=3600"}
    ])
    |> ExAws.request()
    |> case do
      {:ok, _} -> {:ok, public_url(path)}
      {:error, reason} -> {:error, reason}
    end
  end

  def upload_image(path, binary, content_type \\ "image/png") do
    bucket()
    |> ExAws.S3.put_object(path, binary, [
      {:content_type, content_type},
      {:cache_control, "public, max-age=86400"}
    ])
    |> ExAws.request()
    |> case do
      {:ok, _} -> {:ok, public_url(path)}
      {:error, reason} -> {:error, reason}
    end
  end

  def delete(path) when is_binary(path) do
    bucket()
    |> ExAws.S3.delete_object(path)
    |> ExAws.request()
    |> case do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  def public_url(path) do
    config = Application.get_env(:heyi_am, :storage)
    "#{config[:public_base_url]}/#{path}"
  end

  defp bucket do
    Application.get_env(:heyi_am, :storage)[:bucket]
  end
end
