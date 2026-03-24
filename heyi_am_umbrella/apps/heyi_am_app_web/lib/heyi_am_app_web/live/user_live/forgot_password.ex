defmodule HeyiAmAppWeb.UserLive.ForgotPassword do
  use HeyiAmAppWeb, :live_view

  alias HeyiAm.Accounts

  @impl true
  def render(assigns) do
    ~H"""
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-card-header">
          <h1 class="headline-lg" style="margin-block-end: var(--spacing-2);">Forgot your password?</h1>
          <p class="body-sm" style="color: var(--on-surface-variant);">
            We'll send a password reset link to your inbox.
          </p>
        </div>

        <.form for={@form} id="reset_password_form" phx-submit="send_email">
          <div class="stack stack--md">
            <div class="auth-field">
              <label for="user_email" class="auth-label">Email</label>
              <input
                type="email"
                name={@form[:email].name}
                id="user_email"
                value={Phoenix.HTML.Form.normalize_value("email", @form[:email].value)}
                class="auth-input"
                autocomplete="username"
                spellcheck="false"
                required
                placeholder="you@example.com"
                phx-mounted={JS.focus()}
              />
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;" phx-disable-with="Sending...">
              Send reset link
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
  def mount(_params, _session, socket) do
    {:ok, assign(socket, form: to_form(%{"email" => ""}, as: "user"))}
  end

  @impl true
  def handle_event("send_email", %{"user" => %{"email" => email}}, socket) do
    if user = Accounts.get_user_by_email(email) do
      Accounts.deliver_user_reset_password_instructions(
        user,
        &url(~p"/users/reset-password/#{&1}")
      )
    end

    info =
      "If your email is in our system, you will receive password reset instructions shortly."

    {:noreply,
     socket
     |> put_flash(:info, info)
     |> push_navigate(to: ~p"/users/log-in")}
  end
end
