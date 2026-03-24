defmodule HeyiAm.Accounts.DeviceCodeCleaner do
  @moduledoc """
  Periodically deletes expired device codes from the database.
  """
  use GenServer

  import Ecto.Query
  alias HeyiAm.Repo
  alias HeyiAm.Accounts.DeviceCode

  @cleanup_interval_ms :timer.minutes(15)

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok) do
    schedule_cleanup()
    {:ok, %{}}
  end

  @impl true
  def handle_info(:cleanup, state) do
    delete_expired()
    schedule_cleanup()
    {:noreply, state}
  end

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup, @cleanup_interval_ms)
  end

  defp delete_expired do
    now = DateTime.utc_now()

    {count, _} =
      from(dc in DeviceCode, where: dc.expires_at < ^now)
      |> Repo.delete_all()

    if count > 0 do
      require Logger
      Logger.info("DeviceCodeCleaner: deleted #{count} expired device codes")
    end
  end
end
