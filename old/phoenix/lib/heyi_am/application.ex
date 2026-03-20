defmodule HeyiAm.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      HeyiAmWeb.Telemetry,
      HeyiAm.Repo,
      {DNSCluster, query: Application.get_env(:heyi_am, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: HeyiAm.PubSub},
      # Start a worker by calling: HeyiAm.Worker.start_link(arg)
      # {HeyiAm.Worker, arg},
      # Start to serve requests, typically the last entry
      HeyiAmWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: HeyiAm.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    HeyiAmWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
