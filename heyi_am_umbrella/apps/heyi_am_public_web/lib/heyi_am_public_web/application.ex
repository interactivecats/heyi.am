defmodule HeyiAmPublicWeb.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      HeyiAmPublicWeb.Telemetry,
      {DNSCluster,
       query: Application.get_env(:heyi_am_public_web, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: HeyiAmPublicWeb.PubSub},
      HeyiAmPublicWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: HeyiAmPublicWeb.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    HeyiAmPublicWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
