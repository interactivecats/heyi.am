defmodule HeyiAmWeb.Router do
  use HeyiAmWeb, :router

  import HeyiAmWeb.UserAuth

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {HeyiAmWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :fetch_current_scope_for_user
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/", PageController, :home
  end

  # API routes for CLI publish and verification
  scope "/api", HeyiAmWeb do
    pipe_through :api

    post "/sessions", ShareApiController, :create
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
    get "/users/settings/confirm-email/:token", UserSettingsController, :confirm_email

    # Challenge management (authenticated)
    resources "/challenges", ChallengeController, only: [:new, :create]
    get "/challenges/:slug/compare", ChallengeController, :compare
    get "/challenges/:slug/responses/:token", ChallengeController, :deep_dive
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser]

    get "/users/log-in", UserSessionController, :new
    post "/users/log-in", UserSessionController, :create
    delete "/users/log-out", UserSessionController, :delete
  end

  # Challenge public pages — before portfolio catch-all
  scope "/challenges", HeyiAmWeb do
    pipe_through :browser

    get "/:slug", ChallengeController, :show
    post "/:slug/unlock", ChallengeController, :verify_access_code
    get "/:slug/progress", ChallengeController, :in_progress
    get "/:slug/submitted", ChallengeController, :submitted
  end

  # Shared session pages — before portfolio catch-all
  scope "/s", HeyiAmWeb do
    pipe_through :browser

    get "/:token", ShareController, :show
    get "/:token/transcript", ShareController, :transcript
    get "/:token/verify", ShareController, :verify
  end

  # Portfolio — catch-all, must be last
  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/:username/:project", PortfolioController, :project
    get "/:username", PortfolioController, :show
  end
end
