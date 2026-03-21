defmodule HeyiAmWeb.DeviceAuthLive do
  use HeyiAmWeb, :live_view

  alias HeyiAm.Accounts

  @max_failed_attempts 5

  @impl true
  def mount(params, _session, socket) do
    socket =
      socket
      |> assign(:page_title, "Authorize Device")
      |> assign(:user_code, "")
      |> assign(:status, nil)
      |> assign(:error_message, nil)

    # Auto-fill from ?code= param (e.g., CLI opens /device?code=ABCD-1234)
    socket =
      case params["code"] do
        code when is_binary(code) and code != "" ->
          lookup_code(socket, code)

        _ ->
          socket
      end

    {:ok, socket}
  end

  @impl true
  def handle_event("validate", %{"user_code" => code}, socket) do
    {:noreply, assign(socket, :user_code, code)}
  end

  def handle_event("lookup", %{"user_code" => code}, socket) do
    {:noreply, lookup_code(socket, code)}
  end

  def handle_event("confirm_authorize", _params, socket) do
    user = socket.assigns.current_scope.user

    case Accounts.authorize_device_code(socket.assigns.user_code, user) do
      {:ok, _dc} ->
        {:noreply,
         socket
         |> assign(:status, :success)
         |> assign(:error_message, nil)}

      {:error, :not_found} ->
        {:noreply,
         socket
         |> assign(:status, :error)
         |> assign(:error_message, "Code expired while confirming. Please try again.")}
    end
  end

  def handle_event("cancel", _params, socket) do
    {:noreply,
     socket
     |> assign(:status, nil)
     |> assign(:user_code, "")
     |> assign(:error_message, nil)}
  end

  defp lookup_code(socket, code) do
    # Server-side rate limit using Hammer — survives page reloads
    user = socket.assigns.current_scope.user
    bucket = "device_auth_lookup:#{user.id}"

    case Hammer.check_rate(bucket, 300_000, @max_failed_attempts) do
      {:deny, _} ->
        socket
        |> assign(:status, :error)
        |> assign(:error_message, "Too many failed attempts. Please wait a few minutes and try again.")

      {:allow, _} ->
        user_code = code |> String.trim() |> String.upcase()

        case Accounts.DeviceCode.by_user_code_query(user_code) |> HeyiAm.Repo.one() do
          nil ->
            socket
            |> assign(:status, :error)
            |> assign(:error_message, "Code not found or expired. Check and try again.")

          _dc ->
            socket
            |> assign(:status, :confirm)
            |> assign(:user_code, user_code)
            |> assign(:error_message, nil)
        end
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div style="display: flex; justify-content: center; align-items: center; min-height: 80vh; padding: var(--spacing-6);">
      <main style="max-width: 420px; width: 100%; text-align: center;">
        <h1 class="display-sm">Authorize Device</h1>

        <%= case @status do %>
          <% :success -> %>
            <div style="text-align: center; padding: var(--spacing-8) 0;">
              <div style="color: var(--primary); margin-bottom: var(--spacing-4);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 class="text-headline">Device Authorized</h2>
              <p class="body-md" style="color: var(--on-surface-variant); margin-top: var(--spacing-2);">
                You can close this tab and return to your terminal.
              </p>
            </div>

          <% :confirm -> %>
            <div style="padding: var(--spacing-6) 0;">
              <div class="card card-padded" style="text-align: center;">
                <p class="body-md" style="color: var(--on-surface-variant); margin-bottom: var(--spacing-4);">
                  A device is requesting access to your account.
                  Only proceed if <strong>you</strong> initiated this from your own terminal.
                </p>
                <div style="font-family: var(--font-mono); font-size: 0.875rem; color: var(--on-surface-variant); margin-bottom: var(--spacing-4);">
                  Signed in as <strong>{@current_scope.user.username || @current_scope.user.email}</strong>
                </div>
                <div style="display: flex; gap: var(--spacing-3); justify-content: center;">
                  <.button
                    class="btn btn-primary"
                    phx-click="confirm_authorize"
                    phx-disable-with="Authorizing..."
                  >
                    Authorize Device
                  </.button>
                  <.button
                    class="btn btn-secondary"
                    phx-click="cancel"
                  >
                    Cancel
                  </.button>
                </div>
              </div>
            </div>

          <% _ -> %>
            <p class="body-md" style="color: var(--on-surface-variant); margin-block-end: var(--spacing-6);">
              Enter the code shown in your terminal or CLI to link this device to your account.
            </p>

            <form phx-change="validate" phx-submit="lookup">
              <div class="claim-username-input-group">
                <input
                  type="text"
                  name="user_code"
                  value={@user_code}
                  placeholder="XXXX-XXXX"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="9"
                  class="input"
                  style="text-align: center; font-size: 1.5rem; letter-spacing: 0.15em; text-transform: uppercase; font-family: var(--font-mono);"
                />
              </div>

              <%= if @status == :error do %>
                <p class="body-sm" style="color: var(--error); margin-top: var(--spacing-3);">
                  {@error_message}
                </p>
              <% end %>

              <.button
                class="btn btn-primary w-full"
                phx-disable-with="Checking..."
                style="margin-top: var(--spacing-4);"
              >
                Continue
              </.button>
            </form>
        <% end %>
      </main>
    </div>
    """
  end
end
