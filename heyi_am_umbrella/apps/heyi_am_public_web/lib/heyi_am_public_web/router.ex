defmodule HeyiAmPublicWeb.Router do
  use HeyiAmPublicWeb, :router

  @strict_csp %{
    "content-security-policy" =>
      "default-src 'self'; " <>
        "script-src 'self' https://analytics.interactivecats.com; " <>
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " <>
        "font-src https://fonts.gstatic.com; " <>
        "img-src 'self' data: https:; " <>
        "connect-src 'self' https://analytics.interactivecats.com; " <>
        "frame-src 'none'; " <>
        "frame-ancestors 'none'; " <>
        "object-src 'none'"
  }

  pipeline :browser do
    plug :accepts, ["html"]
    plug :put_root_layout, html: {HeyiAmPublicWeb.Layouts, :root}
    plug :put_secure_browser_headers, @strict_csp
    # NO :fetch_session
    # NO :protect_from_forgery
    # NO :fetch_current_scope_for_user
  end

  # Landing + legal pages
  scope "/", HeyiAmPublicWeb do
    pipe_through :browser

    get "/", PageController, :home
    get "/terms", PageController, :terms
    get "/privacy", PageController, :privacy
  end

  # Legacy vibe redirects
  scope "/v", HeyiAmPublicWeb do
    pipe_through :browser

    get "/*path", PageController, :redirect_vibes
  end

  # Shared session pages
  scope "/s", HeyiAmPublicWeb do
    pipe_through :browser

    get "/:token", ShareController, :show
    get "/:token/transcript", ShareController, :transcript
  end

  # Public portfolio pages — MUST be last (/:username is a catch-all)
  scope "/", HeyiAmPublicWeb do
    pipe_through :browser

    get "/:username/:project/screenshot.png", PortfolioController, :screenshot
    get "/:username/:project/:session", ShareController, :show_in_project
    get "/:username/time", PortfolioController, :time
    get "/:username/:project", PortfolioController, :project
    get "/:username", PortfolioController, :show
  end
end
