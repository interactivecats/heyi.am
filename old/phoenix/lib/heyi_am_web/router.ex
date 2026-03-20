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
    plug HeyiAmWeb.Plugs.CORS
  end

  # GitHub OAuth
  scope "/auth", HeyiAmWeb do
    pipe_through :browser

    get "/github", AuthController, :request
    get "/github/callback", AuthController, :callback
  end

  # Public routes
  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/", PageController, :home
    get "/s/:token", ShareController, :show
    get "/s/:token/transcript", ShareController, :transcript
    get "/challenge/:token", ChallengeController, :show
  end

  # API
  scope "/api", HeyiAmWeb do
    pipe_through [:api, :bearer_auth]

    post "/share", ShareApiController, :create
    delete "/share/:token", ShareApiController, :delete
    get "/share/:token", ShareApiController, :verify
    post "/share/:token/seal", ShareApiController, :seal
    post "/upload-image", ShareApiController, :upload_image
    get "/me", MeController, :show
    post "/projects/sync", ProjectApiController, :sync

    # Device authorization flow (RFC 8628)
    post "/device/authorize", DeviceApiController, :create
    post "/device/token", DeviceApiController, :token
  end

  pipeline :bearer_auth do
    plug HeyiAmWeb.Plugs.BearerAuth
  end

  # Device authorization browser flow
  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/device", DeviceController, :show
    post "/device/authorize", DeviceController, :authorize
  end

  # Dev tools
  if Application.compile_env(:heyi_am, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: HeyiAmWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end

  ## Authentication routes

  scope "/", HeyiAmWeb do
    pipe_through [:browser, :redirect_if_user_is_authenticated]

    get "/users/register", UserRegistrationController, :new
    post "/users/register", UserRegistrationController, :create
  end

  # Authenticated routes
  scope "/", HeyiAmWeb do
    pipe_through [:browser, :require_authenticated_user]

    get "/users/settings", UserSettingsController, :edit
    put "/users/settings", UserSettingsController, :update
    get "/users/settings/confirm-email/:token", UserSettingsController, :confirm_email

    get "/challenges/new", ChallengeController, :new
    post "/challenges", ChallengeController, :create
    get "/challenge/:token/responses", ChallengeController, :responses

    live_session :require_authenticated_user,
      on_mount: [{HeyiAmWeb.UserAuth, :require_authenticated}] do
      live "/users/set-username", UserLive.SetUsername, :new
      live "/:username/edit", PortfolioLive, :edit
    end
  end

  scope "/", HeyiAmWeb do
    pipe_through [:browser]

    get "/users/log-in", UserSessionController, :new
    get "/users/log-in/:token", UserSessionController, :confirm
    post "/users/log-in", UserSessionController, :create
    delete "/users/log-out", UserSessionController, :delete
  end

  # Portfolio (public, must be last — catches /:username and /:username/:project_key)
  scope "/", HeyiAmWeb do
    pipe_through :browser

    get "/:username", PortfolioController, :show
    get "/:username/:project_key", PortfolioController, :project
  end
end
