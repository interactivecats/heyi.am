defmodule HeyiAmVibeWeb.Router do
  use HeyiAmVibeWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :put_root_layout, html: {HeyiAmVibeWeb.Layouts, :root}

    plug :put_secure_browser_headers, %{
      "content-security-policy" =>
        "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'"
    }
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :rate_limit_create do
    plug HeyiAmVibeWeb.Plugs.RateLimit, action: "vibe_create", limit: 5, period: 60_000
  end

  pipeline :rate_limit_delete do
    plug HeyiAmVibeWeb.Plugs.RateLimit, action: "vibe_delete", limit: 5, period: 60_000
  end

  pipeline :rate_limit_narrative do
    plug HeyiAmVibeWeb.Plugs.RateLimit,
      action: "vibe_narrative",
      limit: Application.compile_env(:heyi_am_vibe_web, :narrative_rate_limit, 4),
      period: 86_400_000
  end

  scope "/", HeyiAmVibeWeb do
    pipe_through :browser

    get "/", VibeController, :index
    get "/archetypes/:id", VibeController, :archetype
    get "/:short_id/card.png", VibeController, :card_image
    get "/:short_id", VibeController, :show
  end

  scope "/", HeyiAmVibeWeb do
    pipe_through [:browser, :rate_limit_delete]

    get "/:short_id/delete", VibeController, :delete_confirm
    delete "/:short_id", VibeController, :delete
  end

  scope "/api", HeyiAmVibeWeb do
    pipe_through :api

    scope "/vibes" do
      pipe_through :rate_limit_create
      post "/", VibeApiController, :create
    end

    scope "/vibes" do
      pipe_through :rate_limit_narrative
      post "/narrative", VibeApiController, :narrative
    end
  end
end
