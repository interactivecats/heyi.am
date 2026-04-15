defmodule HeyiAmPublicWeb.Router do
  use HeyiAmPublicWeb, :router

  # Relaxed CSP for embeddable widgets — allows framing from any origin
  @embed_csp %{
    "content-security-policy" =>
      "default-src 'none'; " <>
        "style-src 'unsafe-inline'; " <>
        "img-src 'self' data:; " <>
        "font-src https://fonts.gstatic.com"
  }

  @strict_csp %{
    "content-security-policy" =>
      "default-src 'self'; " <>
        "script-src 'self' https://analytics.interactivecats.com https://static.cloudflareinsights.com; " <>
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " <>
        "font-src https://fonts.gstatic.com; " <>
        "img-src 'self' data: https:; " <>
        "connect-src 'self' https://analytics.interactivecats.com https://cloudflareinsights.com; " <>
        "frame-src 'none'; " <>
        "frame-ancestors 'none'; " <>
        "object-src 'none'",
    "x-frame-options" => "DENY"
  }

  pipeline :browser do
    plug :accepts, ["html"]
    plug :put_root_layout, html: {HeyiAmPublicWeb.Layouts, :root}
    plug :put_secure_browser_headers, @strict_csp
    # NO :fetch_session
    # NO :protect_from_forgery
    # NO :fetch_current_scope_for_user
  end

  pipeline :embed do
    plug :accepts, ["html"]
    plug :put_secure_browser_headers, @embed_csp
    # No root layout — embeds render standalone HTML
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

  # UUID-keyed images — unguessable, no auth needed.
  # Accepts both the flat `:uuid.ext` layout used for project screenshots and
  # the nested `users/:user_id/:uuid.ext` layout for per-user profile photos.
  scope "/_img", HeyiAmPublicWeb do
    pipe_through :browser

    get "/*path", ImageController, :show
  end

  # Unlisted project pages
  scope "/p", HeyiAmPublicWeb do
    pipe_through :browser

    get "/:token", PortfolioController, :unlisted_project
  end

  # Shared session pages
  scope "/s", HeyiAmPublicWeb do
    pipe_through :browser

    get "/:token", ShareController, :show
  end

  # Embeddable stats widgets — relaxed CSP, no layout wrapping
  scope "/", HeyiAmPublicWeb do
    pipe_through :embed

    get "/:username/embed", EmbedController, :portfolio_html
    get "/:username/embed.svg", EmbedController, :portfolio_svg
    get "/:username/:project/embed", EmbedController, :project_html
    get "/:username/:project/embed.svg", EmbedController, :project_svg
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
