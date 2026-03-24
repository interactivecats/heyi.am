defmodule HeyiAm.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    OpentelemetryEcto.setup([:heyi_am, :repo])

    children = [
      HeyiAm.Repo,
      {DNSCluster, query: Application.get_env(:heyi_am, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: HeyiAm.PubSub},
      HeyiAm.Accounts.DeviceCodeCleaner
    ]

    opts = [strategy: :one_for_one, name: HeyiAm.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
