defmodule HeyiAmWeb.Router do
  use HeyiAmWeb, :router

  import HeyiAmWeb.UserAuth

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {HeyiAmWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers, %{
      "content-security-policy" => "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'"
    }
    plug :fetch_current_scope_for_user
  end

  pipeline :api do
    plug :accepts, ["json"]
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

  pipeline :api_auth do
    plug HeyiAmWeb.Plugs.ApiAuth
  end

  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/", PageController, :home
    get "/terms", PageController, :terms
    get "/privacy", PageController, :privacy
  end

  # Device code creation (strict rate limit: 5/min)
  scope "/api", HeyiAmWeb do
    pipe_through [:api, :rate_limit_auth]

    post "/device/code", DeviceApiController, :create_code
  end

  # Device token polling (generous rate limit: 20/min for legitimate 5s polling)
  scope "/api", HeyiAmWeb do
    pipe_through [:api, :rate_limit_device_poll]

    post "/device/token", DeviceApiController, :poll_token
  end

  # Auth status API (rate-limited)
  scope "/api", HeyiAmWeb do
    pipe_through [:api, :rate_limit_auth]

    get "/auth/status", DeviceApiController, :auth_status
  end

  pipeline :rate_limit_enhance do
    plug HeyiAmWeb.Plugs.RateLimit, action: "enhance", limit: 5, period: 60_000
  end

  pipeline :require_api_auth do
    plug HeyiAmWeb.Plugs.RequireApiAuth
  end

  # LLM proxy enhancement endpoint
  scope "/api", HeyiAmWeb do
    pipe_through [:api, :api_auth, :require_api_auth, :rate_limit_enhance]

    post "/enhance", EnhanceApiController, :create
  end

  # API routes for CLI publish and verification
  scope "/api", HeyiAmWeb do
    pipe_through [:api, :api_auth, :rate_limit_api_session]

    post "/projects", ProjectApiController, :create
    post "/sessions", ShareApiController, :create
  end

  scope "/api", HeyiAmWeb do
    pipe_through :api

    get "/sessions/:token/verify", ShareApiController, :verify
  end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:heyi_am, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: HeyiAmWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end

  ## OAuth routes

  scope "/auth", HeyiAmWeb do
    pipe_through :browser

    get "/:provider", OAuthController, :request
    get "/:provider/callback", OAuthController, :callback
  end

  ## Authentication routes

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :redirect_if_user_is_authenticated]

    get "/users/register", UserRegistrationController, :new
    post "/users/register", UserRegistrationController, :create
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :require_authenticated_user]

    live_session :authenticated, on_mount: [{HeyiAmWeb.UserAuth, :ensure_authenticated}] do
      live "/onboarding/username", ClaimUsernameLive
      live "/onboarding/vibe", VibePickerLive
      live "/device", DeviceAuthLive
    end

    live_session :owner_required,
      on_mount: [
        {HeyiAmWeb.UserAuth, :ensure_authenticated},
        {HeyiAmWeb.UserAuth, :ensure_owner}
      ] do
      live "/:username/edit", PortfolioEditorLive
      live "/:username/projects/:slug/edit", ProjectEditorLive
    end

    get "/users/settings", UserSettingsController, :edit
    put "/users/settings", UserSettingsController, :update
    delete "/users/settings", UserSettingsController, :delete
    get "/users/settings/export", UserSettingsController, :export
    get "/users/settings/confirm-email/:token", UserSettingsController, :confirm_email

end

  scope "/", HeyiAmWeb do
    pipe_through [:browser]

    get "/users/log-in", UserSessionController, :new
    delete "/users/log-out", UserSessionController, :delete
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :rate_limit_auth]

    post "/users/log-in", UserSessionController, :create
  end

  # Shared session pages — before portfolio catch-all
  scope "/s", HeyiAmWeb do
    pipe_through :browser

    get "/:token", ShareController, :show
    get "/:token/transcript", ShareController, :transcript
    get "/:token/verify", ShareController, :verify
  end

  # Friendly session URL within a project — must be before portfolio catch-all
  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/:username/:project/:session", ShareController, :show_in_project
  end

  # Portfolio — catch-all, must be last
  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/:username/:project", PortfolioController, :project
    get "/:username", PortfolioController, :show
  end
end
