defmodule HeyiAmAppWeb.UserLive.ResetPassword do
  use HeyiAmAppWeb, :live_view

  alias HeyiAm.Accounts

  @impl true
  def render(assigns) do
    ~H"""
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-card-header">
          <h1 class="headline-lg" style="margin-block-end: var(--spacing-2);">Reset password</h1>
          <p class="body-sm" style="color: var(--on-surface-variant);">
            Enter your new password below.
          </p>
        </div>

        <.form for={@form} id="reset_password_form" phx-submit="reset_password" phx-change="validate">
          <div class="stack stack--md">
            <div class="auth-field">
              <label for="user_password" class="auth-label">New password</label>
              <input
                type="password"
                name={@form[:password].name}
                id="user_password"
                class={["auth-input", @form[:password].errors != [] && "auth-input--error"]}
                autocomplete="new-password"
                placeholder="At least 12 characters"
                required
                phx-mounted={JS.focus()}
              />
              <p :for={msg <- Enum.map(@form[:password].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>
            <div class="auth-field">
              <label for="user_password_confirmation" class="auth-label">Confirm new password</label>
              <input
                type="password"
                name={@form[:password_confirmation].name}
                id="user_password_confirmation"
                class={["auth-input", @form[:password_confirmation].errors != [] && "auth-input--error"]}
                autocomplete="new-password"
              />
              <p :for={msg <- Enum.map(@form[:password_confirmation].errors, &HeyiAmAppWeb.CoreComponents.translate_error/1)} class="auth-error">{msg}</p>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;" phx-disable-with="Resetting...">
              Reset password
            </button>
          </div>
        </.form>

        <div class="auth-link">
          <.link navigate={~p"/users/log-in"} style="color: var(--primary); text-decoration: none; font-weight: 600;">
            Back to log in
          </.link>
        </div>
      </div>
    </div>
    """
  end

  @impl true
  def mount(%{"token" => token}, _session, socket) do
    if user = Accounts.get_user_by_reset_password_token(token) do
      changeset = Accounts.change_user_password(user, %{}, hash_password: false)

      {:ok,
       socket
       |> assign(:user, user)
       |> assign(:token, token)
       |> assign_form(changeset),
       temporary_assigns: [form: nil]}
    else
      {:ok,
       socket
       |> put_flash(:error, "Reset password link is invalid or it has expired.")
       |> push_navigate(to: ~p"/users/log-in")}
    end
  end

  @impl true
  def handle_event("validate", %{"user" => user_params}, socket) do
    changeset =
      socket.assigns.user
      |> Accounts.change_user_password(user_params, hash_password: false)
      |> Map.put(:action, :validate)

    {:noreply, assign_form(socket, changeset)}
  end

  def handle_event("reset_password", %{"user" => user_params}, socket) do
    case Accounts.reset_user_password(socket.assigns.user, user_params) do
      {:ok, _user} ->
        {:noreply,
         socket
         |> put_flash(:info, "Password reset successfully.")
         |> push_navigate(to: ~p"/users/log-in")}

      {:error, changeset} ->
        {:noreply, assign_form(socket, changeset)}
    end
  end

  defp assign_form(socket, %Ecto.Changeset{} = changeset) do
    assign(socket, form: to_form(changeset, as: "user"))
  end
end
