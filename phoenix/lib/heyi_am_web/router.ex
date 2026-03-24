defmodule HeyiAmWeb.Router do
  use HeyiAmWeb, :router

  import HeyiAmWeb.UserAuth

  # ── Pipelines ─────────────────────────────────────────────────

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {HeyiAmWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers, %{
      "content-security-policy" => "default-src 'self'; script-src 'self' https://analytics.interactivecats.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://analytics.interactivecats.com; frame-ancestors 'self'"
    }
    plug :fetch_current_scope_for_user
  end

  # Public pages: strict CSP + enforce public host
  pipeline :public do
    plug HeyiAmWeb.Plugs.EnforceHost, expected: :public
    plug :put_secure_browser_headers, %{
      "content-security-policy" => "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; frame-src 'none'; frame-ancestors 'none'; object-src 'none'"
    }
  end

  # App pages: enforce app host (auth routes must NOT work on public domain)
  pipeline :app do
    plug HeyiAmWeb.Plugs.EnforceHost, expected: :app
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :api_auth do
    plug HeyiAmWeb.Plugs.ApiAuth
  end

  pipeline :require_api_auth do
    plug HeyiAmWeb.Plugs.RequireApiAuth
  end

  pipeline :rate_limit_auth do
    plug HeyiAmWeb.Plugs.RateLimit, action: "auth", limit: 5, period: 60_000
  end

  pipeline :rate_limit_api_session do
    plug HeyiAmWeb.Plugs.RateLimit, action: "api_session", limit: 30, period: 60_000
  end

  pipeline :rate_limit_device_poll do
    plug HeyiAmWeb.Plugs.RateLimit, action: "device_poll", limit: 20, period: 60_000
  end

  pipeline :rate_limit_enhance do
    plug HeyiAmWeb.Plugs.RateLimit, action: "enhance", limit: 5, period: 60_000
  end

  pipeline :rate_limit_vibe_share do
    plug HeyiAmWeb.Plugs.RateLimit, action: "vibe_share", limit: 5, period: 60_000
  end

  pipeline :rate_limit_vibe_narrative do
    plug HeyiAmWeb.Plugs.RateLimit, action: "vibe_narrative", limit: 4, period: 86_400_000
  end

  # In production, host-based routing separates public (heyi.am) from app (heyiam.com).
  # In dev/test, hosts are nil so all routes live on localhost — ordering handles conflicts.
  # IMPORTANT: Specific routes (/users/*, /api/*, /auth/*, /s/*, /v/*) MUST come
  # before the catch-all /:username to avoid route conflicts.

  # ── Landing + legal ───────────────────────────────────────────

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :public]

    get "/", PageController, :home
    get "/terms", PageController, :terms
    get "/privacy", PageController, :privacy
  end

  # ── API routes (heyiam.com in prod) ───────────────────────────

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app, :rate_limit_auth]

    post "/device/code", DeviceApiController, :create_code
  end

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app, :rate_limit_device_poll]

    post "/device/token", DeviceApiController, :poll_token
  end

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app, :rate_limit_auth]

    get "/auth/status", DeviceApiController, :auth_status
  end

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app, :api_auth, :require_api_auth, :rate_limit_enhance]

    post "/enhance", EnhanceApiController, :create
  end

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app, :api_auth, :rate_limit_api_session]

    post "/projects", ProjectApiController, :create
    post "/projects/:slug/screenshot-url", ProjectApiController, :screenshot_url
    patch "/projects/:slug/screenshot-key", ProjectApiController, :update_screenshot_key
    post "/sessions", ShareApiController, :create
    post "/time-stats", TimeStatsApiController, :publish
    patch "/profile", ProfileApiController, :update
  end

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app]

    get "/sessions/:token/verify", ShareApiController, :verify
    get "/projects/:username/:slug/screenshot", ProjectApiController, :screenshot
  end

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app, :rate_limit_vibe_share]

    post "/vibes", VibeApiController, :create
  end

  scope "/api", HeyiAmWeb do
    pipe_through [:api, :app, :rate_limit_vibe_narrative]

    post "/vibes/narrative", VibeApiController, :narrative
  end

  # ── Vibe browser pages ────────────────────────────────────────

  scope "/v", HeyiAmWeb do
    pipe_through [:browser, :public]

    get "/", VibeController, :index
    get "/archetypes/:id", VibeController, :archetype
    get "/:short_id/card.png", VibeController, :card_image
    delete "/:short_id", VibeController, :delete
    get "/:short_id", VibeController, :show
  end

  # ── Admin dashboard ───────────────────────────────────────────

  import Phoenix.LiveDashboard.Router

  scope "/admin" do
    pipe_through [:browser, :app]

    live_dashboard "/dashboard",
      metrics: HeyiAmWeb.Telemetry,
      on_mount: [{HeyiAmWeb.AdminAuth, :admin}]
  end

  # Dev mailbox
  if Application.compile_env(:heyi_am, :dev_routes) do
    scope "/dev" do
      pipe_through :browser

      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end

  # ── Auth routes (heyiam.com in prod) ──────────────────────────

  scope "/auth", HeyiAmWeb do
    pipe_through [:browser, :app]

    get "/:provider", OAuthController, :request
    get "/:provider/callback", OAuthController, :callback
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :app, :redirect_if_user_is_authenticated]

    get "/users/register", UserRegistrationController, :new
    post "/users/register", UserRegistrationController, :create
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :app, :require_authenticated_user]

    live_session :authenticated, on_mount: [{HeyiAmWeb.UserAuth, :ensure_authenticated}] do
      live "/onboarding/username", ClaimUsernameLive
      live "/device", DeviceAuthLive
    end

    get "/users/settings", UserSettingsController, :edit
    put "/users/settings", UserSettingsController, :update
    delete "/users/settings", UserSettingsController, :delete
    get "/users/settings/export", UserSettingsController, :export
    get "/users/settings/confirm-email/:token", UserSettingsController, :confirm_email
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :app]

    get "/users/log-in", UserSessionController, :new
    delete "/users/log-out", UserSessionController, :delete
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :app, :rate_limit_auth]

    post "/users/log-in", UserSessionController, :create
  end

  # ── Shared session pages (heyi.am in prod) ────────────────────

  scope "/s", HeyiAmWeb do
    pipe_through [:browser, :public]

    get "/:token", ShareController, :show
    get "/:token/transcript", ShareController, :transcript
    get "/:token/verify", ShareController, :verify
  end

  # ── Public portfolio pages (heyi.am in prod) ──────────────────
  # MUST be last — /:username is a catch-all

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :public]

    get "/:username/:project/:session", ShareController, :show_in_project
    get "/:username/time", PortfolioController, :time
    get "/:username/:project", PortfolioController, :project
    get "/:username", PortfolioController, :show
  end
end
