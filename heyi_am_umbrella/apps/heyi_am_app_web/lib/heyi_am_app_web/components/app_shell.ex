defmodule HeyiAmAppWeb.AppShell do
  @moduledoc """
  App shell component for the app_web layout (auth/settings pages).
  Provides a simple centered layout with topbar.
  """
  use Phoenix.Component

  attr :logo_text, :string, default: "heyiam"
  attr :logo_href, :string, default: "/"
  attr :current_page, :string, default: nil
  attr :class, :string, default: nil

  slot :nav_item do
    attr :href, :string, required: true
    attr :label, :string, required: true
  end

  slot :status
  slot :inner_block, required: true

  def app_shell(assigns) do
    ~H"""
    <div class="public-shell">
      <header class="topbar" role="banner">
        <div class="topbar-left">
          <a href={@logo_href} class="topbar-logo">
            <svg class="topbar-logo-mark" viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <line x1="10" y1="25" x2="40" y2="25" stroke="#084471" stroke-width="1" opacity="0.15"/>
              <line x1="160" y1="25" x2="190" y2="25" stroke="#084471" stroke-width="1" opacity="0.15"/>
              <circle cx="30" cy="25" r="3" fill="#084471" opacity="0.5"/>
              <path d="M 30 25 C 45 25, 45 5, 60 5 L 140 5 C 155 5, 155 25, 170 25" fill="none" stroke="#7c3aed" stroke-width="1.5" opacity="0.5"/>
              <path d="M 30 25 C 42 25, 42 12, 54 12 L 130 12 C 142 12, 142 25, 154 25" fill="none" stroke="#0891b2" stroke-width="1.5" opacity="0.5"/>
              <path d="M 30 25 C 40 25, 40 38, 50 38 L 135 38 C 145 38, 145 25, 155 25" fill="none" stroke="#059669" stroke-width="1.5" opacity="0.5"/>
              <path d="M 30 25 C 45 25, 45 45, 60 45 L 145 45 C 160 45, 160 25, 175 25" fill="none" stroke="#e11d48" stroke-width="1.5" opacity="0.45"/>
              <circle cx="170" cy="25" r="3" fill="#084471" opacity="0.5"/>
              <text x="100" y="29" text-anchor="middle" font-family="'Space Grotesk', sans-serif" font-size="16" font-weight="700" fill="#084471" opacity="0.85">heyi.am</text>
            </svg>
          </a>
          <nav :if={@nav_item != []} aria-label="Main navigation">
            <ul class="topbar-nav">
              <li :for={item <- @nav_item}>
                <a
                  href={item.href}
                  class="topbar-nav-link"
                  aria-current={if item.label == @current_page, do: "page"}
                >
                  {item.label}
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div class="topbar-actions">
          {render_slot(@status)}
        </div>
      </header>

      <main class={["public-shell-main", @class]}>
        {render_slot(@inner_block)}
      </main>

      <footer style="border-top: 1px solid var(--outline-variant); padding-block: var(--spacing-6);">
        <div style="max-width: var(--content-max-width); margin-inline: auto; padding-inline: var(--spacing-6); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--spacing-4);">
          <span class="label-sm" style="color: var(--on-surface-variant);">
            heyiam
          </span>
          <nav aria-label="Footer" style="display: flex; gap: var(--spacing-6);">
            <a href="/terms" class="label-sm" style="color: var(--on-surface-variant); text-decoration: none;">Terms</a>
            <a href="/privacy" class="label-sm" style="color: var(--on-surface-variant); text-decoration: none;">Privacy</a>
          </nav>
        </div>
      </footer>
    </div>
    """
  end
end
