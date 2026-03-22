defmodule HeyiAmWeb.VibePickerLive do
  use HeyiAmWeb, :live_view

  alias HeyiAm.Accounts

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user

    {:ok,
     socket
     |> assign(:page_title, "Choose your vibe")
     |> assign(:user, user)}
  end

  @impl true
  def handle_event("save", _params, socket) do
    user = socket.assigns.user

    case Accounts.update_user_profile(user, %{portfolio_layout: "editorial"}) do
      {:ok, user} ->
        path = if user.username, do: "/#{user.username}", else: "/"
        {:noreply, push_navigate(socket, to: path)}

      {:error, _changeset} ->
        {:noreply, put_flash(socket, :error, "Could not save template.")}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="vibe-picker-layout">
      <nav class="onboarding-steps">
        <span class="label-md" style="display: block; margin-block-end: var(--spacing-4);">Setup Progress</span>
        <ol style="list-style: none; padding: 0; margin: 0;">
          <li style="display: flex; align-items: center; gap: var(--spacing-3); margin-block-end: var(--spacing-3);">
            <span style="width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--primary); color: var(--on-primary); font-family: var(--font-mono); font-size: 0.6875rem; display: flex; align-items: center; justify-content: center;">&#10003;</span>
            <span class="body-sm" style="color: var(--on-surface-variant);">Claim your URL</span>
          </li>
          <li style="display: flex; align-items: center; gap: var(--spacing-3); margin-block-end: var(--spacing-3);">
            <span style="width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--primary); color: var(--on-primary); font-family: var(--font-mono); font-size: 0.6875rem; display: flex; align-items: center; justify-content: center;">2</span>
            <span class="body-sm" style="font-weight: 600;">Choose your vibe</span>
          </li>
          <li style="display: flex; align-items: center; gap: var(--spacing-3);">
            <span style="width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--surface-container-low); color: var(--on-surface-variant); font-family: var(--font-mono); font-size: 0.6875rem; display: flex; align-items: center; justify-content: center;">3</span>
            <span class="body-sm" style="color: var(--on-surface-variant);">Start building</span>
          </li>
        </ol>
      </nav>
      <div class="vibe-picker-main">
        <h1 class="display-sm">Your portfolio style</h1>
        <p class="body-md" style="color: var(--on-surface-variant); margin-block-end: var(--spacing-8);">
          Your portfolio uses the editorial template — clean typography, structured layout, signal-first.
        </p>

        <button class="btn btn-primary w-full" phx-click="save" style="margin-block-start: var(--spacing-8);">
          Continue
        </button>
      </div>
    </div>
    """
  end
end
