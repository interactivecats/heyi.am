defmodule HeyiAmWeb.Plugs.CacheBody do
  @moduledoc """
  Custom body reader that caches the full raw body for signature verification.
  Accumulates chunks when the body is larger than the read buffer.
  """

  def read_body(conn, opts) do
    read_body_accumulate(conn, opts, [])
  end

  defp read_body_accumulate(conn, opts, acc) do
    case Plug.Conn.read_body(conn, opts) do
      {:ok, body, conn} ->
        full_body = IO.iodata_to_binary([acc | [body]])
        {:ok, full_body, Plug.Conn.assign(conn, :raw_body, full_body)}

      {:more, chunk, conn} ->
        read_body_accumulate(conn, opts, [acc | [chunk]])

      {:error, reason} ->
        {:error, reason}
    end
  end
end
