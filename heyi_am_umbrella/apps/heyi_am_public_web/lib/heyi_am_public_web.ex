defmodule HeyiAmPublicWeb do
  @moduledoc """
  The entrypoint for defining the public web interface.

  This app serves the public-facing heyi.am domain: portfolios,
  shared sessions, and static pages. It has NO sessions, NO LiveView,
  and NO CSRF protection (there are no forms to protect).
  """

  def static_paths, do: ~w(assets fonts images js favicon.ico favicon.svg robots.txt)

  def router do
    quote do
      use Phoenix.Router, helpers: false

      import Plug.Conn
      import Phoenix.Controller
    end
  end

  def controller do
    quote do
      use Phoenix.Controller, formats: [:html]

      import Plug.Conn

      unquote(verified_routes())
    end
  end

  def html do
    quote do
      use Phoenix.Component

      import Phoenix.Controller,
        only: [view_module: 1, view_template: 1]

      unquote(html_helpers())
    end
  end

  defp html_helpers do
    quote do
      import Phoenix.HTML
      import HeyiAmPublicWeb.CoreComponents
      import HeyiAmPublicWeb.AppShell

      alias HeyiAmPublicWeb.Layouts

      unquote(verified_routes())
    end
  end

  def verified_routes do
    quote do
      use Phoenix.VerifiedRoutes,
        endpoint: HeyiAmPublicWeb.Endpoint,
        router: HeyiAmPublicWeb.Router,
        statics: HeyiAmPublicWeb.static_paths()
    end
  end

  @doc """
  When used, dispatch to the appropriate controller/html/etc.
  """
  defmacro __using__(which) when is_atom(which) do
    apply(__MODULE__, which, [])
  end
end
