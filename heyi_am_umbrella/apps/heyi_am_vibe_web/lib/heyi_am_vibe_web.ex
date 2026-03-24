defmodule HeyiAmVibeWeb do
  @moduledoc """
  The entrypoint for defining the vibe web interface.

  No LiveView, no sessions — vibes are anonymous.
  """

  def static_paths, do: ~w(assets fonts images favicon.ico robots.txt)

  def router do
    quote do
      use Phoenix.Router, helpers: false

      import Plug.Conn
      import Phoenix.Controller
    end
  end

  def controller do
    quote do
      use Phoenix.Controller, formats: [:html, :json]

      import Plug.Conn

      unquote(verified_routes())
    end
  end

  def html do
    quote do
      use Phoenix.Component

      import Phoenix.Controller,
        only: [view_module: 1, view_template: 1]

      import Phoenix.HTML
      import HeyiAmVibeWeb.CoreComponents

      alias HeyiAmVibeWeb.Layouts

      unquote(verified_routes())
    end
  end

  def verified_routes do
    quote do
      use Phoenix.VerifiedRoutes,
        endpoint: HeyiAmVibeWeb.Endpoint,
        router: HeyiAmVibeWeb.Router,
        statics: HeyiAmVibeWeb.static_paths()
    end
  end

  @doc """
  When used, dispatch to the appropriate controller/html/etc.
  """
  defmacro __using__(which) when is_atom(which) do
    apply(__MODULE__, which, [])
  end
end
