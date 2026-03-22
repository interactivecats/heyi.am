defmodule HeyiAm.ObjectStorage.Mock do
  @moduledoc """
  Test adapter for object storage. Returns deterministic, stable URLs so tests
  can assert on specific values without hitting a real storage backend.

  Configure in `config/test.exs`:

      config :heyi_am, HeyiAm.ObjectStorage,
        adapter: HeyiAm.ObjectStorage.Mock
  """

  @behaviour HeyiAm.ObjectStorage

  @impl HeyiAm.ObjectStorage
  def presign_put(_bucket, key, _expires_in) do
    {:ok, "https://mock-storage.test/#{key}?presigned=true"}
  end

  @impl HeyiAm.ObjectStorage
  def presign_get(_bucket, key, _expires_in) do
    {:ok, "https://mock-storage.test/#{key}?presigned=true"}
  end

  @impl HeyiAm.ObjectStorage
  def get_object(_bucket, _key) do
    {:ok, Jason.encode!(%{
      "version" => 1,
      "beats" => [],
      "qa_pairs" => [],
      "highlights" => [],
      "tool_breakdown" => [],
      "top_files" => [],
      "transcript_excerpt" => [],
      "turn_timeline" => [],
      "agent_summary" => nil
    })}
  end

  @impl HeyiAm.ObjectStorage
  def delete_object(_bucket, _key) do
    :ok
  end
end
