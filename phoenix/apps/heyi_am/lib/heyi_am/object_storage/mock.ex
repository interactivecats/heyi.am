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
  def get_object(_bucket, key) do
    # Check process dictionary for per-key overrides (set via Mock.put_object/2 in tests)
    case Process.get({__MODULE__, :objects, key}) do
      nil -> {:ok, Jason.encode!(default_session_data())}
      data -> {:ok, data}
    end
  end

  @doc "Store test data for a specific key (must be called from the test process)"
  def put_object(key, data) when is_binary(data) do
    Process.put({__MODULE__, :objects, key}, data)
    :ok
  end
  def put_object(key, data) when is_map(data) do
    put_object(key, Jason.encode!(data))
  end

  # Returns realistic camelCase data matching what the CLI uploads to session.json
  defp default_session_data do
    %{
      "version" => 1,
      "executionPath" => [
        %{"stepNumber" => 1, "title" => "Review auth flow", "description" => "Found 3 token systems"},
        %{"stepNumber" => 2, "title" => "Scaffold fresh", "description" => "Clean phx.gen.auth"}
      ],
      "qaPairs" => [
        %{"question" => "Why tear out auth entirely?", "answer" => "Three token systems is a security liability."}
      ],
      "highlights" => [
        %{"type" => "pivot", "title" => "Rejected patch", "description" => "Chose rewrite."},
        %{"type" => "win", "title" => "Tests passing", "description" => "309 green."}
      ],
      "toolBreakdown" => [
        %{"tool" => "Read", "count" => 142},
        %{"tool" => "Edit", "count" => 92}
      ],
      "topFiles" => [
        %{"path" => "lib/auth.ex", "additions" => 80, "deletions" => 12}
      ],
      "transcriptExcerpt" => [
        %{"role" => "dev", "id" => "Turn 1", "text" => "The old auth was frankencode"},
        %{"role" => "ai", "id" => "Turn 2", "text" => "I can help patch..."},
        %{"role" => "dev", "id" => "Turn 3", "text" => "No. Tear it all out."}
      ],
      "turnTimeline" => [
        %{"timestamp" => "2026-03-12T14:02:00Z", "type" => "human", "content" => "Review the auth system", "tools" => []},
        %{"timestamp" => "2026-03-12T14:03:00Z", "type" => "assistant", "content" => "Found 3 token systems", "tools" => ["Read", "Grep"]}
      ],
      "agentSummary" => nil
    }
  end

  @impl HeyiAm.ObjectStorage
  def delete_object(_bucket, _key) do
    :ok
  end
end
