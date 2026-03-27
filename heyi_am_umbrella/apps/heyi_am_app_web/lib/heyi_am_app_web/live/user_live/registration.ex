defmodule HeyiAmAppWeb.UserLive.Registration do
  use HeyiAmAppWeb, :live_view

  alias HeyiAm.Accounts
  alias HeyiAm.Accounts.User

  @impl true
  def render(assigns) do
    ~H"""
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-card-header">
          <h1 class="headline-lg" style="margin-block-end: var(--spacing-2);">Create your account</h1>
          <p class="body-sm" style="color: var(--on-surface-variant);">
            Already registered?
            <.link navigate={~p"/users/log-in"} style="color: var(--primary); font-weight: 600; text-decoration: none;">Log in</.link>
          </p>
        </div>

        <a href={~p"/auth/github"} class="btn-github">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Continue with GitHub
        </a>

        <div class="auth-divider">or</div>

        <.form for={@form} id="registration_form" action={~p"/users/register?#{registration_params(assigns)}"} method="post" phx-change="validate">
          <div class="stack stack--md">
            <div :if={@show_username} class="auth-field">
              <label for="user_username" class="auth-label">
                Username
                <span
                  :if={@username_availability == :available}
                  style="color: var(--success, #22c55e); font-weight: 600; font-size: 0.75rem; margin-inline-start: var(--spacing-2);"
                >
                  available
                </span>
                <span
                  :if={@username_availability == :taken}
                  style="color: var(--error, #ef4444); font-weight: 600; font-size: 0.75rem; margin-inline-start: var(--spacing-2);"
                >
                  taken
                </span>
              </label>
              <div style="display: flex; align-items: center; gap: 0;">
                <span style="padding: 0.5rem 0.5rem 0.5rem 0.75rem; background: var(--surface-container, #f5f5f5); border: 1px solid var(--outline-variant, #ccc); border-right: none; border-radius: 0.375rem 0 0 0.375rem; font-size: 0.875rem; color: var(--on-surface-variant);">heyi.am/</span>
                <input
                  type="text"
                  name={@form[:username].name}
                  id="user_username"
                  value={@form[:username].value}
                  class={["auth-input", @form[:username].errors != [] && "auth-input--error"]}
                  style="border-radius: 0 0.375rem 0.375rem 0;"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="your-name"
                  phx-debounce="300"
                />
              </div>
              <p :for={msg <- Enum.map(@form[:username].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>

            <div class="auth-field">
              <label for="user_email" class="auth-label">Email</label>
              <input
                type="email"
                name={@form[:email].name}
                id="user_email"
                value={Phoenix.HTML.Form.normalize_value("email", @form[:email].value)}
                class={["auth-input", @form[:email].errors != [] && "auth-input--error"]}
                autocomplete="username"
                spellcheck="false"
                required
                placeholder="you@example.com"
                phx-mounted={JS.focus()}
              />
              <p :for={msg <- Enum.map(@form[:email].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>

            <div class="auth-field">
              <label for="user_password" class="auth-label">Password</label>
              <input
                type="password"
                name={@form[:password].name}
                id="user_password"
                value={@form[:password].value}
                class={["auth-input", @form[:password].errors != [] && "auth-input--error"]}
                autocomplete="new-password"
                placeholder="At least 12 characters"
                required
                phx-debounce="blur"
              />
              <p :for={msg <- Enum.map(@form[:password].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>

            <label style="display: flex; align-items: flex-start; gap: var(--spacing-2); font-size: 0.8125rem; color: var(--on-surface-variant); cursor: pointer;">
              <input type="checkbox" name="user[terms]" value="true" checked={@terms_accepted} required style="margin-top: 2px;" />
              <span>I agree to the <a href="/terms" style="color: var(--primary); text-decoration: none; font-weight: 600;">Terms of Service</a> and <a href="/privacy" style="color: var(--primary); text-decoration: none; font-weight: 600;">Privacy Policy</a></span>
            </label>

            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;" phx-disable-with="Creating account...">
              Create account
            </button>
          </div>
        </.form>
      </div>
    </div>
    """
  end

  @impl true
  def mount(_params, _session, %{assigns: %{current_scope: %{user: user}}} = socket)
      when not is_nil(user) do
    {:ok, redirect(socket, to: HeyiAmAppWeb.UserAuth.signed_in_path(socket))}
  end

  def mount(params, _session, %{assigns: %{current_scope: nil}} = socket) do
    do_mount(params, socket)
  end

  def mount(params, _session, socket) do
    do_mount(params, socket)
  end

  defp do_mount(params, socket) do
    preferred_username = params["username"]
    initial_attrs = if preferred_username, do: %{"username" => preferred_username}, else: %{}
    changeset = Ecto.Changeset.cast(%User{}, initial_attrs, [:email, :password, :username])

    # Check availability of pre-filled username
    username_availability =
      if preferred_username && String.length(preferred_username) >= 3 do
        check = Accounts.change_user_username(%User{}, %{username: preferred_username})
        if check.valid?, do: :available, else: :taken
      end

    {:ok,
     socket
     |> assign(:terms_accepted, false)
     |> assign(:device_code, params["device_code"])
     |> assign(:preferred_username, preferred_username)
     |> assign(:show_username, preferred_username != nil)
     |> assign(:username_availability, username_availability)
     |> assign_form(changeset),
     temporary_assigns: [form: nil]}
  end

  @impl true
  def handle_event("validate", %{"user" => user_params}, socket) do
    terms_accepted = Map.get(user_params, "terms") == "true"
    username = Map.get(user_params, "username", "")

    changeset =
      %User{}
      |> Ecto.Changeset.cast(user_params, [:email, :password, :username])
      |> Ecto.Changeset.validate_required([:email])
      |> Ecto.Changeset.validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must have the @ sign and no spaces")
      |> Ecto.Changeset.validate_length(:email, max: 160)
      |> Ecto.Changeset.validate_length(:password, min: 12, max: 72)
      |> Map.put(:action, :validate)

    # Check username availability using the same logic as ClaimUsernameLive
    username_availability =
      if socket.assigns.show_username && String.length(username) >= 3 do
        username_changeset = Accounts.change_user_username(%User{}, %{username: username})
        if username_changeset.valid?, do: :available, else: :taken
      end

    {:noreply,
     socket
     |> assign(:terms_accepted, terms_accepted)
     |> assign(:username_availability, username_availability)
     |> assign_form(changeset)}
  end

  defp assign_form(socket, %Ecto.Changeset{} = changeset) do
    form = to_form(changeset, as: "user")
    assign(socket, form: form)
  end

  defp registration_params(assigns) do
    params = %{}
    params = if assigns[:device_code], do: Map.put(params, "device_code", assigns.device_code), else: params
    params = if assigns[:preferred_username], do: Map.put(params, "username", assigns.preferred_username), else: params
    params
  end
end
