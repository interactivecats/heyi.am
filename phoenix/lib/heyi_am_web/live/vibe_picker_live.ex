defmodule HeyiAmWeb.VibePickerLive do
  use HeyiAmWeb, :live_view

  alias HeyiAm.Accounts

  @templates [
    %{id: "editorial", name: "Editorial", desc: "Clean, centered layout. Data-focused with stats and timeline."},
    %{id: "terminal", name: "Terminal", desc: "Dark background, monospace green text. Hacker aesthetic."},
    %{id: "minimal", name: "Minimal", desc: "Extreme whitespace. No decoration, just content."},
    %{id: "brutalist", name: "Brutalist", desc: "Thick borders, zero radius. Bold and unapologetic."},
    %{id: "campfire", name: "Campfire", desc: "Warm cream tones, serif headings. Cozy and inviting."},
    %{id: "neon-night", name: "Neon Night", desc: "Deep navy with cyan and magenta accents. Electric."}
  ]

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user
    current_layout = user.portfolio_layout || "editorial"

    {:ok,
     socket
     |> assign(:page_title, "Choose your vibe")
     |> assign(:user, user)
     |> assign(:templates, @templates)
     |> assign(:selected, current_layout)}
  end

  @impl true
  def handle_event("select", %{"template" => template_id}, socket) do
    {:noreply, assign(socket, :selected, template_id)}
  end

  def handle_event("save", _params, socket) do
    user = socket.assigns.user
    selected = socket.assigns.selected

    case Accounts.update_user_profile(user, %{portfolio_layout: normalize_layout(selected)}) do
      {:ok, user} ->
        path = if user.username, do: "/#{user.username}", else: "/"
        {:noreply, push_navigate(socket, to: path)}

      {:error, _changeset} ->
        {:noreply, put_flash(socket, :error, "Could not save template.")}
    end
  end

  # Map display IDs to DB values
  defp normalize_layout("neon-night"), do: "verbose"
  defp normalize_layout("campfire"), do: "timeline"
  defp normalize_layout("terminal"), do: "minimal"
  defp normalize_layout("brutalist"), do: "editorial"
  defp normalize_layout(other), do: other

  @impl true
  def render(assigns) do
    ~H"""
    <div class="vibe-picker-layout">
      <div class="vibe-picker-main">
        <h1 class="display-sm">Choose your vibe</h1>
        <p class="body-md" style="color: var(--on-surface-variant); margin-block-end: var(--spacing-8);">
          Pick a template for your portfolio. You can change this anytime.
        </p>

        <div class="vibe-grid">
          <button
            :for={template <- @templates}
            class={["vibe-card", @selected == template.id && "vibe-card--selected"]}
            phx-click="select"
            phx-value-template={template.id}
          >
            <div class={"vibe-preview vibe-preview--#{template.id}"}>
              <div class="vibe-preview-bar"></div>
              <div class="vibe-preview-line vibe-preview-line--wide"></div>
              <div class="vibe-preview-line vibe-preview-line--medium"></div>
              <div class="vibe-preview-line vibe-preview-line--short"></div>
            </div>
            <div class="vibe-card-info">
              <span class="label-md"><%= template.name %></span>
              <span class="body-sm" style="color: var(--on-surface-variant);"><%= template.desc %></span>
            </div>
          </button>
        </div>

        <button class="btn btn-primary w-full" phx-click="save" style="margin-block-start: var(--spacing-8);">
          Save &amp; Deploy
        </button>
      </div>

      <aside class="vibe-preview-panel">
        <div class="label-md" style="margin-block-end: var(--spacing-4);">Preview</div>
        <div class={"vibe-live-preview vibe-live-preview--#{@selected}"}>
          <div class="vibe-lp-header"></div>
          <div class="vibe-lp-title"></div>
          <div class="vibe-lp-stats">
            <div class="vibe-lp-stat"></div>
            <div class="vibe-lp-stat"></div>
            <div class="vibe-lp-stat"></div>
          </div>
          <div class="vibe-lp-content">
            <div class="vibe-lp-line"></div>
            <div class="vibe-lp-line"></div>
            <div class="vibe-lp-line vibe-lp-line--short"></div>
          </div>
          <div class="vibe-lp-card"></div>
        </div>
      </aside>
    </div>
    """
  end
end
