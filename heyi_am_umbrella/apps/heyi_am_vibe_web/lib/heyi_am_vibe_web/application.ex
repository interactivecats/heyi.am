defmodule HeyiAmVibeWeb.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      HeyiAmVibeWeb.Telemetry,
      {DNSCluster, query: Application.get_env(:heyi_am_vibe_web, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: HeyiAmVibeWeb.PubSub},
      # Start a worker by calling: HeyiAmVibeWeb.Worker.start_link(arg)
      # {HeyiAmVibeWeb.Worker, arg},
      # Start to serve requests, typically the last entry
      HeyiAmVibeWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: HeyiAmVibeWeb.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    HeyiAmVibeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
