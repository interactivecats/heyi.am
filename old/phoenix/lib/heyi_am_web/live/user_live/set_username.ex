defmodule HeyiAmWeb.UserLive.SetUsername do
  use HeyiAmWeb, :live_view

  alias HeyiAm.Accounts

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user

    if user.username do
      {:ok, redirect(socket, to: ~p"/#{user.username}/edit")}
    else
      changeset = Accounts.User.profile_changeset(user, %{})

      {:ok,
       socket
       |> assign(:user, user)
       |> assign(:page_title, "Choose your username")
       |> assign_form(changeset)}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash} current_scope={@current_scope}>
      <div class="auth-page">
        <div class="auth-title">Pick your <em>permanent</em> URL</div>
        <div class="auth-subtitle">
          This is how the world finds your work. Choose a handle that's yours.
        </div>

        <.form for={@form} id="username_form" phx-submit="save" phx-change="validate">
          <div class="username-input-row">
            <span class="username-prefix">heyi.am/</span>
            <input
              class="username-input"
              type="text"
              name={@form[:username].name}
              id={@form[:username].id}
              value={@form[:username].value}
              autocomplete="username"
              spellcheck="false"
              placeholder="username"
              required
              phx-mounted={JS.focus()}
            />
          </div>

          <%= if @form[:username].value && @form[:username].value != "" do %>
            <% username_errors = Keyword.get_values(@form.errors, :username) %>
            <%= if username_errors != [] do %>
              <div class="username-check username-check--taken">
                <%= for {msg, opts} <- username_errors do %>
                  <span>{translate_error({msg, opts})}</span>
                <% end %>
              </div>
            <% else %>
              <div class="username-check username-check--ok">
                &#10003; heyi.am/<%= @form[:username].value %> is available
              </div>
            <% end %>
          <% else %>
            <div class="username-check">&nbsp;</div>
          <% end %>

          <div class="username-protocol-note">
            <strong>Protocol note</strong>
            <p>
              3–24 characters. Letters, numbers, underscores, and periods only.
              This cannot be changed later.
            </p>
          </div>

          <button type="submit" class="auth-btn auth-btn--primary">
            Claim &amp; Continue
          </button>
        </.form>
      </div>
    </Layouts.app>
    """
  end

  @impl true
  def handle_event("validate", %{"user" => params}, socket) do
    changeset =
      Accounts.User.profile_changeset(socket.assigns.user, params)
      |> Map.put(:action, :validate)

    {:noreply, assign_form(socket, changeset)}
  end

  @impl true
  def handle_event("save", %{"user" => %{"username" => username}}, socket) do
    case Accounts.update_profile(socket.assigns.user, %{"username" => username}) do
      {:ok, user} ->
        {:noreply, redirect(socket, to: ~p"/#{user.username}/edit")}

      {:error, changeset} ->
        {:noreply, assign_form(socket, changeset)}
    end
  end

  defp assign_form(socket, %Ecto.Changeset{} = changeset) do
    assign(socket, :form, to_form(changeset, as: "user"))
  end
end
