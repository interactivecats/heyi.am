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

        <.form for={@form} id="registration_form" phx-submit="save" phx-change="validate">
          <div class="stack stack--md">
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
                class={["auth-input", @form[:password].errors != [] && "auth-input--error"]}
                autocomplete="new-password"
                placeholder="At least 12 characters"
                required
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

  def mount(_params, _session, %{assigns: %{current_scope: nil}} = socket) do
    changeset = Accounts.change_user_email(%User{}, %{}, validate_unique: false)
    {:ok, socket |> assign(:terms_accepted, false) |> assign_form(changeset), temporary_assigns: [form: nil]}
  end

  def mount(_params, _session, socket) do
    changeset = Accounts.change_user_email(%User{}, %{}, validate_unique: false)
    {:ok, socket |> assign(:terms_accepted, false) |> assign_form(changeset), temporary_assigns: [form: nil]}
  end

  @impl true
  def handle_event("save", %{"user" => user_params}, socket) do
    case Accounts.register_user(user_params) do
      {:ok, user} ->
        {:ok, _} =
          Accounts.deliver_login_instructions(
            user,
            &url(~p"/users/log-in/#{&1}")
          )

        {:noreply,
         socket
         |> put_flash(:info, "Account created successfully!")
         |> push_navigate(to: ~p"/users/log-in")}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign_form(socket, changeset)}
    end
  end

  def handle_event("validate", %{"user" => user_params}, socket) do
    terms_accepted = Map.get(user_params, "terms") == "true"
    changeset = Accounts.change_user_email(%User{}, user_params, validate_unique: false)
    {:noreply, socket |> assign(:terms_accepted, terms_accepted) |> assign_form(Map.put(changeset, :action, :validate))}
  end

  defp assign_form(socket, %Ecto.Changeset{} = changeset) do
    form = to_form(changeset, as: "user")
    assign(socket, form: form)
  end
end
