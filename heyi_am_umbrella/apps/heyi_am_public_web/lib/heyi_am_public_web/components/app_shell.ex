defmodule HeyiAmPublicWeb.AppShell do
  @moduledoc """
  App shell component providing the public layout shell for visitor-facing pages.
  """
  use Phoenix.Component

  attr :logo_text, :string, default: "heyi.am"
  attr :logo_href, :string, default: "/"
  attr :current_page, :string, default: nil
  attr :class, :string, default: nil

  slot :nav_item do
    attr :href, :string, required: true
    attr :label, :string, required: true
  end

  slot :status
  slot :inner_block, required: true

  def public_shell(assigns) do
    ~H"""
    <div class="public-shell">
      <header class="topbar" role="banner">
        <div class="topbar-left">
          <a href={@logo_href} class="topbar-logo">
            {@logo_text}
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

      <aside style="margin-block-start: var(--spacing-8); padding-block: var(--spacing-6); background: var(--surface-container, #f0f2f5); text-align: center;">
        <div style="max-width: var(--content-max-width); margin-inline: auto; padding-inline: var(--spacing-6);">
          <p class="body-sm" style="color: var(--on-surface-variant); margin: 0 0 0.25rem 0;">
            AI coding creates invisible work.
          </p>
          <a
            href="/"
            style="color: var(--primary, #084471); font-weight: 600; text-decoration: none; font-size: 0.875rem;"
          >
            Turn yours into proof &rarr;
          </a>
        </div>
      </aside>

      <footer style="border-top: 1px solid var(--outline-variant); padding-block: var(--spacing-6);">
        <div style="max-width: var(--content-max-width); margin-inline: auto; padding-inline: var(--spacing-6); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--spacing-4);">
          <span class="label-sm" style="color: var(--on-surface-variant);">
            heyi.am
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
