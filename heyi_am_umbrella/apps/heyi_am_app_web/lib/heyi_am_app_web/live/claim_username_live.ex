defmodule HeyiAmAppWeb.ClaimUsernameLive do
  use HeyiAmAppWeb, :live_view

  alias HeyiAm.Accounts

  @mock_recent_claims [
    {"@mira-k", "2 min ago"},
    {"@zero-cool", "8 min ago"},
    {"@ada-dev", "14 min ago"},
    {"@rust-ninja", "27 min ago"},
    {"@juno-builds", "1 hr ago"}
  ]

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user

    if user.username do
      {:ok, push_navigate(socket, to: "/users/settings")}
    else
      changeset = Accounts.change_user_username(user, %{}, validate_unique: false)

      {:ok,
       socket
       |> assign(:page_title, "Claim your URL")
       |> assign(:user, user)
       |> assign(:recent_claims, @mock_recent_claims)
       |> assign(:availability, nil)
       |> assign_form(changeset)}
    end
  end

  @impl true
  def handle_event("validate", %{"user" => %{"username" => username}}, socket) do
    changeset =
      socket.assigns.user
      |> Accounts.change_user_username(%{username: username})
      |> Map.put(:action, :validate)

    availability =
      cond do
        String.length(username) < 3 -> nil
        changeset.valid? -> :available
        true -> :taken
      end

    {:noreply,
     socket
     |> assign(:availability, availability)
     |> assign_form(changeset)}
  end

  def handle_event("save", %{"user" => %{"username" => username}}, socket) do
    case Accounts.update_user_username(socket.assigns.user, %{username: username}) do
      {:ok, _user} ->
        {:noreply, push_navigate(socket, to: "/users/settings")}

      {:error, changeset} ->
        {:noreply, assign_form(socket, changeset)}
    end
  end

  defp assign_form(socket, changeset) do
    assign(socket, :form, to_form(changeset, as: "user"))
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="claim-username-layout">
      <aside class="claim-username-feed">
        <h3 class="label-md">Recently claimed</h3>
        <ul class="claim-feed-list">
          <li :for={{name, time} <- @recent_claims} class="claim-feed-item">
            <span class="claim-feed-name"><%= name %></span>
            <span class="claim-feed-time"><%= time %></span>
          </li>
        </ul>
      </aside>

      <main class="claim-username-center">
        <h1 class="display-sm">Pick your permanent URL</h1>
        <p class="body-md" style="color: var(--on-surface-variant); margin-block-end: var(--spacing-8);">
          This is your public portfolio address. It cannot be changed.
        </p>

        <.form for={@form} phx-change="validate" phx-submit="save" class="claim-username-form">
          <div class="claim-username-input-group">
            <span class="claim-username-prefix">heyi.am/</span>
            <.input
              field={@form[:username]}
              type="text"
              placeholder="your-name"
              autocomplete="off"
              spellcheck="false"
              phx-debounce="300"
            />
            <span
              :if={@availability == :available}
              class="claim-badge claim-badge--available"
            >
              AVAILABLE
            </span>
            <span
              :if={@availability == :taken}
              class="claim-badge claim-badge--taken"
            >
              TAKEN
            </span>
          </div>

          <.button
            class="btn btn-primary w-full"
            phx-disable-with="Claiming..."
            disabled={@availability != :available}
          >
            Claim &amp; Continue
          </.button>
        </.form>
      </main>

      <aside class="claim-username-note">
        <div class="card card-padded">
          <h3 class="label-md">Protocol note</h3>
          <p class="body-sm" style="color: var(--on-surface-variant);">
            Your username is permanently bound to your cryptographic identity.
            Published sessions are sealed to this URL. Changing it later would
            break verification chains and shared links.
          </p>
        </div>
      </aside>
    </div>
    """
  end
end
