defmodule HeyiAmAppWeb.UserLive.Settings do
  use HeyiAmAppWeb, :live_view

  on_mount {HeyiAmAppWeb.UserAuth, :require_sudo_mode}

  alias HeyiAm.Accounts

  @impl true
  def render(assigns) do
    ~H"""
    <div class="auth-page">
      <div class="auth-card" style="max-width: 32rem;">
        <div class="auth-card-header">
          <h1 class="headline-lg" style="margin-block-end: var(--spacing-2);">Account Settings</h1>
          <p class="body-sm" style="color: var(--on-surface-variant);">
            Manage your account email address and password settings
          </p>
        </div>

        <.form for={@email_form} id="email_form" phx-submit="update_email" phx-change="validate_email">
          <div class="stack stack--md">
            <div class="auth-field">
              <label for="user_email" class="auth-label">Email</label>
              <input
                type="email"
                name={@email_form[:email].name}
                id="user_email"
                value={Phoenix.HTML.Form.normalize_value("email", @email_form[:email].value)}
                class={["auth-input", @email_form[:email].errors != [] && "auth-input--error"]}
                autocomplete="username"
                spellcheck="false"
                required
              />
              <p :for={msg <- Enum.map(@email_form[:email].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">
              Change Email
            </button>
          </div>
        </.form>

        <div class="auth-divider">password</div>

        <.form
          for={@password_form}
          id="password_form"
          action={~p"/users/update-password"}
          method="post"
          phx-change="validate_password"
          phx-submit="update_password"
          phx-trigger-action={@trigger_submit}
        >
          <input
            name={@password_form[:email].name}
            type="hidden"
            id="hidden_user_email"
            spellcheck="false"
            value={@current_email}
          />
          <div class="stack stack--md">
            <div class="auth-field">
              <label for="user_password" class="auth-label">New password</label>
              <input
                type="password"
                name={@password_form[:password].name}
                id="user_password"
                class={["auth-input", @password_form[:password].errors != [] && "auth-input--error"]}
                autocomplete="new-password"
                spellcheck="false"
                required
              />
              <p :for={msg <- Enum.map(@password_form[:password].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>
            <div class="auth-field">
              <label for="user_password_confirmation" class="auth-label">Confirm new password</label>
              <input
                type="password"
                name={@password_form[:password_confirmation].name}
                id="user_password_confirmation"
                class={["auth-input", @password_form[:password_confirmation].errors != [] && "auth-input--error"]}
                autocomplete="new-password"
                spellcheck="false"
              />
              <p :for={msg <- Enum.map(@password_form[:password_confirmation].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">
              Save Password
            </button>
          </div>
        </.form>

        <div class="auth-divider">your data</div>

        <p class="body-sm" style="color: var(--on-surface-variant);">
          Download a copy of all data associated with your account.
        </p>

        <a href={~p"/users/settings/export"} download class="btn btn-secondary" style="width: 100%; justify-content: center; text-decoration: none;">
          Download data export
        </a>

        <div class="auth-divider">danger zone</div>

        <p class="body-sm" style="color: var(--on-surface-variant);">
          Permanently delete your account and all associated data. This cannot be undone.
          Your username <strong>{@current_scope.user.username || @current_scope.user.email}</strong> will be released.
        </p>

        <form action={~p"/users/settings/delete-account"} method="post">
          <input type="hidden" name="_csrf_token" value={Phoenix.Controller.get_csrf_token()} />
          <input type="hidden" name="_method" value="delete" />
          <div class="stack stack--md">
            <div class="auth-field">
              <label for="confirm_username" class="auth-label">
                Type your username ({@current_scope.user.username || @current_scope.user.email}) to confirm
              </label>
              <input
                type="text"
                name="username"
                id="confirm_username"
                class="auth-input"
                autocomplete="off"
                required
              />
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; background-color: var(--error); border-color: var(--error);">
              Delete my account
            </button>
          </div>
        </form>
      </div>
    </div>
    """
  end

  @impl true
  def mount(%{"token" => token}, _session, socket) do
    socket =
      case Accounts.update_user_email(socket.assigns.current_scope.user, token) do
        {:ok, _user} ->
          put_flash(socket, :info, "Email changed successfully.")

        {:error, _} ->
          put_flash(socket, :error, "Email change link is invalid or it has expired.")
      end

    {:ok, push_navigate(socket, to: ~p"/users/settings")}
  end

  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user
    email_changeset = Accounts.change_user_email(user, %{}, validate_unique: false)
    password_changeset = Accounts.change_user_password(user, %{}, hash_password: false)

    socket =
      socket
      |> assign(:current_email, user.email)
      |> assign(:email_form, to_form(email_changeset))
      |> assign(:password_form, to_form(password_changeset))
      |> assign(:trigger_submit, false)

    {:ok, socket}
  end

  @impl true
  def handle_event("validate_email", params, socket) do
    %{"user" => user_params} = params

    email_form =
      socket.assigns.current_scope.user
      |> Accounts.change_user_email(user_params, validate_unique: false)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, email_form: email_form)}
  end

  def handle_event("update_email", params, socket) do
    %{"user" => user_params} = params
    user = socket.assigns.current_scope.user

    if Accounts.sudo_mode?(user) do
      case Accounts.change_user_email(user, user_params) do
        %{valid?: true} = changeset ->
          Accounts.deliver_user_update_email_instructions(
            Ecto.Changeset.apply_action!(changeset, :insert),
            user.email,
            &url(~p"/users/settings/confirm-email/#{&1}")
          )

          info = "A link to confirm your email change has been sent to the new address."
          {:noreply, socket |> put_flash(:info, info)}

        changeset ->
          {:noreply, assign(socket, :email_form, to_form(changeset, action: :insert))}
      end
    else
      {:noreply, redirect_to_reauth(socket)}
    end
  end

  def handle_event("validate_password", params, socket) do
    %{"user" => user_params} = params

    password_form =
      socket.assigns.current_scope.user
      |> Accounts.change_user_password(user_params, hash_password: false)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, password_form: password_form)}
  end

  def handle_event("update_password", params, socket) do
    %{"user" => user_params} = params
    user = socket.assigns.current_scope.user

    if Accounts.sudo_mode?(user) do
      case Accounts.change_user_password(user, user_params) do
        %{valid?: true} = changeset ->
          {:noreply, assign(socket, trigger_submit: true, password_form: to_form(changeset))}

        changeset ->
          {:noreply, assign(socket, password_form: to_form(changeset, action: :insert))}
      end
    else
      {:noreply, redirect_to_reauth(socket)}
    end
  end

  defp redirect_to_reauth(socket) do
    socket
    |> put_flash(:error, "You must re-authenticate to perform this action.")
    |> Phoenix.LiveView.redirect(to: ~p"/users/log-in")
  end
end
